// Browser integration: real site modules/CSP and download actions; no live writes.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const evidence=process.env.EVIDENCE_DIR||resolve(tmpdir(),'cuberoot-download-web');
await mkdir(evidence,{recursive:true});
const admin=await readFile(resolve(root,'admin/index.html'),'utf8');
const csp=admin.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/__tests__/cockpit.html'){
   res.setHeader('Content-Type','text/html');
   res.end(`<meta http-equiv="Content-Security-Policy" content="${csp}"><link rel="stylesheet" href="/assets/css/downloads-admin.css"><main id="test"></main><script type="module" src="/__tests__/boot.js"></script>`);return;
  }
  if(path==='/__tests__/boot.js'){
   res.setHeader('Content-Type','text/javascript');
   res.end(`import {cockpit} from '/assets/js/downloads-ui.js';import * as api from '/assets/js/apk-firebase-report.js';window.api=api;document.querySelector('#test').append(cockpit({load:api.loadOwnerReport}));`);return;
  }
  const file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!file.startsWith(root+'/'))throw Error('outside root');
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[extname(file)]||'application/octet-stream');
  res.end(await readFile(file));
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true,timezoneId:'America/Toronto',viewport:{width:1280,height:1000}});
const firebaseApp=`export const initializeApp=(config,name)=>({config,name});`;
const firebaseAuth=`export const initializeAuth=()=>{const a={currentUser:{uid:'EJoRDnKQiGcDgw8RP1RRtkyei8K2'}};window.testAuth=a;return a};export class GoogleAuthProvider{setCustomParameters(){}};export const inMemoryPersistence={};export const browserPopupRedirectResolver={};export const signInWithPopup=async()=>({user:window.testAuth.currentUser});export const signOut=async()=>{window.testAuth.currentUser=null};`;
const firebaseStore=`
export const getFirestore=()=>({});
export const doc=(db,...parts)=>({parts});
export const serverTimestamp=()=>({serverTimestamp:true});
export const setDoc=(ref,data)=>{(window.writes??=[]).push({ref,data});return window.rejectWrites?Promise.reject(Error('permission denied')):Promise.resolve()};
const names=['fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files','marker','ate-windows','ate-mac','ate'];
export const collection=(db,...parts)=>({app:parts[1],parts});
export const query=(records,...constraints)=>({...records,constraints});
export const where=(...args)=>({where:args});export const orderBy=(...args)=>({orderBy:args});export const limit=n=>({limit:n});
export const Timestamp={fromDate:d=>d.toISOString()};
function gate(q){(window.queries??=[]).push(q);if(window.denyApp===q.app){const e=Error('Denied');e.code='permission-denied';throw e}}
export async function getCountFromServer(q){gate(q);const i=names.indexOf(q.app)+1;return {data:()=>({count:i*(q.constraints?1:10)})}}
export async function getDocs(q){gate(q);return {docs:q.app.startsWith('ate')?[{data:()=>({createdAt:{toDate:()=>new Date('2026-11-12T14:00:00Z')},timezone:q.app==='ate-mac'?'Europe/London':'Asia/Manila'})}]:Array.from({length:5},(_,i)=>({data:()=>({createdAt:{toDate:()=>new Date(Date.parse('2026-11-12T15:00:00Z')-i*1000)},timezone:'America/Toronto'})}))}};
`;
await context.route('https://www.gstatic.com/firebasejs/**',route=>{
 const url=route.request().url();const body=url.includes('firebase-firestore')?firebaseStore:url.includes('firebase-auth')?firebaseAuth:firebaseApp;
 return route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body});
});
await context.route('https://firestore.googleapis.com/**',async route=>{
 assert(!route.request().headers().authorization,'readiness probe must not use owner authentication');
 const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'};
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
 const denied=await route.request().frame().evaluate(()=>window.denyATE);
 return route.fulfill({status:denied?403:200,contentType:'application/json',headers,body:JSON.stringify(denied?{error:{status:'PERMISSION_DENIED'}}:[{result:{aggregateFields:{clicks:{integerValue:'0'}}}}])});
});
await context.route('**/downloads/*',route=>/\.(apk|exe|dmg)(\?|$)/.test(route.request().url())?route.fulfill({contentType:'application/octet-stream',headers:{'content-disposition':'attachment'},body:'download test fixture'}):route.continue());
const page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
try{
 for(const pathname of ['/','/ate/']){
  await page.goto(origin+pathname);
  const links=['ate-windows.exe','ate-mac.dmg','ate.apk'];
  for(const file of links){
   const selector=`a[download][href*="downloads/${file}?"]`;
   await page.waitForSelector(selector);
   const link=page.locator(selector).first();const href=await link.getAttribute('href');
   const before=await page.evaluate(()=>window.writes?.length||0);
   const download=page.waitForEvent('download');await link.click();await download;
   await page.waitForFunction(n=>(window.writes?.length||0)===n+1,before);
   assert.equal(await link.getAttribute('href'),href,'tracking must preserve download URL');
   const write=await page.evaluate(()=>window.writes.at(-1));
   const slug=file==='ate.apk'?'ate':file==='ate-mac.dmg'?'ate-mac':'ate-windows';
   assert.deepEqual(write.ref.parts.slice(0,3),['cuberoot_apk_clicks_v1',slug,'events']);
   assert.match(write.ref.parts[3],/^[a-f0-9-]{36}$/);assert.equal(write.data.app,slug);
   assert.equal(write.data.timezone,'America/Toronto');assert.deepEqual(write.data.createdAt,{serverTimestamp:true});
   assert.match(write.data.build,/^[0-9]+$/);
  }
  // Failed writes must not block a download, alter its URL or retry.
  await page.evaluate(()=>window.rejectWrites=true);
  const before=await page.evaluate(()=>window.writes.length);
  const download=page.waitForEvent('download');await page.locator('a[download][href*="ate.apk?"]').first().click();await download;
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.writes.length),before+1);
  console.log('PASS: '+pathname+' all three ATE downloads record one timestamp/build/timezone event; failed writes preserve downloads');
 }
 const identification=await page.evaluate(async()=>{
  const {identifyDownload,DOWNLOAD_APPS}=await import('/assets/js/download-apps.js');
  const good=Object.keys(DOWNLOAD_APPS).map(app=>identifyDownload('/downloads/'+(app==='ate-mac'?'ate-mac.dmg':app==='ate-windows'?'ate-windows.exe':app+'.apk')+'?build=123',location.href));
  const bad=['https://evil.example/downloads/ate.apk','/downloads/other.apk','/downloads/ate-windows.apk','/downloads/ate.exe','/downloads/ate-mac.dmg.extra','/downloads/ate.apk/extra'].map(x=>identifyDownload(x,location.href));
  return {good,bad,invalidBuild:identifyDownload('/downloads/ate.apk?build=oops',location.href)};
 });
 assert.equal(identification.good.length,10);assert.equal(new Set(identification.good.map(x=>x.app)).size,10);assert(identification.bad.every(x=>x===null));assert.equal(identification.invalidBuild.build,'');
 console.log('PASS: seven existing APKs retained; exact same-origin ATE APK/EXE/DMG paths only');
 await page.addInitScript(()=>{window.denyATE=true});
 await page.goto(origin+'/__tests__/cockpit.html');
 await page.waitForSelector('[data-app="ate-mac"]');
 await page.waitForFunction(()=>document.querySelector('[data-app="ate-mac"]').textContent.includes('Setup pending'));
 assert.equal(await page.locator('.dc-app').count(),10);assert.equal(await page.locator('.dc-total-primary strong').textContent(),'—');
 assert.equal(await page.locator('[data-app="fidunio"] strong').textContent(),'10');
 await page.screenshot({path:resolve(evidence,'cockpit-pending.png'),fullPage:true});
 await page.selectOption('#dc-app','ate-mac');assert.match(await page.locator('.dc-content').textContent(),/Setup pending/);
 assert(!/No recorded clicks/.test(await page.locator('.dc-content').textContent()));
 await page.evaluate(()=>window.denyATE=false);await page.locator('.dc-refresh').click();
 await page.waitForFunction(()=>document.querySelector('[data-app="ate-mac"] strong').textContent==='90');
 assert.match(await page.locator('.dc-events').textContent(),/ATE Mac Universal.*London.*Europe\/London/s);
 // ATE's event is older than 35 other app events: platform filtering must retain it.
 await page.selectOption('#dc-app','');assert.equal(await page.locator('.dc-total-primary strong').textContent(),'550');
 await page.screenshot({path:resolve(evidence,'cockpit-active-fixture.png'),fullPage:true});
 await page.selectOption('#dc-app','ate');await page.fill('#dc-from','2026-11-12');await page.fill('#dc-to','2026-11-12');await page.locator('.dc-apply').click();
 await page.waitForFunction(()=>document.querySelector('[data-app="ate"] strong').textContent==='10');
 const queries=await page.evaluate(()=>window.queries);
 assert(queries.some(q=>q.constraints?.some(c=>c.where?.[1]==='>='&&c.where[2]==='2026-11-12T05:00:00.000Z')));
 assert(queries.some(q=>q.constraints?.some(c=>c.where?.[1]==='<'&&c.where[2]==='2026-11-13T05:00:00.000Z')));
 assert.match(await page.locator('.dc-events').textContent(),/ATE Android.*Manila/s);
 assert.match(await page.locator('.dc-footnote').textContent(),/not a verified location/);
 await page.evaluate(()=>window.denyApp='fidunio');await page.locator('.dc-refresh').click();
 await page.waitForFunction(()=>document.querySelector('.dc-status').textContent.includes('Unable to load'));
 assert.equal(await page.locator('.dc-total-primary strong').textContent(),'—');
 await page.evaluate(()=>window.testAuth.currentUser=null);
 assert.equal(await page.evaluate(async()=>{try{await window.api.loadOwnerReport();return false}catch(e){return e.message.includes('owner')}}),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: public readiness gate distinguishes owner-readable empty collections from activated ATE tracking; existing counts/activation/filter/date ranges/timezone location/all-ten totals; established failures and signed-out access fail closed');
}finally{await context.close();await browser.close();server.close();}
