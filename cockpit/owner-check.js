// Temporary, isolated owner UID check. No Firestore import, no data writes.
// Public Firebase Web configuration: safe to publish. No credentials or tokens logged.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {initializeAuth, GoogleAuthProvider, signInWithPopup,
        browserPopupRedirectResolver, inMemoryPersistence, signOut}
    from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const config={
  apiKey:'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78',
  authDomain:'split-it-44dea.firebaseapp.com',
  projectId:'split-it-44dea',
  storageBucket:'split-it-44dea.firebasestorage.app',
  messagingSenderId:'153404639150',
  appId:'1:153404639150:web:d3ad24b871ce0239a9aa3f'
};
const login=document.getElementById('login');
const status=document.getElementById('status');
const result=document.getElementById('result');
const uid=document.getElementById('uid');
const copy=document.getElementById('copy');
let auth;
try{
  const app=initializeApp(config,'cuberoot-owner-check');
  auth=initializeAuth(app,{
    persistence:inMemoryPersistence,
    popupRedirectResolver:browserPopupRedirectResolver
  });
  status.textContent='Ready. Tap Sign in with Google.';
}catch{
  login.disabled=true;
  status.textContent='Sign-in could not initialize. Please report this screen.';
}
if(auth){
  login.addEventListener('click',async()=>{
    login.disabled=true;
    status.textContent='Waiting for Google sign-in…';
    try{
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      const response=await signInWithPopup(auth,provider);
      const value=response.user?.uid;
      if(typeof value!=='string'||value.length<4||value.length>160)throw new Error('uid-unavailable');
      uid.textContent=value;
      result.hidden=false;
      status.textContent='Google sign-in verified. Copy the Firebase user ID below.';
      // UID is all this page needs; do not keep an active auth session.
      try{await signOut(auth)}catch{}
    }catch(e){
      const reason=e?.code;
      const msg={
        'auth/popup-blocked':'Safari blocked the Google window. Open this page directly in Safari and allow the popup.',
        'auth/unauthorized-domain':'Cuberoot domain is not authorized in Firebase. Please send a screenshot.',
        'auth/operation-not-allowed':'Google sign-in is not enabled for this Firebase project.',
        'auth/popup-closed-by-user':'Google sign-in was closed before completion. Try again.',
        'auth/cancelled-popup-request':'A second sign-in request interrupted the first. Try again.',
        'auth/network-request-failed':'Network error. Check connectivity, then try again.'
      }[reason]||'Google sign-in did not finish. Please send a screenshot of this screen.';
      status.textContent=msg;
      result.hidden=true;
      uid.textContent='';
    }finally{
      login.disabled=false;
    }
  });
}
copy.addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(uid.textContent);
    status.textContent='Firebase user ID copied. You can close this tab.';
  }catch{
    status.textContent='Copy unavailable. Select and copy the ID shown above.';
  }
});
