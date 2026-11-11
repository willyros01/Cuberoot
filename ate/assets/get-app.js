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
