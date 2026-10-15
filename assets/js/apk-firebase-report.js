// Cuberoot private APK cockpit: owner Google account; memory-only session.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {initializeAuth,GoogleAuthProvider,signInWithPopup,inMemoryPersistence,browserPopupRedirectResolver,signOut}
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore,collection,query,where,orderBy,limit,getCountFromServer,getDocs,Timestamp}
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebase={
 apiKey:'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78',
 authDomain:'split-it-44dea.firebaseapp.com',
 projectId:'split-it-44dea',
 storageBucket:'split-it-44dea.firebasestorage.app',
 messagingSenderId:'153404639150',
 appId:'1:153404639150:web:d3ad24b871ce0239a9aa3f'
};
const OWNER_UID='EJoRDnKQiGcDgw8RP1RRtkyei8K2';
const APPS=['fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files'];
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
export async function loadOwnerReport(){
 const {auth,db}=setup();
 if(auth.currentUser?.uid!==OWNER_UID)throw new Error('Please sign in as the cockpit owner.');
 const since=Timestamp.fromDate(startOfTorontoDay());
 // Query all six apps concurrently instead of waiting for each app in turn.
 // Promise.all preserves APPS order and fails the whole report on any query error.
 const results=await Promise.all(APPS.map(async app=>{
  const records=collection(db,'cuberoot_apk_clicks_v1',app,'events');
  const [total,today,recent]=await Promise.all([
   getCountFromServer(records),
   getCountFromServer(query(records,where('createdAt','>=',since))),
   getDocs(query(records,orderBy('createdAt','desc'),limit(5)))
  ]);
  const events=[];
  for(const record of recent.docs){
   const value=record.data();
   if(value.createdAt?.toDate){
    events.push({app,at:value.createdAt.toDate().toISOString(),timezone:typeof value.timezone==='string'?value.timezone:'Unknown'});
   }
  }
  return {app,total:total.data().count,today:today.data().count,events};
 }));
 const counts={},events=[];
 for(const result of results){
  counts[result.app]={total:result.total,today:result.today};
  events.push(...result.events);
 }
 events.sort((a,b)=>b.at.localeCompare(a.at));
 return {counts,events:events.slice(0,20)};
}
