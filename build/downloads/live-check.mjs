// Explicit owner-authorized acceptance only: three real downloads, real SDK,
// real public counter reads. Never POST a fabricated click or delete a record.
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const base='https://www.cuberoot-systems.com';
const db='https://firestore.googleapis.com/v1/projects/split-it-44dea/databases/(default)/documents/cuberoot_apk_clicks_v1/';
const key='AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78';
const evidence=process.env.EVIDENCE_DIR||resolve(tmpdir(),'cuberoot-live-downloads');
await mkdir(evidence,{recursive:true});
async function json(url,options={}){
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('HTTP '+r.status+' from '+new URL(url).hostname);
 return r.json();
}
async function query(app,kind,payload){return json(db+app+':'+kind+'?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})}
async function count(app){
 const rows=await query(app,'runAggregationQuery',{structuredAggregationQuery:{structuredQuery:{from:[{collectionId:'events'}]},aggregations:[{alias:'clicks',count:{}}]}});
 const raw=rows?.[0]?.result?.aggregateFields?.clicks?.integerValue;
 assert.equal(rows.length,1);assert.match(raw,/^\d+$/);assert(Number.isSafeInteger(Number(raw)));return Number(raw);
}
async function recent(app){
 const rows=await query(app,'runQuery',{structuredQuery:{from:[{collectionId:'events'}],orderBy:[{field:{fieldPath:'createdAt'},direction:'DESCENDING'}],limit:10}});
 return rows.filter(x=>x.document).map(x=>x.document);
}
const desktop=await json(base+'/downloads/ate-desktop-build.json?verify='+Date.now());
const android=await json(base+'/downloads/ate-build.json?verify='+Date.now());
assert.equal(desktop.app,'ATE');assert.equal(android.app,'ATE');
const cases=[
 {app:'ate-windows',page:'/',file:'ate-windows.exe',meta:desktop.windows},
 {app:'ate-mac',page:'/ate/',file:'ate-mac.dmg',meta:desktop.mac},
 {app:'ate',page:'/ate/',file:'ate.apk',meta:{run_id:android.run_id,bytes:android.apk_bytes,sha256:android.apk_sha256}}
];
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({acceptDownloads:true,timezoneId:'America/Toronto'});
const page=await context.newPage();
const result=[];
try{
 for(const item of cases){
  const before=await count(item.app),old=new Set((await recent(item.app)).map(d=>d.name));
  await page.goto(base+item.page,{waitUntil:'domcontentloaded'});
  const tracker=await page.locator('script[src*="apk-firebase-track.js"]').getAttribute('src');
  assert(tracker,'published page must already load the tracker');
  await page.evaluate(src=>import(new URL(src,location.href).href),tracker);
  const link=page.locator('a[download][href*="downloads/'+item.file+'?"]').first();
  await link.waitFor({state:'visible'});
  const href=await link.getAttribute('href');
  assert.equal(new URL(href,page.url()).searchParams.get('build'),String(item.meta.run_id));
  const started=Date.now(),downloadPromise=page.waitForEvent('download',{timeout:30000});
  await link.click();const download=await downloadPromise;
  const path=resolve(evidence,item.file);await download.saveAs(path);
  const bytes=await readFile(path);
  assert.equal(bytes.length,item.meta.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.meta.sha256);
  let recorded,after;
  for(let attempt=0;attempt<30;attempt++){
   after=await count(item.app);
   const records=await recent(item.app);
   recorded=records.find(d=>!old.has(d.name)&&d.fields?.app?.stringValue===item.app&&d.fields?.timezone?.stringValue==='America/Toronto'&&d.fields?.build?.stringValue===String(item.meta.run_id)&&Date.parse(d.fields?.createdAt?.timestampValue)>=started-5000);
   if(recorded&&after>=before+1)break;
   await page.waitForTimeout(2000);
  }
  assert(recorded&&after>=before+1,'Actual anonymous browser click must create a matching timestamp/build/timezone event');
  result.push({app:item.app,page:item.page,before,after,timezone:recorded.fields.timezone.stringValue,at:recorded.fields.createdAt.timestampValue,build:String(item.meta.run_id),download_bytes:bytes.length,sha256:item.meta.sha256});
  console.log('PASS: real '+item.app+' download, file checksum and anonymous click/timezone event; counter '+before+' -> '+after);
 }
 await writeFile(resolve(evidence,'live-click-verification.json'),JSON.stringify({source:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,kind:'owner-authorized real verification downloads',results:result},null,2)+'\n');
}finally{await context.close();await browser.close()}
