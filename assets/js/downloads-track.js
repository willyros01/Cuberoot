// Independent of home.js and of the normal anchor download action.
// Never cancel, redirect, await or retry a download click.
import {DOWNLOADS_ENDPOINT} from './downloads-config.js?v=2.0.0';
const allowed=new Set(['fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files']);
if(DOWNLOADS_ENDPOINT) {
 document.addEventListener('click',event=>{
  try {
   const anchor=event.target?.closest?.('a[download]');if(!anchor)return;
   const url=new URL(anchor.href,location.href);
   const match=/^\/downloads\/([a-z-]+)\.apk$/.exec(url.pathname);
   if(url.origin!==location.origin||!match||!allowed.has(match[1]))return;
   // Defer all recording until the browser has processed the click normally.
   setTimeout(()=>{
    try {
     const body=JSON.stringify({id:crypto.randomUUID(),app:match[1],build:url.searchParams.get('build')||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown'});
     navigator.sendBeacon(DOWNLOADS_ENDPOINT,new Blob([body],{type:'text/plain;charset=UTF-8'}));
    } catch {} // Missing browser APIs or blocked tracking never affects the APK.
   },0);
  } catch {}
 },{passive:true});
}
