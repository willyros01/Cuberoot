#!/usr/bin/env bash
# Publish the exact verified ATE Linux .deb files (Intel/AMD and ARM) from the newest successful "ATE Linux" run on
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
# Both processor builds and both Ubuntu 26.04 App Center-style installs must have passed.
node -e 'const j=require(process.argv[1]).jobs;for(const p of ["amd64","arm64"])if(!j.some(x=>x.name.startsWith("linux (")&&x.name.includes(p)&&x.conclusion==="success"))throw Error("Linux "+p+" verification did not pass");for(const p of ["linux-x64","linux-arm64"])if(!j.some(x=>x.name.startsWith("appcenter (")&&x.name.includes(p)&&x.conclusion==="success"))throw Error("Ubuntu 26.04 install check "+p+" did not pass")' "$TMP/jobs.json"
curl -fsSL --retry 2 "${H[@]}" "$API/actions/runs/$RUN/artifacts?per_page=100" -o "$TMP/artifacts.json"
mkdir -p downloads
for PLATFORM in linux-x64 linux-arm64; do
  ARCH=$([ "$PLATFORM" = linux-x64 ] && echo amd64 || echo arm64)
  ART=$(node -p 'const a=require(process.argv[1]).artifacts.filter(x=>x.name==="ate-"+process.argv[2]&&!x.expired);if(a.length!==1)throw Error("Expected one verified "+process.argv[2]+" artifact");a[0].id' "$TMP/artifacts.json" "$PLATFORM")
  curl -fsSL --retry 2 "${H[@]}" "$API/actions/artifacts/$ART/zip" -o "$TMP/$ARCH.zip"
  unzip -tqq "$TMP/$ARCH.zip"
  unzip -p "$TMP/$ARCH.zip" manifest.json > "$TMP/$ARCH.json"
  NAME=$(node - "$TMP/$ARCH.json" "$RUN" "$SHA" "$PLATFORM" "$ARCH" <<'JS'
const [f,run,sha,platform,arch]=process.argv.slice(2),m=require(f),deb=(m.files||[]).find(x=>x.kind==='deb');
if(m.app!=='ATE'||m.platform!==platform||m.arch!==arch||m.run_id!==Number(run)||m.source_sha!==sha||!/^\d+\.\d+\.\d+$/.test(m.version)||m.verification!=='ci-native-verified-installed-and-launched')throw Error('Linux '+arch+' provenance mismatch');
if(!deb||deb.file!=='ATE-'+m.version+'-linux-'+arch+'.deb'||!/^[a-f0-9]{64}$/.test(deb.sha256)||!(deb.bytes>1000000&&deb.bytes<60000000))throw Error('Linux '+arch+' .deb manifest invalid');
console.log(deb.file);
JS
)
  unzip -p "$TMP/$ARCH.zip" "$NAME" > "$TMP/$ARCH.deb"
  node - "$TMP/$ARCH.deb" "$TMP/$ARCH.json" <<'JS'
const fs=require('fs'),crypto=require('crypto'),b=fs.readFileSync(process.argv[2]),deb=require(process.argv[3]).files.find(x=>x.kind==='deb');
if(b.length!==deb.bytes||crypto.createHash('sha256').update(b).digest('hex')!==deb.sha256)throw Error('Linux .deb checksum mismatch');
if(b.subarray(0,8).toString()!=='!<arch>\n')throw Error('Not a Debian package');
JS
  test "$(dpkg-deb -f "$TMP/$ARCH.deb" Package)" = ate
  test "$(dpkg-deb -f "$TMP/$ARCH.deb" Architecture)" = "$ARCH"
done
VERSION=$(node -p 'require(process.argv[1]).version' "$TMP/amd64.json")
test "$(node -p 'require(process.argv[1]).version' "$TMP/arm64.json")" = "$VERSION"
test "$(dpkg-deb -f "$TMP/amd64.deb" Version)" = "$VERSION"
test "$(dpkg-deb -f "$TMP/arm64.deb" Version)" = "$VERSION"
cp "$TMP/amd64.deb" downloads/ate-linux.deb
cp "$TMP/arm64.deb" downloads/ate-linux-arm64.deb
(cd downloads && sha256sum ate-linux.deb > ate-linux.deb.sha256 && sha256sum ate-linux-arm64.deb > ate-linux-arm64.deb.sha256)
node - "$TMP/amd64.json" "$TMP/arm64.json" <<'JS' > downloads/ate-linux-build.json
const x=require(process.argv[2]),a=require(process.argv[3]),dx=x.files.find(f=>f.kind==='deb'),da=a.files.find(f=>f.kind==='deb');
console.log(JSON.stringify({app:'ATE',platform:'linux-x64',version:x.version,build:x.build,run_id:x.run_id,source_sha:x.source_sha,file:'ate-linux.deb',sha256:dx.sha256,bytes:dx.bytes,
 arm64:{platform:'linux-arm64',file:'ate-linux-arm64.deb',sha256:da.sha256,bytes:da.bytes},
 signature:'unsigned',verification:x.verification,ubuntu_2604_install_check:'packagekit-passed-amd64-arm64',published_at:new Date().toISOString()},null,2));
JS
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/ate-linux.deb downloads/ate-linux.deb.sha256 downloads/ate-linux-arm64.deb downloads/ate-linux-arm64.deb.sha256 downloads/ate-linux-build.json
if git diff --cached --quiet; then echo 'No new verified Linux package.'; exit 0; fi
git commit -m "Publish verified ATE Linux $VERSION from run $RUN"
if ! git push origin HEAD:main; then git fetch origin main; git rebase origin/main; git push origin HEAD:main; fi
echo "PASS: published ATE Linux $VERSION (.deb) from run $RUN"
