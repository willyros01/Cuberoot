#!/usr/bin/env bash
# Publish the latest SUCCESSFUL The Marker Android APK on Cuberoot.
# Copies ONLY the exact APK built and signed in willyros01/marker; never
# re-signs or rebuilds. Anything unexpected leaves the current APK in place.
set -euo pipefail
REPORT='https://raw.githubusercontent.com/willyros01/marker/ci-logs/logs/android/last-run.json'
SIGNER_EXPECTED='0f0da069f2c8b2842beb4d242415d70069a6bb3137fc90a75e6d1619ad32deff'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking the latest Marker Android APK build report..."
curl -fsSL --retry 3 --retry-delay 2 -H 'Cache-Control: no-cache' "$REPORT?t=$(date +%s)" -o "$TMP/result.json"
node - "$TMP/result.json" <<'JS'
const r = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
if (r.workflow !== 'Marker Android APK' || r.branch !== 'main') throw Error('Unexpected build report');
if (r.outcome === 'success' && (!Number.isSafeInteger(r.run_id) || !/^[a-f0-9]{40}$/.test(r.source_sha || '') ||
    !Number.isSafeInteger(r.artifact_id) || !/^marker\.v[0-9.]+\.apk$/.test(r.apk_name || '')))
  throw Error('Success report is incomplete');
console.log('Marker APK outcome:', r.outcome, 'run:', r.run_id, 'version:', r.version);
JS
J() { node -p "require(process.argv[1]).$1" "$TMP/result.json"; }
if [ "$(J outcome)" != 'success' ]; then
  echo "No successful APK to publish. Leaving the current website APK unchanged."; exit 0
fi
RUN_ID="$(J run_id)"; SHA="$(J source_sha)"; ARTIFACT_ID="$(J artifact_id)"; NAME="$(J apk_name)"; VERSION="$(J version)"

if [ -f downloads/marker-build.json ] && RUN_ID="$RUN_ID" SHA="$SHA" node -e '
const r = require("./downloads/marker-build.json");
process.exit(String(r.run_id) === process.env.RUN_ID && r.source_sha === process.env.SHA ? 0 : 1);'; then
  echo "This APK is already published."; exit 0
fi

echo "Downloading the exact signed APK from Marker run $RUN_ID, artifact $ARTIFACT_ID."
curl -fsSL --retry 3 --retry-delay 3 -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/willyros01/marker/actions/artifacts/$ARTIFACT_ID/zip" -o "$TMP/artifact.zip"
unzip -tqq "$TMP/artifact.zip"
unzip -Z1 "$TMP/artifact.zip" | grep -Fx "$NAME" >/dev/null
unzip -p "$TMP/artifact.zip" "$NAME" > "$TMP/marker.apk"
test "$(stat -c%s "$TMP/marker.apk")" -gt 1000000
unzip -tqq "$TMP/marker.apk"
unzip -Z1 "$TMP/marker.apk" | grep -Fx 'AndroidManifest.xml' >/dev/null
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
SIGNER="$(find "$SDK/build-tools" -name apksigner -type f | sort -V | tail -1)"
"$SIGNER" verify "$TMP/marker.apk" >/dev/null
SIGNER_SHA="$("$SIGNER" verify --print-certs "$TMP/marker.apk" | sed -n 's/^.*certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f')"
if [ "$SIGNER_SHA" != "$SIGNER_EXPECTED" ]; then
  echo "::error title=Signing key changed::The APK is not signed with The Marker's permanent key; not published."; exit 1
fi
echo "Verified signer: $SIGNER_SHA"

# A newer build may have finished meanwhile; the next run publishes it.
curl -fsSL --retry 2 -H 'Cache-Control: no-cache' "$REPORT?t=$(date +%s)" -o "$TMP/latest.json"
if [ "$(node -p "require(process.argv[1]).source_sha" "$TMP/latest.json")" != "$SHA" ]; then
  echo "::notice::A newer build exists; the next run publishes it."; exit 0
fi

mkdir -p downloads
install -m 0644 "$TMP/marker.apk" downloads/marker.apk
( cd downloads && sha256sum marker.apk > marker.apk.sha256 )
RUN_ID="$RUN_ID" SHA="$SHA" ARTIFACT_ID="$ARTIFACT_ID" SIGNER_SHA="$SIGNER_SHA" VERSION="$VERSION" node <<'JS'
const fs = require('fs'), crypto = require('crypto');
const apk = fs.readFileSync('downloads/marker.apk'); const e = process.env;
fs.writeFileSync('downloads/marker-build.json', JSON.stringify({
  app: 'The Marker', channel: 'android-test', version: e.VERSION, source_sha: e.SHA,
  run_id: Number(e.RUN_ID), artifact_id: Number(e.ARTIFACT_ID), origin: 'github-actions-artifact',
  apk_sha256: crypto.createHash('sha256').update(apk).digest('hex'), signer_sha256: e.SIGNER_SHA,
  apk_bytes: apk.length, published_at: new Date().toISOString()
}, null, 2) + '\n');
JS
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/marker.apk downloads/marker.apk.sha256 downloads/marker-build.json
if git diff --cached --quiet; then echo "Identical APK already published."; exit 0; fi
git commit -qm "publish: The Marker Android $VERSION, run $RUN_ID [skip ci]"
if ! git push -q origin HEAD:main; then
  git fetch -q origin main
  REMOTE_RUN="$(git show origin/main:downloads/marker-build.json 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).run_id||0))}catch(_){process.stdout.write("0")}})')"
  if [ "${REMOTE_RUN:-0}" -ge "$RUN_ID" ]; then echo "An equal or newer APK is already published."; exit 0; fi
  git rebase -q origin/main && git push -q origin HEAD:main
fi
echo "Published The Marker $VERSION to /downloads/marker.apk"
