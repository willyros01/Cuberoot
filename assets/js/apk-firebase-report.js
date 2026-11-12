// Cuberoot private download cockpit: owner Google account; memory-only session.
import {DOWNLOAD_APPS,ATE_APPS} from './download-apps.js?v=1';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {initializeAuth,GoogleAuthProvider,signInWithPopup,inMemoryPersistence,browserPopupRedirectResolver,signOut}
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore,collection,query,where,orderBy,limit,getCountFromServer,getDocs,Timestamp}
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {torontoRange} from './apk-date-window.js?v=1';

const firebase={
 apiKey:'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78',
 authDomain:'split-it-44dea.firebaseapp.com',
 projectId:'split-it-44dea',
 storageBucket:'split-it-44dea.firebasestorage.app',
 messagingSenderId:'153404639150',
 appId:'1:153404639150:web:d3ad24b871ce0239a9aa3f'
};
const OWNER_UID='EJoRDnKQiGcDgw8RP1RRtkyei8K2';
const APPS=Object.keys(DOWNLOAD_APPS);
let session;
function setup(){
 if(session)return session;
 const app=initializeApp(firebase,'cuberoot-private-apk-report');
 session={
  auth:initializeAuth(app,{
   persistence:inMemoryPersistence,
   popupRedirectResolver:browserPopupRedirectResolver
  }),
  db:getFirestore(app)
 };
 return session;
}
export function ownerSignedIn(){
 return setup().auth.currentUser?.uid===OWNER_UID;
}
export async function signInOwner(){
 const auth=setup().auth;
 const provider=new GoogleAuthProvider();
 provider.setCustomParameters({prompt:'select_account'});
 const credential=await signInWithPopup(auth,provider);
 if(credential.user.uid!==OWNER_UID){
  await signOut(auth);
  throw new Error('This Google account is not the authorized cockpit owner.');
 }
 return true;
}
export async function signOutOwner(){
 if(session)await signOut(session.auth);
}
function startOfTorontoDay(now=new Date()){
 const formatter=new Intl.DateTimeFormat('en-CA',{
  timeZone:'America/Toronto',year:'numeric',month:'2-digit',
  day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 });
 const local=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
 const y=+local.year,m=+local.month,d=+local.day;
 for(let h=0;h<=9;h++){
  const instant=new Date(Date.UTC(y,m-1,d,h));
  const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
  if(+parts.year===y&&+parts.month===m&&+parts.day===d&&+parts.hour===0&&+parts.minute===0)return instant;
 }
 throw new Error('Unable to determine Toronto reporting day.');
}
async function publicATECounterReady(app){
 // Owner reads can succeed before the public allowlist is activated. Probe
 // the public aggregate with no Auth token/cookies so that zero is not proof
 // of activation. This performs no writes or synthetic click generation.
 const url='https://firestore.googleapis.com/v1/projects/'+firebase.projectId+'/databases/(default)/documents/cuberoot_apk_clicks_v1/'+app+':runAggregationQuery?key='+firebase.apiKey;
 const response=await fetch(url,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredAggregationQuery:{structuredQuery:{from:[{collectionId:'events'}]},aggregations:[{alias:'clicks',count:{}}]}})});
 if(response.status===403)return false;
 if(!response.ok)throw new Error('ATE counter readiness unavailable');
 const rows=await response.json();
 const raw=rows?.[0]?.result?.aggregateFields?.clicks?.integerValue;
 if(!Array.isArray(rows)||rows.length!==1||typeof raw!=='string'||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error('Invalid ATE readiness count');
 return true;
}
export async function loadOwnerReport(range=null){
 const {auth,db}=setup();
 if(auth.currentUser?.uid!==OWNER_UID)throw new Error('Please sign in as the cockpit owner.');
 // No range = the original Today + lifetime view, unchanged.
 // Selected dates use inclusive Toronto days, with an exclusive next-day
 // boundary to handle 23/25-hour daylight-saving days correctly.
 const selected=range?torontoRange(range.from,range.to):null;
 const since=selected?null:Timestamp.fromDate(startOfTorontoDay());
 const results=await Promise.all(APPS.map(async app=>{
  try{
  if(ATE_APPS.includes(app)&&!await publicATECounterReady(app))return {app,pending:true};
  const records=collection(db,'cuberoot_apk_clicks_v1',app,'events');
  const period=selected
   ?query(records,where('createdAt','>=',Timestamp.fromDate(selected.start)),
           where('createdAt','<',Timestamp.fromDate(selected.end)))
   :query(records,where('createdAt','>=',since));
  const recent=selected
   ?query(records,where('createdAt','>=',Timestamp.fromDate(selected.start)),
           where('createdAt','<',Timestamp.fromDate(selected.end)),
           orderBy('createdAt','desc'),limit(5))
   :query(records,orderBy('createdAt','desc'),limit(5));
  // No partial results. A failed query must not appear as zero.
  const [allTime,periodCount,recentDocs]=await Promise.all([
   getCountFromServer(records),
   getCountFromServer(period),
   getDocs(recent)
  ]);
  const events=[];
  for(const record of recentDocs.docs){
   const value=record.data();
   if(value.createdAt?.toDate){
    events.push({app,at:value.createdAt.toDate().toISOString(),timezone:typeof value.timezone==='string'?value.timezone:'Unknown'});
   }
  }
  return {app,total:allTime.data().count,period:periodCount.data().count,events};
  }catch(error){
   // Pending ATE activation must not hide the seven existing app reports.
   // Permission/network failures for established categories still fail closed.
   if(ATE_APPS.includes(app)&&error?.code==='permission-denied')return {app,pending:true};
   throw error;
  }
 }));
 const counts={},events=[],pending=[];
 for(const result of results){
  if(result.pending){pending.push(result.app);continue;}
  counts[result.app]={total:result.total};
  counts[result.app][selected?'range':'today']=result.period;
  events.push(...result.events);
 }
 events.sort((a,b)=>b.at.localeCompare(a.at));
 return {counts,events:events.slice(0,20),pending};
}
