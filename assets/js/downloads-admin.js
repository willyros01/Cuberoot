import {cockpit} from './downloads-ui.js?v=2.0.0';
import {ownerSignedIn,signInOwner,signOutOwner,loadOwnerReport} from './apk-firebase-report.js?v=2';

// Only called after Cuberoot Publish has been unlocked with its vault passphrase.
// Google sign-in is a separate, explicit owner-only authorization.
export function downloadsTab(){
 const root=document.createElement('section');
 const actions=document.createElement('div');
 actions.className='dc-toolbar';
 const login=document.createElement('button');
 login.className='btn';
 login.type='button';
 login.textContent='Sign in with Google';
 const logout=document.createElement('button');
 logout.className='btn btn-ghost';
 logout.type='button';
 logout.textContent='Sign out of statistics';
 const status=document.createElement('p');
 status.className='dc-status';
 status.setAttribute('role','status');
 status.setAttribute('aria-live','polite');
 actions.append(login,logout);
 root.append(actions,status);
 function show(){
  const signed=ownerSignedIn();
  login.hidden=signed;
  logout.hidden=!signed;
  const previous=root.querySelector('[data-report-container]');
  if(previous)previous.remove();
  if(signed){
   status.textContent='Signed in. Counts include recorded clicks only.';
   const panel=document.createElement('div');
   panel.setAttribute('data-report-container','');
   panel.append(cockpit({load:loadOwnerReport}));
   root.append(panel);
  }else{
   status.textContent='Private statistics. Sign in with the verified Google owner account.';
  }
 }
 login.addEventListener('click',async()=>{
  login.disabled=true;
  status.textContent='Opening Google sign-in…';
  try{
   await signInOwner();
   show();
  }catch(error){
   status.textContent=error?.code
    ? 'Google sign-in failed: '+String(error.code).replace(/[^a-zA-Z0-9/-]/g,'')
    : error?.message==='This Google account is not the authorized cockpit owner.'
      ? error.message
      : 'Google sign-in did not complete. Open Cuberoot Publish directly in Safari.';
  }finally{login.disabled=false;}
 });
 logout.addEventListener('click',async()=>{
  logout.disabled=true;
  try{await signOutOwner();show();}
  finally{logout.disabled=false;}
 });
 show();
 return root;
}
