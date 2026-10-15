// Test public click-create rules against the LOCAL emulator only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,
        getCountFromServer} from 'firebase/firestore';
const HOST=process.env.FIRESTORE_EMULATOR_HOST||'';
assert.match(HOST,/^(127\.0\.0\.1|localhost):[0-9]{2,5}$/,'Never run against production');
const rules=readFileSync(new URL('../firestore.rules.public.template',import.meta.url),'utf8');
const owner=/request\.auth\.uid == '([^']+)'/.exec(rules)?.[1];
assert.match(owner||'',/^[A-Za-z0-9]{20,128}$/);
const env=await initializeTestEnvironment({projectId:'demo-cuberoot-apk',firestore:{rules}});
const uuid='550e8400-e29b-41d4-a716-446655440000';
const other='550e8400-e29b-41d4-a716-446655440001';
const ref='cuberoot_apk_clicks_v1/fidunio/events/';
const valid=()=>({app:'fidunio',createdAt:serverTimestamp(),timezone:'America/Toronto',build:'12'});
let count=0;
async function run(name,test){await test();count++;console.log('PASS:',name)}
try{
 await env.clearFirestore();
 const publicDb=env.unauthenticatedContext().firestore();
 const ownerDb=env.authenticatedContext(owner).firestore();
 const intruder=env.authenticatedContext('not-owner').firestore();
 await run('public valid document CREATE allowed',()=>assertSucceeds(setDoc(doc(publicDb,ref+uuid),valid())));
 await run('owner can GET LIST and COUNT',async()=>{
  await assertSucceeds(getDoc(doc(ownerDb,ref+uuid)));
  await assertSucceeds(getDocs(collection(ownerDb,'cuberoot_apk_clicks_v1/fidunio/events')));
  await assertSucceeds(getCountFromServer(collection(ownerDb,'cuberoot_apk_clicks_v1/fidunio/events')));
 });
 await run('public and other logged-in users cannot READ',async()=>{
  for(const db of [publicDb,intruder]){
   await assertFails(getDoc(doc(db,ref+uuid)));
   await assertFails(getDocs(collection(db,'cuberoot_apk_clicks_v1/fidunio/events')));
   await assertFails(getCountFromServer(collection(db,'cuberoot_apk_clicks_v1/fidunio/events')));
  }
 });
 await run('public cannot overwrite, update or delete',async()=>{
  await assertFails(setDoc(doc(publicDb,ref+uuid),valid()));
  await assertFails(updateDoc(doc(publicDb,ref+uuid),{build:'11'}));
  await assertFails(deleteDoc(doc(publicDb,ref+uuid)));
 });
 await run('owner cannot update or delete events',async()=>{
  await assertFails(updateDoc(doc(ownerDb,ref+uuid),{build:'11'}));
  await assertFails(deleteDoc(doc(ownerDb,ref+uuid)));
 });
 await run('invalid record fields rejected',async()=>{
  await assertFails(setDoc(doc(publicDb,ref+other),{...valid(),extra:'injected'}));
  await assertFails(setDoc(doc(publicDb,ref+other),{...valid(),app:'wire'}));
  await assertFails(setDoc(doc(publicDb,ref+other),{...valid(),timezone:'<bad>'}));
  await assertFails(setDoc(doc(publicDb,ref+other),{...valid(),build:'unexpected'}));
  await assertFails(setDoc(doc(publicDb,ref+other),{...valid(),createdAt:new Date('2020-01-01')}));
  await assertFails(setDoc(doc(publicDb,ref+'not-uuid'),valid()));
 });
 await run('other apps and paths cannot write',async()=>{
  await assertFails(setDoc(doc(publicDb,'cuberoot_apk_clicks_v1/unknown/events/'+uuid),valid()));
  await assertFails(setDoc(doc(publicDb,'other_collection/test'),{build:'123'}));
 });
 await run('original households behavior unchanged',async()=>{
  const x=doc(publicDb,'households/test-household/records/one');
  await assertSucceeds(setDoc(x,{source:'public'}));
  await assertSucceeds(getDoc(x));
  await assertSucceeds(updateDoc(x,{source:'updated'}));
  await assertSucceeds(deleteDoc(x));
 });
 console.log('PUBLIC CLICK RULES: '+count+' PASS / 0 FAIL; emulator only');
}finally{await env.cleanup()}
