import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{eligible,filters} from './worker.mjs';
const base='https://www.cuberoot-systems.com';
const req=(opts={})=>new Request(base+'/downloads/wire.apk?build=123',opts);
test('only successful starting GETs count; HEAD, failures, resumes and bots do not',()=>{
 assert.equal(eligible(req(),new Response('',{status:200})),true);
 assert.equal(eligible(req({headers:{Range:'bytes=0-'}}),new Response('',{status:206})),true);
 for(const options of [{method:'HEAD'},{headers:{Range:'bytes=100-'}},{headers:{Range:'bytes=-100'}},{headers:{Purpose:'prefetch'}},{headers:{'User-Agent':'Googlebot'}}]) assert.equal(eligible(req(options),new Response('',{status:200})),false);
 for(const status of [301,304,404,500]) assert.equal(eligible(req(),new Response(null,{status})),false);
});
test('filters reject invalid dates, app names, ordering, long ranges and SQL injection',()=>{
 for(const params of ['from=2026-02-30','from=xxx','app=x','before=0','before=1%20OR%201=1','from=2026-10-15&to=2026-10-14','from=2020-01-01&to=2026-10-15']) assert.throws(()=>filters(new URL(base+'?'+params)));
 assert.equal(filters(new URL(base+'?app=wire'),new Date('2026-10-15')).app,'wire');
});
test('API rejects missing or wrong keys before reading the database',async()=>{
 for(const key of ['', 'wrong']) {
 const result=await worker.fetch(new Request(base+'/api/apk-downloads',{headers:{Authorization:'Bearer '+key}}),{DOWNLOAD_ADMIN_KEY:'a'.repeat(64)},{});
 assert.equal(result.status,401);assert.equal(result.headers.get('Cache-Control'),'no-store');
 }
});
test('API returns bounded summaries and independently authorized rows',async()=>{
 const sql=[];const DB={prepare(query){sql.push(query);return {bind(){return this;}}},async batch(){return [{results:[{app:'wire',count:1}]},{results:[]},{results:[]},{results:[{id:1,app:'wire'}]}];}};
 const result=await worker.fetch(new Request(base+'/api/apk-downloads?app=wire',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),{DOWNLOAD_ADMIN_KEY:'a'.repeat(64),DB},{});
 assert.equal(result.status,200);const data=await result.json();assert.equal(data.events.length,1);assert.equal(Object.keys(data.apps).length,6);assert.match(sql[3],/LIMIT 101/);
});
test('APK response is streamed unchanged and analytics failures cannot block downloads',async()=>{
 const previous=globalThis.fetch;const expected=new Response('apk',{headers:{'content-type':'application/vnd.android.package-archive'}});
 globalThis.fetch=async()=>expected;
 try {
 const tasks=[];const DB={prepare(){return {bind(){return this},run(){throw new Error('unavailable')}}}};
 const request=req();Object.defineProperty(request,'cf',{value:{country:'CA',city:'Toronto'}});
 const response=await worker.fetch(request,{DB,DOWNLOAD_ADMIN_KEY:'a'.repeat(64)},{waitUntil(task){tasks.push(task)}});
 assert.equal(response,expected);await Promise.all(tasks);assert.equal(await response.text(),'apk');
 } finally {globalThis.fetch=previous;}
});
test('daily retention deletes only rows older than 90 days',async()=>{
 let cutoff;let query;
 await worker.scheduled({scheduledTime:Date.parse('2026-10-15T00:00:00Z')},{DB:{prepare(sql){query=sql;return {bind(value){cutoff=value;return this},async run(){}}}}});
 assert.equal(cutoff,'2026-07-17T00:00:00.000Z');assert.equal(query,'DELETE FROM downloads WHERE at < ?');
});
