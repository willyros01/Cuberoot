// Independent best-effort download click counter. Does not change anchors.
// No Firebase Auth or persistent visitor identifiers are used.
// A record is a CLICK attempt, never proof that a file was downloaded.
import {identifyDownload} from './download-apps.js?v=1';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getFirestore,doc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebase={
 apiKey:'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78',
 authDomain:'split-it-44dea.firebaseapp.com',
 projectId:'split-it-44dea',
 storageBucket:'split-it-44dea.firebasestorage.app',
 messagingSenderId:'153404639150',
 appId:'1:153404639150:web:d3ad24b871ce0239a9aa3f'
};
let db;
function database(){
 if(!db)db=getFirestore(initializeApp(firebase,'cuberoot-public-apk-clicks'));
 return db;
}
function timezone(){
 const value=Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown';
 return /^[A-Za-z0-9_+./-]{1,64}$/.test(value)?value:'Unknown';
}
document.addEventListener('click',event=>{
 try{
  const anchor=event.target?.closest?.('a[download]');
  if(!anchor)return;
  const item=identifyDownload(anchor.href,location.href);
  if(!item)return;
  // Never cancel, preventDefault, change href, or wait for the download.
  setTimeout(()=>{
   try{
    const id=crypto.randomUUID();
    // No retry on failure, no browser storage, no cookies.
    void setDoc(doc(database(),'cuberoot_apk_clicks_v1',item.app,'events',id),{
     app:item.app,createdAt:serverTimestamp(),timezone:timezone(),build:item.build
    }).catch(()=>{});
   }catch{}
  },0);
 }catch{}
},{passive:true});
