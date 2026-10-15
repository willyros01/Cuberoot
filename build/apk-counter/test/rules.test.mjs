// ISOLATED Firebase Local Emulator Suite tests. Never connects to production.
// Run only as "firebase emulators:exec --project demo-cuberoot-apk".
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, collection, getDoc, getDocs, getCountFromServer, query,
        orderBy, limit, setDoc, updateDoc, deleteDoc, Timestamp}
  from 'firebase/firestore';

const PROJECT = 'demo-cuberoot-apk';
const rules = readFileSync(new URL('../firestore.rules.template', import.meta.url),'utf8');
const ownerMatch = /function isOwner\(\)\s*\{[^}]*request\.auth\.uid == '([^']+)'/.exec(rules);
assert(ownerMatch, 'Missing exact owner UID in staged security rules');
const OWNER = ownerMatch[1];
assert.match(OWNER,/^[A-Za-z0-9]{20,128}$/,'Invalid staged owner UID');
assert.equal(rules.includes('REPLACE_WITH_OWNER_UID'),false);
assert.equal(rules.includes('allow create: if false;'),true);
assert.equal(rules.includes('allow update, delete: if false;'),true);
assert.match(rules,/match \/households\/\{code\}\/\{document=\*\*\} \{\s*allow read, write: if true;\s*\}/);
assert.equal(rules.includes('REPLACE_WITH_MAIL_REPORTER_UID'),true,
  'Do not activate email without an actual reporter UID');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST === undefined,false,
  'Refuse to run without FIRESTORE_EMULATOR_HOST');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST.includes('127.0.0.1') ||
             process.env.FIRESTORE_EMULATOR_HOST.includes('localhost'),true,
  'Refuse any non-local Firestore emulator');

const env = await initializeTestEnvironment({projectId:PROJECT,firestore:{rules}});
const EVENT = 'cuberoot_apk_clicks_v1/fidunio/events/550e8400-e29b-41d4-a716-446655440000';
const NEW_EVENT = 'cuberoot_apk_clicks_v1/fidunio/events/550e8400-e29b-41d4-a716-446655440001';
const HOUSEHOLD = 'households/emulator-scope/records/first';
const now = Timestamp.fromDate(new Date('2026-10-15T15:00:00Z'));
const valid = {app:'fidunio',createdAt:now,timezone:'America/Toronto',build:'123456'};
let passed = 0;
async function check(label,work){
  await work();
  passed++;
  console.log('PASS:',label);
}
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async(context)=>{
    const db=context.firestore();
    await setDoc(doc(db,EVENT),valid);
    await setDoc(doc(db,HOUSEHOLD),{counterTest:'existing household behavior'});
  });
  const owner=env.authenticatedContext(OWNER).firestore();
  const stranger=env.authenticatedContext('not-the-cuberoot-owner').firestore();
  const reporter=env.authenticatedContext('REPLACE_WITH_MAIL_REPORTER_UID').firestore();
  const anonymous=env.unauthenticatedContext().firestore();
  const event=doc(owner,EVENT);
  await check('owner may read own APK event',async()=>assertSucceeds(getDoc(event)));
  await check('owner may list recent APK events',async()=>assertSucceeds(
    getDocs(query(collection(owner,'cuberoot_apk_clicks_v1/fidunio/events'),
    orderBy('createdAt','desc'),limit(5)))));
  await check('owner may aggregate recorded count',async()=>assertSucceeds(
    getCountFromServer(collection(owner,'cuberoot_apk_clicks_v1/fidunio/events'))));
  await check('dedicated reporter may read, but not write',async()=>{
    await assertSucceeds(getDoc(doc(reporter,EVENT)));
    await assertFails(setDoc(doc(reporter,NEW_EVENT),valid));
  });
  await check('other signed-in user cannot read',async()=>{
    await assertFails(getDoc(doc(stranger,EVENT)));
    await assertFails(getDocs(collection(stranger,'cuberoot_apk_clicks_v1/fidunio/events')));
    await assertFails(getCountFromServer(collection(stranger,'cuberoot_apk_clicks_v1/fidunio/events')));
  });
  await check('unauthenticated user cannot read',async()=>{
    await assertFails(getDoc(doc(anonymous,EVENT)));
    await assertFails(getDocs(collection(anonymous,'cuberoot_apk_clicks_v1/fidunio/events')));
  });
  await check('all clients cannot create counter events while disabled',async()=>{
    for(const db of [anonymous,stranger,owner,reporter]){
      await assertFails(setDoc(doc(db,NEW_EVENT),valid));
    }
  });
  await check('even the owner cannot update or delete events',async()=>{
    await assertFails(updateDoc(event,{timezone:'UTC'}));
    await assertFails(deleteDoc(event));
  });
  await check('other collections remain closed by default',async()=>{
    await assertFails(getDoc(doc(anonymous,'apk_counter_other/private')));
    await assertFails(setDoc(doc(anonymous,'apk_counter_other/private'),{a:1}));
  });
  await check('original household rule retains unauthenticated read/write',async()=>{
    await assertSucceeds(getDoc(doc(anonymous,HOUSEHOLD)));
    await assertSucceeds(setDoc(doc(anonymous,'households/emulator-scope/records/second'),{x:1}));
    await assertSucceeds(updateDoc(doc(anonymous,HOUSEHOLD),{x:2}));
    await assertSucceeds(deleteDoc(doc(anonymous,HOUSEHOLD)));
  });
  console.log('SECURITY RULES EMULATOR RESULTS:',passed,'PASS; 0 FAIL. No live Firebase access.');
}finally{
  await env.cleanup();
}
