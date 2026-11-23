const expectedSigner='ef654829950fdf9d59f061c7b0fdc80358373a619fc02fa10480816e0665d6e4';
async function download(){
 try{
  const res=await fetch('/downloads/ate-build.json',{cache:'no-store'});if(!res.ok)return;
  const meta=await res.json();
  if(meta.app!=='ATE'||meta.signer_sha256!==expectedSigner||!Number.isSafeInteger(meta.run_id)||meta.run_id<1||!Number.isSafeInteger(meta.apk_bytes)||meta.apk_bytes<1000000||!/^[a-f0-9]{64}$/.test(meta.apk_sha256||''))return;
  const link=document.getElementById('android-download');link.href='/downloads/ate.apk?build='+meta.run_id;link.download='ate-'+meta.version+'-'+meta.run_id+'.apk';link.hidden=false;
  document.getElementById('android-status').textContent='Signed Android APK available · Version '+meta.version;
  document.getElementById('android-checksum').hidden=false;document.getElementById('apk-sha').textContent=meta.apk_sha256;
 }catch{}
}
download();

async function desktopDownloads(){
 try{
  const response=await fetch('/downloads/ate-desktop-build.json',{cache:'no-store'});if(!response.ok)return;
  const meta=await response.json();if(meta.app!=='ATE')return;
  for(const [p,label,file] of [['mac','Mac universal','ate-mac.dmg'],['windows','Windows x64','ate-windows.exe']]){
   const m=meta[p];if(!m||m.file!==file||!Number.isSafeInteger(m.run_id)||m.run_id<1||!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(m.version||'')||!/^[a-f0-9]{64}$/.test(m.sha256||''))continue;
   if(p==='mac'&&(m.signature!=='developer-id'||m.team_id!=='VXMLKHF72B'||m.notarization!=='Accepted'||m.stapled!==true))continue;
   if(p==='windows'&&m.verification!=='ci-installed-and-launched')continue;
   const link=document.getElementById(p+'-download');link.href='/downloads/'+file+'?build='+m.run_id;link.download=file;link.hidden=false;
   document.getElementById(p+'-status').textContent=label+' available · Version '+m.version+(p==='mac'?' · Signed and notarized':' · Unsigned installer');
  }
 }catch{}
}
desktopDownloads();

// Linux has no universal app: pick the Intel/AMD or ARM installer for this computer.
async function linuxIsArm(){
 if(/aarch64|arm64|armv8/i.test(navigator.userAgent))return true;
 try{if(navigator.userAgentData&&navigator.userAgentData.getHighEntropyValues){const v=await navigator.userAgentData.getHighEntropyValues(['architecture']);if(v.architecture)return v.architecture==='arm';}}catch{}
 return false;
}
async function linuxDownload(){
 try{
  const res=await fetch('/downloads/ate-linux-build.json',{cache:'no-store'});if(!res.ok)return;
  const m=await res.json();
  if(m.app!=='ATE'||m.platform!=='linux-x64'||m.file!=='ate-linux.deb'||!Number.isSafeInteger(m.run_id)||m.run_id<1||!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(m.version||'')||!/^[a-f0-9]{64}$/.test(m.sha256||'')||m.verification!=='ci-native-verified-installed-and-launched')return;
  const arm=m.arm64&&m.arm64.file==='ate-linux-arm64.deb'&&/^[a-f0-9]{64}$/.test(m.arm64.sha256||'')?m.arm64:null;
  const intel={file:'ate-linux.deb',label:'Intel/AMD'},armFile=arm?{file:'ate-linux-arm64.deb',label:'ARM'}:null;
  const mine=(armFile&&await linuxIsArm())?armFile:intel,other=mine===intel?armFile:intel;
  const link=document.getElementById('linux-download');link.href='/downloads/'+mine.file+'?build='+m.run_id;link.download=mine.file;link.textContent='Download Linux installer ('+mine.label+')';link.hidden=false;
  if(other){const o=document.getElementById('linux-other');o.href='/downloads/'+other.file+'?build='+m.run_id;o.download=other.file;o.textContent='Other Linux version ('+other.label+')';o.hidden=false;}
  document.getElementById('linux-status').textContent='Linux installer available · Version '+m.version+' · Unsigned .deb package';
 }catch{}
}
linuxDownload();

