// Website/cockpit catalog only. The scheduled email has its own release scope.
export const DOWNLOAD_APPS=Object.freeze({
 fidunio:'FIDUNIO',scorecard:'The Scorecard',fairpot:'Fairpot',wire:'Wire',
 spendrecorder:'SpendRecorder','cloud-files':'Cloud Files',marker:'The Marker',
 'ate-windows':'ATE Windows','ate-mac':'ATE Mac Universal',ate:'ATE Android'
});
export const ATE_APPS=Object.freeze(['ate-windows','ate-mac','ate']);
const files=new Map([
 ...Object.keys(DOWNLOAD_APPS).filter(app=>!ATE_APPS.includes(app)).map(app=>['/downloads/'+app+'.apk',app]),
 ['/downloads/ate.apk','ate'],['/downloads/ate-windows.exe','ate-windows'],['/downloads/ate-mac.dmg','ate-mac']
]);
export function identifyDownload(href,base){
 const url=new URL(href,base),origin=new URL(base).origin;
 const app=files.get(url.pathname);
 if(url.origin!==origin||!app)return null;
 const build=url.searchParams.get('build')||'';
 return {app,build:/^[0-9]{0,18}$/.test(build)?build:''};
}
