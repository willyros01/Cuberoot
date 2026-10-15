// STAGED / INERT unless explicitly imported AND enabled.
// Never prevent, delay, redirect, replace or retry any APK download.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth, signInAnonymously, setPersistence, browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore, doc, setDoc, serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {initializeAppCheck, ReCaptchaV3Provider} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import {counterConfig} from './config.example.mjs';

const APPS=new Set(['fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files']);
function ready() {
 const c=counterConfig;
 return c.enabled===true && c.projectId==='split-it-44dea' &&
 c.firebase?.projectId===c.projectId && !!c.firebase.apiKey &&
 !!c.firebase.appId && !!c.appCheckSiteKey;
}
let clientPromise;
function client(){
 if(!clientPromise) clientPromise=(async()=>{
  const app=initializeApp(counterConfig.firebase,'cuberoot-apk-clicks');
  initializeAppCheck(app,{provider:new ReCaptchaV3Provider(counterConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  const auth=getAuth(app);
  await setPersistence(auth,browserLocalPersistence);
  if(!auth.currentUser||!auth.currentUser.isAnonymous)await signInAnonymously(auth);
  return getFirestore(app);
 })();
 return clientPromise;
}
function identify(anchor){
 const url=new URL(anchor.href,location.href);
 if(url.origin!==location.origin)return null;
 const match=/^\/downloads\/([a-z-]+)\.apk$/.exec(url.pathname);
 if(!match||!APPS.has(match[1]))return null;
 const b=url.searchParams.get('build')||'';
 return {app:match[1],build:/^[0-9]{0,18}$/.test(b)?b:''};
}
function timezone(){
 const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown';
 return /^[A-Za-z0-9_+./-]{1,64}$/.test(tz)?tz:'Unknown';
}
function recordClick(item){
 void (async()=>{
  const db=await client();
  const id=crypto.randomUUID();
  await setDoc(doc(db,'cuberoot_apk_clicks_v1',item.app,'events',id),{
   app:item.app,createdAt:serverTimestamp(),timezone:timezone(),build:item.build
  });
 })().catch(()=>{});
}
if(ready()){
 document.addEventListener('click',event=>{
  try{
   const anchor=event.target?.closest?.('a[download]');
   if(!anchor)return;
   const item=identify(anchor);
   if(item)setTimeout(()=>{try{recordClick(item)}catch{}},0);
  }catch{}
 },{passive:true});
}
