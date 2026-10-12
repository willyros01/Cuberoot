#!/usr/bin/env bash
# Publish the latest SUCCESSFUL Cloud Files Android APK on Cuberoot.
# Copies ONLY the exact successful APK artifact; never re-signs/rebuilds.
# A missing artifact is an error: keep the current APK rather than publish drift.
# Cloud Files publication starts only after signing secrets and the successful APK build.
# Dispatch publication for Fire HD 8 browser-launch fix, Android run 38314654572.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking latest Cloud Files Android APK build report..."
curl -fsSL --retry 3 --retry-delay 2 \
  -H 'Cache-Control: no-cache' \
  'https://raw.githubusercontent.com/willyros01/cloud-files/android/build/android-last-run.json' \
  -o "$TMP/result.json"

node - "$TMP/result.json" <<'JS'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (r.workflow !== 'Cloud Files Android APK test build' || r.branch !== 'android') {
  throw Error('Unexpected build report');
}
if (r.outcome === 'success' && (
    !Number.isSafeInteger(r.run_id) ||
    !/^[a-f0-9]{40}$/.test(r.source_sha || '') ||
    !r.jobs?.some(j => j.name === 'apk' && j.conclusion === 'success') ||
    !Number.isSafeInteger(r.artifact_id))) {
  throw Error('Success report is incomplete or unverified');
}
console.log('Cloud Files APK outcome:', r.outcome, 'run:', r.run_id);
JS

OUTCOME="$(node -p "require(process.argv[1]).outcome" "$TMP/result.json")"
if [ "$OUTCOME" != 'success' ]; then
  echo "No successful APK to publish. Leaving the current website APK unchanged."
  exit 0
fi

RUN_ID="$(node -p "require(process.argv[1]).run_id" "$TMP/result.json")"
SHA="$(node -p "require(process.argv[1]).source_sha" "$TMP/result.json")"
ARTIFACT_ID="$(node -p "require(process.argv[1]).artifact_id" "$TMP/result.json")"

if [ -f downloads/cloud-files-build.json ] && \
   RUN_ID="$RUN_ID" SHA="$SHA" node -e '
const r = require("./downloads/cloud-files-build.json");
if (String(r.run_id) === process.env.RUN_ID &&
    r.source_sha === process.env.SHA) process.exit(0);
process.exit(1);
'; then
  echo "This successful APK run is already published."
  exit 0
fi

mkdir -p downloads
ORIGIN='github-actions-artifact'
echo "Downloading the EXACT signed APK from successful Cloud Files run $RUN_ID, artifact $ARTIFACT_ID."
# Never rebuild in Cuberoot: rebuilding could sign with a different key.
curl -fsSL --retry 3 --retry-delay 3 \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/willyros01/cloud-files/actions/artifacts/$ARTIFACT_ID/zip" \
  -o "$TMP/artifact.zip"
unzip -tqq "$TMP/artifact.zip"
unzip -Z1 "$TMP/artifact.zip" | grep -Fx 'app-debug.apk' >/dev/null
unzip -p "$TMP/artifact.zip" app-debug.apk > "$TMP/app-debug.apk"

test -s "$TMP/app-debug.apk"
test "$(stat -c%s "$TMP/app-debug.apk")" -gt 1000000
unzip -tqq "$TMP/app-debug.apk"
unzip -Z1 "$TMP/app-debug.apk" | grep -Fx 'AndroidManifest.xml' >/dev/null
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
test -n "$SDK"
SIGNER="$(find "$SDK/build-tools" -name apksigner -type f | sort -V | tail -1)"
test -n "$SIGNER"
"$SIGNER" verify --verbose "$TMP/app-debug.apk" >/dev/null
SIGNER_SHA="$("$SIGNER" verify --print-certs "$TMP/app-debug.apk" | sed -n 's/^.*certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f')"
test -n "$SIGNER_SHA"
# New permanent-key APKs must keep the identical signer across publications.
if [ -f downloads/cloud-files-build.json ]; then
  PREV_SIGNER="$(node -p "require('./downloads/cloud-files-build.json').signer_sha256 || ''")"
  if [ -n "$PREV_SIGNER" ] && [ "$PREV_SIGNER" != "$SIGNER_SHA" ]; then
    echo "::error title=Signing key changed::Refusing to publish APK with mismatched certificate"
    exit 1
  fi
fi
echo "Verified published APK signer: $SIGNER_SHA"

# Do not overwrite the new release with an older build while this job runs.
curl -fsSL --retry 2 -H 'Cache-Control: no-cache' \
  'https://raw.githubusercontent.com/willyros01/cloud-files/android/build/android-last-run.json' \
  -o "$TMP/latest.json"
LATEST_SHA="$(node -p "require(process.argv[1]).source_sha" "$TMP/latest.json")"
if [ "$LATEST_SHA" != "$SHA" ]; then
  echo "::notice title=Newer build discovered::Skipping obsolete APK; next scheduled run will publish latest."
  exit 0
fi

install -m 0644 "$TMP/app-debug.apk" downloads/cloud-files.apk
sha256sum downloads/cloud-files.apk > downloads/cloud-files.apk.sha256
RUN_ID="$RUN_ID" SHA="$SHA" ARTIFACT_ID="$ARTIFACT_ID" ORIGIN="$ORIGIN" SIGNER_SHA="$SIGNER_SHA" node <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const apk = fs.readFileSync('downloads/cloud-files.apk');
const release = {
  app: 'Cloud Files',
  channel: 'android-debug-test',
  source_sha: process.env.SHA,
  run_id: Number(process.env.RUN_ID),
  artifact_id: Number(process.env.ARTIFACT_ID),
  origin: process.env.ORIGIN,
  apk_sha256: crypto.createHash('sha256').update(apk).digest('hex'),
  signer_sha256: process.env.SIGNER_SHA,
  apk_bytes: apk.length,
  published_at: new Date().toISOString()
};
fs.writeFileSync('downloads/cloud-files-build.json', JSON.stringify(release, null, 2) + '\n');
console.log('APK source:', release.origin, 'checksum:', release.apk_sha256);
JS

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/cloud-files.apk downloads/cloud-files.apk.sha256 downloads/cloud-files-build.json
if git diff --cached --quiet; then
  echo "Identical APK already published."
else
  git commit -m "publish: Cloud Files Android successful run $RUN_ID [skip ci]"
  if ! git push origin HEAD:main; then
    echo "::warning title=Git push conflict::Cuberoot changed while publishing; safely retrying once"
    git fetch origin main
    # Never overwrite an equal or newer published run after a concurrent update.
    REMOTE_RUN="$(git show origin/main:downloads/cloud-files-build.json 2>/dev/null | node -e '
let data = "";
process.stdin.on("data", x => data += x);
process.stdin.on("end", () => {
  try { process.stdout.write(String(JSON.parse(data).run_id || 0)); }
  catch (_) { process.stdout.write("0"); }
});
' )"
    if [ "$REMOTE_RUN" -ge "$RUN_ID" ]; then
      echo "An equal or newer APK build is already published."
      exit 0
    fi
    git rebase origin/main
    git push origin HEAD:main
  fi
  echo "Published Cloud Files Android APK to /downloads/cloud-files.apk"
fi
