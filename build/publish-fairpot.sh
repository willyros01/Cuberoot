#!/usr/bin/env bash
# Publish the latest SUCCESSFUL Fairpot Android APK on Cuberoot.
# Uses the APK from the finished Actions run when authorized; otherwise
# rebuilds exactly that successful source commit. Never publish a failed build.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking latest Fairpot Android APK build report..."
curl -fsSL --retry 3 --retry-delay 2 \
  -H 'Cache-Control: no-cache' \
  'https://raw.githubusercontent.com/willyros01/fairpot/android/build/android-last-run.json' \
  -o "$TMP/result.json"

node - "$TMP/result.json" <<'JS'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (r.workflow !== 'Android APK test build' || r.branch !== 'android') {
  throw Error('Unexpected build report');
}
if (r.outcome === 'success' && (
    !Number.isSafeInteger(r.run_id) ||
    !/^[a-f0-9]{40}$/.test(r.source_sha || '') ||
    !r.jobs?.some(j => j.name === 'apk' && j.conclusion === 'success') ||
    !Number.isSafeInteger(r.artifact_id))) {
  throw Error('Success report is incomplete or unverified');
}
console.log('Fairpot APK outcome:', r.outcome, 'run:', r.run_id);
JS

OUTCOME="$(node -p "require(process.argv[1]).outcome" "$TMP/result.json")"
if [ "$OUTCOME" != 'success' ]; then
  echo "No successful APK to publish. Leaving the current website APK unchanged."
  exit 0
fi

RUN_ID="$(node -p "require(process.argv[1]).run_id" "$TMP/result.json")"
SHA="$(node -p "require(process.argv[1]).source_sha" "$TMP/result.json")"
ARTIFACT_ID="$(node -p "require(process.argv[1]).artifact_id" "$TMP/result.json")"

if [ -f downloads/fairpot-build.json ] && \
   RUN_ID="$RUN_ID" SHA="$SHA" node -e '
const r = require("./downloads/fairpot-build.json");
if (String(r.run_id) === process.env.RUN_ID &&
    r.source_sha === process.env.SHA) process.exit(0);
process.exit(1);
'; then
  echo "This successful APK run is already published."
  exit 0
fi

mkdir -p downloads
ORIGIN='github-actions-artifact'
echo "Fetching APK from successful run $RUN_ID, artifact $ARTIFACT_ID."
if curl -fsSL --retry 2 --retry-delay 2 \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "https://api.github.com/repos/willyros01/fairpot/actions/artifacts/$ARTIFACT_ID/zip" \
    -o "$TMP/artifact.zip" \
   && unzip -tqq "$TMP/artifact.zip" \
   && unzip -Z1 "$TMP/artifact.zip" | grep -Fxq 'app-debug.apk'; then
  unzip -p "$TMP/artifact.zip" app-debug.apk > "$TMP/app-debug.apk"
else
  echo "::warning title=Artifact unavailable::Rebuilding exact successful Fairpot commit $SHA."
  ORIGIN='rebuild-of-successful-source'
  git clone --depth 1 --branch android https://github.com/willyros01/fairpot.git "$TMP/fairpot"
  (
    cd "$TMP/fairpot"
    git fetch --depth 1 origin "$SHA"
    git checkout --detach "$SHA"
    test "$(git rev-parse HEAD)" = "$SHA"
    bash build/android-build.sh
  )
  cp "$TMP/fairpot/android/app/build/outputs/apk/debug/app-debug.apk" "$TMP/app-debug.apk"
fi

test -s "$TMP/app-debug.apk"
test "$(stat -c%s "$TMP/app-debug.apk")" -gt 1000000
unzip -tqq "$TMP/app-debug.apk"
unzip -Z1 "$TMP/app-debug.apk" | grep -Fxq 'AndroidManifest.xml'

# Do not overwrite the new release with an older build while this job runs.
curl -fsSL --retry 2 -H 'Cache-Control: no-cache' \
  'https://raw.githubusercontent.com/willyros01/fairpot/android/build/android-last-run.json' \
  -o "$TMP/latest.json"
LATEST_SHA="$(node -p "require(process.argv[1]).source_sha" "$TMP/latest.json")"
if [ "$LATEST_SHA" != "$SHA" ]; then
  echo "::notice title=Newer build discovered::Skipping obsolete APK; next scheduled run will publish latest."
  exit 0
fi

install -m 0644 "$TMP/app-debug.apk" downloads/fairpot.apk
sha256sum downloads/fairpot.apk > downloads/fairpot.apk.sha256
RUN_ID="$RUN_ID" SHA="$SHA" ARTIFACT_ID="$ARTIFACT_ID" ORIGIN="$ORIGIN" node <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const apk = fs.readFileSync('downloads/fairpot.apk');
const release = {
  app: 'Fairpot',
  channel: 'android-debug-test',
  source_sha: process.env.SHA,
  run_id: Number(process.env.RUN_ID),
  artifact_id: Number(process.env.ARTIFACT_ID),
  origin: process.env.ORIGIN,
  apk_sha256: crypto.createHash('sha256').update(apk).digest('hex'),
  apk_bytes: apk.length,
  published_at: new Date().toISOString()
};
fs.writeFileSync('downloads/fairpot-build.json', JSON.stringify(release, null, 2) + '\n');
console.log('APK source:', release.origin, 'checksum:', release.apk_sha256);
JS

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/fairpot.apk downloads/fairpot.apk.sha256 downloads/fairpot-build.json
if git diff --cached --quiet; then
  echo "Identical APK already published."
else
  git commit -m "publish: Fairpot Android successful run $RUN_ID [skip ci]"
  git push origin HEAD:main
  echo "Published Fairpot Android APK to /downloads/fairpot.apk"
fi
