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
}catch(e){
  login.disabled=true;
  const code=(typeof e?.code==='string' && /^auth\/[a-z0-9-]+$/.test(e.code))?e.code:'initialization-error';
  status.textContent='Google sign-in could not initialize. Error code: '+code+'. Please send this code only.';
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
      // Show the Firebase *code* only. Do not expose OAuth tokens,
      // credentials, URLs, or raw exception messages on this page.
      const reason=(typeof e?.code==='string' && /^auth\/[a-z0-9-]+$/.test(e.code))?e.code:'unknown';
      const msg={
        'auth/popup-blocked':'The Google popup was blocked.',
        'auth/unauthorized-domain':'This website is not authorized for Firebase Authentication.',
        'auth/operation-not-allowed':'Google sign-in is disabled in Firebase.',
        'auth/popup-closed-by-user':'The sign-in window closed before completion.',
        'auth/cancelled-popup-request':'A second sign-in interrupted the first.',
        'auth/network-request-failed':'The browser could not reach Firebase.',
        'auth/operation-not-supported-in-this-environment':'This browser environment cannot support the popup.',
        'auth/invalid-api-key':'Firebase rejected the public web API key.',
        'auth/configuration-not-found':'Firebase Authentication configuration was not found.',
        'auth/internal-error':'Firebase returned an internal sign-in error.',
        'auth/web-storage-unsupported':'Browser storage is not available.'
      }[reason]||'Please send this error code so we can diagnose it.';
      status.textContent='Sign-in FAILED. Firebase error code: '+reason+'. '+msg;
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
