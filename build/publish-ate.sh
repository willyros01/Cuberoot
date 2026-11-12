#!/usr/bin/env bash
# Publish the latest SUCCESSFUL ATE Android APK on Cuberoot.
# Copies ONLY the exact APK built and signed in willyros01/clear-page; never
# re-signs or rebuilds. Anything unexpected leaves the current APK in place.
set -euo pipefail
REPORT='https://raw.githubusercontent.com/willyros01/clear-page/apk-releases/ate-last-run.json'
SIGNER_EXPECTED='ef654829950fdf9d59f061c7b0fdc80358373a619fc02fa10480816e0665d6e4'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking the latest ATE Android APK build report..."
code=$(curl -sSL --retry 3 --retry-delay 2 -w '%{http_code}' -H 'Cache-Control: no-cache' "$REPORT?t=$(date +%s)" -o "$TMP/result.json")
if [ "$code" = 404 ]; then echo 'ATE has no signed APK report yet; leaving downloads unchanged.'; exit 0; fi
[ "$code" = 200 ] || { echo "ATE build report HTTP $code"; exit 1; }
node - "$TMP/result.json" <<'JS'
const r = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
if (!((r.workflow === 'ATE Android APK' && r.branch === 'android') || (r.workflow === 'ATE Apple and Desktop' && r.branch === 'desktop'))) throw Error('Unexpected build report');
if (r.outcome === 'success' && (!Number.isSafeInteger(r.run_id) || !/^[a-f0-9]{40}$/.test(r.source_sha || '') ||
    !Number.isSafeInteger(r.artifact_id) || !/^ate\.v[0-9.]+\.apk$/.test(r.apk_name || '')))
  throw Error('Success report is incomplete');
console.log('ATE APK outcome:', r.outcome, 'run:', r.run_id, 'version:', r.version);
JS
# Verify coordinated releases against the actual run and passed Android job.
node --input-type=module - "$TMP/result.json" <<'JS'
import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(report.workflow==='ATE Apple and Desktop'){
 const base='https://api.github.com/repos/willyros01/clear-page/actions/runs/'+report.run_id;
 const headers={Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'};
 async function get(url){const r=await fetch(url,{headers});if(!r.ok)throw Error('APK provenance HTTP '+r.status);return r.json()}
 const run=await get(base);
 if(run.head_sha!==report.source_sha||run.head_branch!==report.branch||run.name!==report.workflow)throw Error('Android source provenance mismatch');
 const {jobs}=await get(base+'/jobs?per_page=100');
 for(const name of ['browser','android'])if(!jobs.some(j=>j.name===name&&j.conclusion==='success'))throw Error('Android release gate not passed: '+name);
 const {artifacts}=await get(base+'/artifacts?per_page=100');
 if(!artifacts.some(a=>a.id===report.artifact_id&&a.name==='ate-android-apk'&&!a.expired))throw Error('Wrong Android APK artifact');
}
JS
J() { node -p "require(process.argv[1]).$1" "$TMP/result.json"; }
if [ "$(J outcome)" != 'success' ]; then
  echo "No successful APK to publish. Leaving the current website APK unchanged."; exit 0
fi
RUN_ID="$(J run_id)"; SHA="$(J source_sha)"; ARTIFACT_ID="$(J artifact_id)"; NAME="$(J apk_name)"; VERSION="$(J version)"

if [ -f downloads/ate-build.json ] && RUN_ID="$RUN_ID" SHA="$SHA" node -e '
const r = require("./downloads/ate-build.json");
process.exit(String(r.run_id) === process.env.RUN_ID && r.source_sha === process.env.SHA ? 0 : 1);'; then
  echo "This APK is already published."; exit 0
fi

echo "Downloading the exact signed APK from ATE run $RUN_ID, artifact $ARTIFACT_ID."
curl -fsSL --retry 3 --retry-delay 3 -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/willyros01/clear-page/actions/artifacts/$ARTIFACT_ID/zip" -o "$TMP/artifact.zip"
unzip -tqq "$TMP/artifact.zip"
unzip -Z1 "$TMP/artifact.zip" | grep -Fx "$NAME" >/dev/null
unzip -p "$TMP/artifact.zip" "$NAME" > "$TMP/ate.apk"
test "$(stat -c%s "$TMP/ate.apk")" -gt 1000000
unzip -tqq "$TMP/ate.apk"
unzip -Z1 "$TMP/ate.apk" | grep -Fx 'AndroidManifest.xml' >/dev/null
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
SIGNER="$(find "$SDK/build-tools" -name apksigner -type f | sort -V | tail -1)"
"$SIGNER" verify "$TMP/ate.apk" >/dev/null
SIGNER_SHA="$("$SIGNER" verify --print-certs "$TMP/ate.apk" | sed -n 's/^.*certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f')"
if [ "$SIGNER_SHA" != "$SIGNER_EXPECTED" ]; then
  echo "::error title=Signing key changed::The APK is not signed with ATE's permanent key; not published."; exit 1
fi
echo "Verified signer: $SIGNER_SHA"
AAPT="$(dirname "$SIGNER")/aapt"
"$AAPT" dump badging "$TMP/ate.apk" > "$TMP/badging.txt"
VERSION="$VERSION" node - "$TMP/badging.txt" <<'JS'
const text=require('fs').readFileSync(process.argv[2],'utf8');
const p=text.match(/^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m);
if(!p||p[1]!=='io.github.willyros01.clearpage'||p[3]!==process.env.VERSION)throw Error('Unexpected ATE package or version');
if(!/^application-label:'ATE'$/m.test(text))throw Error('ATE display name missing');
JS


# A newer build may have finished meanwhile; the next run publishes it.
curl -fsSL --retry 2 -H 'Cache-Control: no-cache' "$REPORT?t=$(date +%s)" -o "$TMP/latest.json"
if [ "$(node -p "require(process.argv[1]).source_sha" "$TMP/latest.json")" != "$SHA" ]; then
  echo "::notice::A newer build exists; the next run publishes it."; exit 0
fi

mkdir -p downloads
install -m 0644 "$TMP/ate.apk" downloads/ate.apk
( cd downloads && sha256sum ate.apk > ate.apk.sha256 )
RUN_ID="$RUN_ID" SHA="$SHA" ARTIFACT_ID="$ARTIFACT_ID" SIGNER_SHA="$SIGNER_SHA" VERSION="$VERSION" node <<'JS'
const fs = require('fs'), crypto = require('crypto');
const apk = fs.readFileSync('downloads/ate.apk'); const e = process.env;
fs.writeFileSync('downloads/ate-build.json', JSON.stringify({
  app: 'ATE', channel: 'signed-android-apk', version: e.VERSION, source_sha: e.SHA,
  run_id: Number(e.RUN_ID), artifact_id: Number(e.ARTIFACT_ID), origin: 'github-actions-artifact',
  apk_sha256: crypto.createHash('sha256').update(apk).digest('hex'), signer_sha256: e.SIGNER_SHA,
  apk_bytes: apk.length, published_at: new Date().toISOString()
}, null, 2) + '\n');
JS
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/ate.apk downloads/ate.apk.sha256 downloads/ate-build.json
if git diff --cached --quiet; then echo "Identical APK already published."; exit 0; fi
git commit -qm "publish: ATE Android $VERSION, run $RUN_ID [skip ci]"
if ! git push -q origin HEAD:main; then
  git fetch -q origin main
  REMOTE_RUN="$(git show origin/main:downloads/ate-build.json 2>/dev/null | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).run_id||0))}catch(_){process.stdout.write("0")}})')"
  if [ "${REMOTE_RUN:-0}" -ge "$RUN_ID" ]; then echo "An equal or newer APK is already published."; exit 0; fi
  git rebase -q origin/main && git push -q origin HEAD:main
fi
echo "Published ATE $VERSION to /downloads/ate.apk"
