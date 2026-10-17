import {cockpit} from './downloads-ui.js?v=2.1.2';

// Firebase's large SDK is intentionally NOT a static import. Only the
// private sign-in prompt is visible before the owner is authenticated.
let reportPromise;
function reportModule(){
 if(!reportPromise)reportPromise=import('./apk-firebase-report.js?v=4').catch(error=>{
  reportPromise=null;
  throw error;
 });
 return reportPromise;
}

const APPS=['FIDUNIO','The Scorecard','Fairpot','Wire','SpendRecorder','Cloud Files','The Marker'];
export function downloadsTab(){
 const root=document.createElement('section');
 root.className='dc';
 root.setAttribute('aria-label','Private APK download cockpit');
 const intro=document.createElement('div');
 intro.className='dc-heading';
 const title=document.createElement('h1');
 title.textContent='Download cockpit';
 const subtitle=document.createElement('p');
 subtitle.className='dc-subtitle';
 subtitle.textContent='Your apps. Their reach. One simple view.';
 intro.append(title,subtitle);

 const actions=document.createElement('div');
 actions.className='dc-toolbar';
 const login=document.createElement('button');
 login.className='btn';
 login.type='button';
 login.textContent='Preparing Google sign-in…';
 login.disabled=true;
 const logout=document.createElement('button');
 logout.className='btn btn-ghost';
 logout.type='button';
 logout.textContent='Sign out of statistics';
 logout.hidden=true;
 actions.append(login,logout);

 const status=document.createElement('p');
 status.className='dc-status';
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 status.textContent='Cockpit ready. Connecting sign-in in the background…';

 // Build static placeholders off-screen; reveal real cockpit only after Google owner sign-in.
 const placeholder=document.createElement('div');
 placeholder.className='dc-content';
 placeholder.hidden=true;
 const h=document.createElement('h2');
 h.textContent='By app';
 const cards=document.createElement('div');
 cards.className='dc-apps';
 for(const name of APPS){
  const card=document.createElement('article');
  card.className='dc-app';
  const label=document.createElement('h3');
  label.textContent=name;
  const number=document.createElement('strong');
  number.textContent='—';
  card.append(label,number);
  cards.append(card);
 }
 const note=document.createElement('p');
 note.className='dc-status';
 note.textContent='Sign in to display recorded click counts.';
 placeholder.append(h,cards,note);
 const panel=document.createElement('div');
 panel.setAttribute('data-report-container','');
 panel.hidden=true;
 root.append(intro,actions,status,placeholder,panel);

 let api=null;
 function showSignedOut(){
  login.hidden=false;
  login.disabled=!api;
  login.textContent='Sign in with Google';
  logout.hidden=true;
  intro.hidden=false;
  placeholder.hidden=true;
  panel.hidden=true;
  panel.replaceChildren();
  status.textContent='Private statistics. Sign in with the verified Google owner account.';
 }
 function showSignedIn(){
  if(!root.isConnected||!api)return;
  login.hidden=true;
  logout.hidden=false;
  intro.hidden=true;
  placeholder.hidden=true;
  panel.hidden=false;
  panel.replaceChildren(cockpit({load:api.loadOwnerReport}));
  status.textContent='Signed in. Loading recorded clicks in the background…';
 }
 login.addEventListener('click',()=>{
  if(!api)return;
  login.disabled=true;
  status.textContent='Opening Google sign-in…';
  // Must begin directly in this click handler to avoid popup blocking.
  void api.signInOwner().then(()=>{
   if(root.isConnected)showSignedIn();
  }).catch(error=>{
   if(!root.isConnected)return;
   const code=typeof error?.code==='string'
    ?error.code.replace(/[^a-zA-Z0-9/-]/g,''):'';
   status.textContent=code?'Google sign-in failed: '+code:
    error?.message==='This Google account is not the authorized cockpit owner.'
      ?error.message:'Google sign-in did not complete. Open Cuberoot Publish directly in Safari.';
  }).finally(()=>{login.disabled=false;});
 });
 logout.addEventListener('click',()=>{
  if(!api)return;
  logout.disabled=true;
  void api.signOutOwner().then(()=>{
   if(root.isConnected)showSignedOut();
  }).catch(()=>{
   if(root.isConnected)status.textContent='Unable to sign out. Use Publish Lock to clear this session.';
  }).finally(()=>{logout.disabled=false;});
 });

 // Let the browser paint the private login prompt before importing Firebase.
 const afterPaint=()=>setTimeout(()=>{
  if(!root.isConnected)return;
  void reportModule().then(module=>{
   if(!root.isConnected)return;
   api=module;
   if(api.ownerSignedIn())showSignedIn();
   else showSignedOut();
  }).catch(()=>{
   if(root.isConnected)status.textContent='Google sign-in could not load. Refresh the page to retry.';
  });
 },0);
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(afterPaint);
 else setTimeout(afterPaint,0);
 return root;
}
