#!/usr/bin/env bash
# Publish the latest SUCCESSFUL FIDUNIO Android APK on Cuberoot.

# Copies ONLY the exact successful APK artifact; never re-signs/rebuilds.
# A missing artifact is an error: keep the current APK rather than publish drift.
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking latest successful FIDUNIO Android signed APK workflow..."
API='https://api.github.com/repos/willyros01/hermes'
curl -fsSL --retry 3 --retry-delay 2 \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "$API/actions/workflows/android-apk.yml/runs?branch=Android&status=success&per_page=10" \
  -o "$TMP/runs.json"
RUN_ID="$(node - "$TMP/runs.json" <<'JS'
const fs=require('fs');
const q=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const run=(q.workflow_runs||[]).find(r=>r.name==='FIDUNIO Android signed APK'&&r.conclusion==='success'&&r.head_branch==='Android'&&/^[a-f0-9]{40}$/.test(r.head_sha||''));
console.log(run?.id||'');
JS
)"
if [ -z "$RUN_ID" ]; then echo "No successful FIDUNIO Android build yet."; exit 0; fi
curl -fsSL --retry 3 --retry-delay 2 \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "$API/actions/runs/$RUN_ID/artifacts?per_page=100" -o "$TMP/artifacts.json"
ARTIFACT_ID="$(node - "$TMP/artifacts.json" <<'JS'
const fs=require('fs'),q=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const a=(q.artifacts||[]).find(v=>v.name==='fidunio-android-signed-apk'&&!v.expired&&v.size_in_bytes>1000000);
if(!a)throw Error('Expected signed FIDUNIO Android artifact not found');
console.log(a.id);
JS
)"
RUN_ID="$RUN_ID" ARTIFACT_ID="$ARTIFACT_ID" node - "$TMP/runs.json" > "$TMP/result.json" <<'JS'
const fs=require('fs'),p=process.env;
const r=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).workflow_runs.find(x=>x.id===Number(p.RUN_ID));
if(!r||r.conclusion!=='success'||r.head_branch!=='Android')throw Error('Missing successful FIDUNIO run');
console.log(JSON.stringify({workflow:'FIDUNIO Android signed APK',branch:'Android',outcome:'success',
 run_id:r.id,source_sha:r.head_sha,artifact_id:Number(p.ARTIFACT_ID),
 jobs:[{name:'apk',conclusion:'success'}]},null,2));
JS

node - "$TMP/result.json" <<'JS'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (r.workflow !== 'FIDUNIO Android signed APK' || r.branch !== 'android') {
  throw Error('Unexpected build report');
}
if (r.outcome === 'success' && (
    !Number.isSafeInteger(r.run_id) ||
    !/^[a-f0-9]{40}$/.test(r.source_sha || '') ||
    !r.jobs?.some(j => j.name === 'apk' && j.conclusion === 'success') ||
    !Number.isSafeInteger(r.artifact_id))) {
  throw Error('Success report is incomplete or unverified');
}
console.log('FIDUNIO APK outcome:', r.outcome, 'run:', r.run_id);
JS

OUTCOME="$(node -p "require(process.argv[1]).outcome" "$TMP/result.json")"
if [ "$OUTCOME" != 'success' ]; then
  echo "No successful APK to publish. Leaving the current website APK unchanged."
  exit 0
fi

RUN_ID="$(node -p "require(process.argv[1]).run_id" "$TMP/result.json")"
SHA="$(node -p "require(process.argv[1]).source_sha" "$TMP/result.json")"
ARTIFACT_ID="$(node -p "require(process.argv[1]).artifact_id" "$TMP/result.json")"

if [ -f downloads/fidunio-build.json ] && \
   RUN_ID="$RUN_ID" SHA="$SHA" node -e '
const r = require("./downloads/fidunio-build.json");
if (String(r.run_id) === process.env.RUN_ID &&
    r.source_sha === process.env.SHA) process.exit(0);
process.exit(1);
'; then
  echo "This successful APK run is already published."
  exit 0
fi

mkdir -p downloads
ORIGIN='github-actions-artifact'
echo "Downloading the EXACT signed APK from successful FIDUNIO run $RUN_ID, artifact $ARTIFACT_ID."
# Never rebuild in Cuberoot: rebuilding could sign with a different key.
curl -fsSL --retry 3 --retry-delay 3 \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/willyros01/hermes/actions/artifacts/$ARTIFACT_ID/zip" \
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
# First publication records the permanent certificate; every subsequent release must match it.
# New permanent-key APKs must keep the identical signer across publications.
if [ -f downloads/fidunio-build.json ]; then
  PREV_SIGNER="$(node -p "require('./downloads/fidunio-build.json').signer_sha256 || ''")"
  if [ -n "$PREV_SIGNER" ] && [ "$PREV_SIGNER" != "$SIGNER_SHA" ]; then
    echo "::error title=Signing key changed::Refusing to publish APK with mismatched certificate"
    exit 1
  fi
fi
echo "Verified published APK signer: $SIGNER_SHA"

# Do not overwrite the new release with an older build while this job runs.
curl -fsSL --retry 2 \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' \
  "$API/actions/workflows/android-apk.yml/runs?branch=Android&status=success&per_page=1" \
  -o "$TMP/latest.json"
LATEST_SHA="$(node -p "require(process.argv[1]).workflow_runs?.[0]?.head_sha || ''" "$TMP/latest.json")"
if [ "$LATEST_SHA" != "$SHA" ]; then
  echo "::notice title=Newer build discovered::Skipping obsolete APK; next scheduled run will publish latest."
  exit 0
fi

install -m 0644 "$TMP/app-debug.apk" downloads/fidunio.apk
sha256sum downloads/fidunio.apk > downloads/fidunio.apk.sha256
RUN_ID="$RUN_ID" SHA="$SHA" ARTIFACT_ID="$ARTIFACT_ID" ORIGIN="$ORIGIN" SIGNER_SHA="$SIGNER_SHA" node <<'JS'
const fs = require('fs');
const crypto = require('crypto');
const apk = fs.readFileSync('downloads/fidunio.apk');
const release = {
  app: 'FIDUNIO',
  channel: 'android-fcm-beta',
  source_sha: process.env.SHA,
  run_id: Number(process.env.RUN_ID),
  artifact_id: Number(process.env.ARTIFACT_ID),
  origin: process.env.ORIGIN,
  apk_sha256: crypto.createHash('sha256').update(apk).digest('hex'),
  signer_sha256: process.env.SIGNER_SHA,
  apk_bytes: apk.length,
  published_at: new Date().toISOString()
};
fs.writeFileSync('downloads/fidunio-build.json', JSON.stringify(release, null, 2) + '\n');
console.log('APK source:', release.origin, 'checksum:', release.apk_sha256);
JS

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/fidunio.apk downloads/fidunio.apk.sha256 downloads/fidunio-build.json
if git diff --cached --quiet; then
  echo "Identical APK already published."
else
  git commit -m "publish: FIDUNIO Android successful run $RUN_ID [skip ci]"
  if ! git push origin HEAD:main; then
    echo "::warning title=Git push conflict::Cuberoot changed while publishing; safely retrying once"
    git fetch origin main
    # Never overwrite an equal or newer published run after a concurrent update.
    REMOTE_RUN="$({ git show origin/main:downloads/fidunio-build.json 2>/dev/null || true; } | node -e '
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
    # Rebase cannot replay the first APK/add-add binary files safely.
    # Preserve ONLY verified release assets, fast-forward to latest main and
    # re-commit those assets without disturbing any other site changes.
    install -m 0644 downloads/fidunio.apk "$TMP/retry.apk"
    cp downloads/fidunio.apk.sha256 "$TMP/retry.apk.sha256"
    cp downloads/fidunio-build.json "$TMP/retry-build.json"
    git reset --hard origin/main
    install -m 0644 "$TMP/retry.apk" downloads/fidunio.apk
    cp "$TMP/retry.apk.sha256" downloads/fidunio.apk.sha256
    cp "$TMP/retry-build.json" downloads/fidunio-build.json
    git add downloads/fidunio.apk downloads/fidunio.apk.sha256 downloads/fidunio-build.json
    git commit -m "publish: FIDUNIO Android successful run $RUN_ID [skip ci]"
    git push origin HEAD:main
  fi
  echo "Published FIDUNIO Android APK to /downloads/fidunio.apk"
fi
