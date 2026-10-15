// STAGED / INERT until explicitly imported into unlocked Publish admin.
// Owner credentials are kept in memory only, never in GitHub or local storage.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth, signInWithEmailAndPassword, setPersistence, inMemoryPersistence, signOut} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore, collection, query, where, orderBy, limit, getCountFromServer, getDocs, Timestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {initializeAppCheck, ReCaptchaV3Provider} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import {counterConfig} from './config.example.mjs';

const APPS=['fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files'];
let state;
function setup(){
 if(!counterConfig.enabled||counterConfig.projectId!=='split-it-44dea'
 ||counterConfig.firebase?.projectId!=='split-it-44dea'||!counterConfig.firebase.apiKey
 ||!counterConfig.firebase.appId||!counterConfig.appCheckSiteKey)
  throw Error('APK counting is disabled');
 if(!state){
  const app=initializeApp(counterConfig.firebase,'cuberoot-apk-report');
  initializeAppCheck(app,{provider:new ReCaptchaV3Provider(counterConfig.appCheckSiteKey),isTokenAutoRefreshEnabled:true});
  state={auth:getAuth(app),db:getFirestore(app)};
 }
 return state;
}
export async function signInForApkReport(email,password){
 const {auth}=setup();
 await setPersistence(auth,inMemoryPersistence);
 await signInWithEmailAndPassword(auth,email,password);
 // Rules check the exact owner UID; credentials alone do not grant read.
}
export async function signOutOfApkReport(){
 if(state)await signOut(state.auth);
}
function torontoMidnightUtc(now=new Date()){
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const p=Object.fromEntries(fmt.formatToParts(now).map(x=>[x.type,x.value]));
 const y=+p.year,m=+p.month,d=+p.day;
 // Toronto local midnight is 04:00 or 05:00 UTC, including DST changes.
 for(let h=0;h<10;h++){
  const instant=new Date(Date.UTC(y,m-1,d,h));
  const a=Object.fromEntries(fmt.formatToParts(instant).map(x=>[x.type,x.value]));
  if(+a.year===y&&+a.month===m&&+a.day===d&&+a.hour===0&&+a.minute===0)return instant;
 }
 throw Error('Unable to determine Toronto day boundary');
}
export async function fetchPrivateApkReport(){
 const {auth,db}=setup();
 if(!auth.currentUser||auth.currentUser.isAnonymous)throw Error('Owner sign-in required');
 const since=Timestamp.fromDate(torontoMidnightUtc());
 const counts={},events=[];
 for(const app of APPS){
  const ref=collection(db,'cuberoot_apk_clicks_v1',app,'events');
  const [all,today,recent]=await Promise.all([
   getCountFromServer(ref),
   getCountFromServer(query(ref,where('createdAt','>=',since))),
   getDocs(query(ref,orderBy('createdAt','desc'),limit(5)))
  ]);
  counts[app]={total:all.data().count,today:today.data().count};
  for(const snapshot of recent.docs){
   const item=snapshot.data();
   if(item.createdAt?.toDate)events.push({app,at:item.createdAt.toDate().toISOString(),timezone:item.timezone||'Unknown'});
  }
 }
 events.sort((a,b)=>b.at.localeCompare(a.at));
 return {counts,events:events.slice(0,20)};
}
