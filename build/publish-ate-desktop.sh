#!/usr/bin/env bash
# Exact artifact copies only; no compilation or signing in the website repo.
set -euo pipefail
TMP=$(mktemp -d)
cleanup(){ hdiutil detach "$TMP/mount" -quiet 2>/dev/null || true; rm -rf "$TMP"; }
trap cleanup EXIT
REPORT=https://raw.githubusercontent.com/willyros01/clear-page/desktop-releases/ate-desktop-last-run.json
code=$(curl -sSL --retry 2 -w '%{http_code}' "$REPORT?t=$(date +%s)" -o "$TMP/report.json")
if [ "$code" = 404 ]; then echo 'No desktop release report yet.'; exit 0; fi
[ "$code" = 200 ] || { echo "Report HTTP $code"; exit 1; }
node - "$TMP/report.json" <<'JS'
const r=require(process.argv[2]);
if(r.app!=='ATE'||r.workflow!=='ATE Apple and Desktop'||r.branch!=='desktop'||!Number.isSafeInteger(r.run_id)||r.run_id<1||!/^[a-f0-9]{40}$/.test(r.source_sha)||!/^\d+\.\d+\.\d+$/.test(r.version))throw Error('Unexpected report');
for(const k of ['windows_artifact_id','mac_artifact_id'])if(r[k]!==null&&(!Number.isSafeInteger(r[k])||r[k]<1))throw Error('Invalid artifact');
JS
mkdir -p downloads
if [ -f downloads/ate-desktop-build.json ]; then cp downloads/ate-desktop-build.json "$TMP/meta.json"; else echo '{"app":"ATE"}' > "$TMP/meta.json"; fi
for platform in windows mac; do
 ARTIFACT=$(node -p "require(process.argv[1])[process.argv[2]+'_artifact_id']||''" "$TMP/report.json" "$platform")
 [ -n "$ARTIFACT" ] || continue
 if node - "$TMP/meta.json" "$TMP/report.json" "$platform" <<'JS'
const [m,r,p]=process.argv.slice(2);process.exit((require(m)[p]?.run_id||0)>=require(r).run_id?0:1);
JS
 then echo "$platform already current."; continue; fi
 curl -fsSL --retry 2 -H "Authorization: Bearer $GITHUB_TOKEN" -H 'Accept: application/vnd.github+json' \
  "https://api.github.com/repos/willyros01/clear-page/actions/artifacts/$ARTIFACT/zip" -o "$TMP/artifact.zip"
 unzip -tqq "$TMP/artifact.zip"
 MANIFEST=$(unzip -Z1 "$TMP/artifact.zip" | awk '/(^|\/)manifest.json$/ {print}')
 if [ -z "$MANIFEST" ]; then echo "$platform artifact has no verified release manifest; leaving existing download unchanged."; continue; fi
 test "$(printf '%s\n' "$MANIFEST" | wc -l | tr -d ' ')" = 1
 unzip -p "$TMP/artifact.zip" "$MANIFEST" > "$TMP/manifest.json"
 node - "$TMP/manifest.json" "$TMP/report.json" "$platform" <<'JS'
const [mfile,rfile,p]=process.argv.slice(2),m=require(mfile),r=require(rfile);
if(m.app!=='ATE'||m.run_id!==r.run_id||m.source_sha!==r.source_sha||m.version!==r.version||!/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.bytes)||m.bytes<100000||m.bytes>95000000)throw Error('Artifact provenance or size mismatch');
if(p==='mac'){
 if(m.platform!=='mac-universal'||m.file!=='ATE-'+r.version+'-universal.dmg'||m.signature!=='developer-id'||m.team_id!=='VXMLKHF72B'||m.notarization!=='Accepted'||m.stapled!==true)throw Error('Mac signing/notarization not verified');
}else if(m.platform!=='windows-x64'||m.file!=='ATE-'+r.version+'-windows-x64-setup.exe'||m.signature!=='unsigned'||m.verification!=='ci-installed-and-launched')throw Error('Windows installer acceptance missing');
JS
 NAME=$(node -p 'require(process.argv[1]).file' "$TMP/manifest.json")
 ENTRY=$(unzip -Z1 "$TMP/artifact.zip" | awk -v name="$NAME" '$0==name || substr($0,length($0)-length(name),length(name)+1)=="/"name {print}')
 test -n "$ENTRY"
 test "$(printf '%s\n' "$ENTRY" | wc -l | tr -d ' ')" = 1
 unzip -p "$TMP/artifact.zip" "$ENTRY" > "$TMP/installer"
 node - "$TMP/installer" "$TMP/manifest.json" <<'JS'
const fs=require('fs'),crypto=require('crypto'),b=fs.readFileSync(process.argv[2]),m=require(process.argv[3]);
if(b.length!==m.bytes||crypto.createHash('sha256').update(b).digest('hex')!==m.sha256)throw Error('Installer checksum mismatch');
if(m.platform==='windows-x64'&&b.subarray(0,2).toString()!=='MZ')throw Error('Not a Windows executable');
JS
 if [ "$platform" = mac ]; then
  cp "$TMP/installer" "$TMP/ATE.dmg"
  xcrun stapler validate "$TMP/ATE.dmg"
  mkdir -p "$TMP/mount"
  hdiutil attach "$TMP/ATE.dmg" -readonly -nobrowse -mountpoint "$TMP/mount"
  APP="$TMP/mount/ATE.app"
  test -d "$APP"
  codesign --verify --deep --strict "$APP"
  codesign -dv "$APP" 2> "$TMP/signature.txt"
  grep -q 'Authority=Developer ID Application:' "$TMP/signature.txt"
  grep -q 'TeamIdentifier=VXMLKHF72B' "$TMP/signature.txt"
  EXECUTABLE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$APP/Contents/Info.plist")
  lipo "$APP/Contents/MacOS/$EXECUTABLE" -verify_arch arm64 x86_64
  spctl --assess --type execute "$APP"
  hdiutil detach "$TMP/mount" -quiet
  DEST=ate-mac.dmg
 else DEST=ate-windows.exe; fi
 cp "$TMP/installer" "downloads/$DEST"
 shasum -a 256 "downloads/$DEST" | sed 's@downloads/@@' > "downloads/$DEST.sha256"
 node - "$TMP/meta.json" "$TMP/manifest.json" "$platform" "$DEST" <<'JS'
const fs=require('fs'),[meta,manifest,p,file]=process.argv.slice(2),m=require(meta);m[p]={...require(manifest),file,published_at:new Date().toISOString()};fs.writeFileSync(meta,JSON.stringify(m,null,2)+'\n');
JS
done
cp "$TMP/meta.json" downloads/ate-desktop-build.json
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add downloads/ate-desktop-build.json
for file in downloads/ate-mac.dmg downloads/ate-windows.exe downloads/ate-mac.dmg.sha256 downloads/ate-windows.exe.sha256; do [ ! -f "$file" ] || git add "$file"; done
if git diff --cached --quiet; then echo 'No new verified installer.'; exit 0; fi
git commit -m 'Publish verified ATE desktop installers'
if ! git push origin HEAD:main; then git fetch origin main; git rebase origin/main; git push origin HEAD:main; fi
