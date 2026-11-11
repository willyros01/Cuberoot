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

