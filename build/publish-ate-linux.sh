#!/usr/bin/env bash
# Publish the exact verified ATE Linux .deb from the newest successful "ATE Linux" run on
# willyros01/clear-page (desktop branch). Copies only; nothing is compiled or signed here.
set -euo pipefail
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
API=https://api.github.com/repos/willyros01/clear-page
H=(-H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' -H 'Cache-Control: no-cache')
curl -fsSL --retry 2 "${H[@]}" "$API/actions/workflows/linux.yml/runs?branch=desktop&status=success&per_page=20" -o "$TMP/runs.json"
node - "$TMP/runs.json" "$TMP/run.json" <<'JS'
const fs=require('fs'),runs=JSON.parse(fs.readFileSync(process.argv[2])).workflow_runs||[];
const run=runs.filter(r=>r.path==='.github/workflows/linux.yml'&&r.head_branch==='desktop'&&r.conclusion==='success'&&r.name==='ATE Linux').sort((a,b)=>b.id-a.id)[0];
fs.writeFileSync(process.argv[3],JSON.stringify(run||null));
JS
RUN=$(node -p 'const r=require(process.argv[1]);r?r.id:""' "$TMP/run.json")
[ -n "$RUN" ] || { echo 'No successful ATE Linux run yet.'; exit 0; }
CURRENT=$(node -p 'let m={};try{m=require(process.argv[1])}catch{};m.run_id||0' "$PWD/downloads/ate-linux-build.json")
if [ "$CURRENT" -ge "$RUN" ]; then echo "Linux download already current (run $RUN)."; exit 0; fi
SHA=$(node -p 'require(process.argv[1]).head_sha' "$TMP/run.json")
curl -fsSL --retry 2 "${H[@]}" "$API/actions/runs/$RUN/jobs?per_page=100" -o "$TMP/jobs.json"
node -e 'const j=require(process.argv[1]).jobs;if(!j.some(x=>x.name==="linux"&&x.conclusion==="success"))throw Error("Linux verification job did not pass")' "$TMP/jobs.json"
curl -fsSL --retry 2 "${H[@]}" "$API/actions/runs/$RUN/artifacts?per_page=100" -o "$TMP/artifacts.json"
ART=$(node -p 'const a=require(process.argv[1]).artifacts.filter(x=>x.name==="ate-linux-x64"&&!x.expired);if(a.length!==1)throw Error("Expected one verified Linux artifact");a[0].id' "$TMP/artifacts.json")
curl -fsSL --retry 2 "${H[@]}" "$API/actions/artifacts/$ART/zip" -o "$TMP/artifact.zip"
unzip -tqq "$TMP/artifact.zip"
unzip -p "$TMP/artifact.zip" manifest.json > "$TMP/manifest.json"
NAME=$(node - "$TMP/manifest.json" "$RUN" "$SHA" <<'JS'
const [f,run,sha]=process.argv.slice(2),m=require(f),deb=(m.files||[]).find(x=>x.kind==='deb');
if(m.app!=='ATE'||m.platform!=='linux-x64'||m.run_id!==Number(run)||m.source_sha!==sha||!/^\d+\.\d+\.\d+$/.test(m.version)||m.verification!=='ci-native-verified-installed-and-launched')throw Error('Linux provenance mismatch');
if(!deb||deb.file!=='ATE-'+m.version+'-linux-amd64.deb'||!/^[a-f0-9]{64}$/.test(deb.sha256)||!(deb.bytes>1000000&&deb.bytes<60000000))throw Error('Linux .deb manifest invalid');
console.log(deb.file);
JS
)
unzip -p "$TMP/artifact.zip" "$NAME" > "$TMP/ate.deb"
node - "$TMP/ate.deb" "$TMP/manifest.json" <<'JS'
const fs=require('fs'),crypto=require('crypto'),b=fs.readFileSync(process.argv[2]),deb=require(process.argv[3]).files.find(x=>x.kind==='deb');
if(b.length!==deb.bytes||crypto.createHash('sha256').update(b).digest('hex')!==deb.sha256)throw Error('Linux .deb checksum mismatch');
if(b.subarray(0,8).toString()!=='!<arch>\n')throw Error('Not a Debian package');
JS
VERSION=$(node -p 'require(process.argv[1]).version' "$TMP/manifest.json")
test "$(dpkg-deb -f "$TMP/ate.deb" Package)" = ate
test "$(dpkg-deb -f "$TMP/ate.deb" Version)" = "$VERSION"
test "$(dpkg-deb -f "$TMP/ate.deb" Architecture)" = amd64
mkdir -p downloads
cp "$TMP/ate.deb" downloads/ate-linux.deb
(cd downloads && sha256sum ate-linux.deb > ate-linux.deb.sha256)
node - "$TMP/manifest.json" <<'JS' > downloads/ate-linux-build.json
const m=require(process.argv[2]),deb=m.files.find(x=>x.kind==='deb');
console.log(JSON.stringify({app:'ATE',platform:'linux-x64',version:m.version,build:m.build,run_id:m.run_id,source_sha:m.source_sha,file:'ate-linux.deb',sha256:deb.sha256,bytes:deb.bytes,signature:'unsigned',verification:m.verification,built_on:m.built_on,published_at:new Date().toISOString()},null,2));
JS
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/ate-linux.deb downloads/ate-linux.deb.sha256 downloads/ate-linux-build.json
if git diff --cached --quiet; then echo 'No new verified Linux package.'; exit 0; fi
git commit -m "Publish verified ATE Linux $VERSION from run $RUN"
if ! git push origin HEAD:main; then git fetch origin main; git rebase origin/main; git push origin HEAD:main; fi
echo "PASS: published ATE Linux $VERSION (.deb) from run $RUN"
