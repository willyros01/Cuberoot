#!/usr/bin/env node
// GitHub notification ONLY after the public site serves the exact signed APK.
// Cuberoot Actions token needs issues:write; no other credential or signing key.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const base='https://www.cuberoot-systems.com/downloads/';
const owner='willyros01', repo='Cuberoot';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validRelease(m){
  assert.equal(m.app,'FIDUNIO');
  assert.equal(m.origin,'github-actions-artifact');
  assert.ok(Number.isSafeInteger(m.run_id)&&m.run_id>0);
  assert.match(m.source_sha,/^[a-f0-9]{40}$/);
  assert.match(m.apk_sha256,/^[a-f0-9]{64}$/);
  assert.match(m.signer_sha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(m.apk_bytes)&&m.apk_bytes>1000000);
  return m;
}
function matchesPublic(expected,live){
  return ['run_id','source_sha','apk_sha256','signer_sha256','apk_bytes'].every(k=>expected[k]===live[k]);
}
function digest(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
const check = async (url,ms)=>{
  const r=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(ms),redirect:'follow'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  return r;
};
const github=async(path,method='GET',body)=>{
  const r=await fetch('https://api.github.com'+path,{
    method,
    headers:{
      Authorization:'Bearer '+process.env.GITHUB_TOKEN,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      ...(body?{'Content-Type':'application/json'}:{})
    },
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(30000)
  });
  const data=await r.json();
  if(!r.ok)throw new Error('GitHub '+r.status+': '+JSON.stringify(data).slice(0,400));
  return data;
};
async function alreadySent(title){
  for(let page=1;page<=15;page++){
    const issues=await github(`/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`);
    if(issues.some(x=>!x.pull_request&&x.title===title))return true;
    if(issues.length<100)return false;
  }
  throw new Error('Could not exhaust GitHub notifications; refusing duplicate issue');
}
async function main(){
  if(process.argv.includes('--self-test')){
    const m=validRelease({app:'FIDUNIO',origin:'github-actions-artifact',run_id:12,
      source_sha:'a'.repeat(40),apk_sha256:'b'.repeat(64),
      signer_sha256:'c'.repeat(64),apk_bytes:1000012});
    assert.ok(matchesPublic(m,{...m}));
    assert.ok(!matchesPublic(m,{...m,run_id:13}));
    assert.ok(!matchesPublic(m,{...m,apk_sha256:'d'.repeat(64)}));
    assert.equal(digest(Buffer.from('test')),'9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    console.log('PASS: FIDUNIO live-release verification logic');
    return;
  }
  if(!process.env.GITHUB_TOKEN)throw new Error('Missing Cuberoot Actions GitHub token');
  const expected=validRelease(JSON.parse(fs.readFileSync('downloads/fidunio-build.json','utf8')));
  const title=`FIDUNIO Android published — build ${expected.run_id}`;
  if(await alreadySent(title)){console.log('Existing GitHub publication notice, no duplicate:',title);return;}
  let verified=false;
  // GitHub Pages publication is async; polling makes the completion message accurate.
  for(let tryNo=1;tryNo<=60;tryNo++){
    try{
      const bust=encodeURIComponent(`${expected.run_id}-${Date.now()}`);
      const meta=validRelease(await (await check(base+`fidunio-build.json?fresh=${bust}`,20000)).json());
      if(!matchesPublic(expected,meta))throw new Error('Website still serving different build metadata');
      const bytes=Buffer.from(await (await check(base+`fidunio.apk?fresh=${bust}`,120000)).arrayBuffer());
      if(bytes.byteLength!==expected.apk_bytes||digest(bytes)!==expected.apk_sha256)
        throw new Error('Website APK bytes/checksum do not match signed artifact');
      verified=true;
      console.log('PASS: public website serves exact signed FIDUNIO APK build',expected.run_id);
      break;
    }catch(e){
      console.log('Website not ready ('+tryNo+'/60+): '+e.message);
      if(tryNo<60)await sleep(15000);
    }
  }
  if(!verified)throw new Error('Website never served the expected APK; no misleading notification sent');
  if(await alreadySent(title)){console.log('Notice already created by concurrent publisher');return;}
  const body=[
    '### FIDUNIO Android website publication verified','',
    `**Build:** ${expected.run_id}`,
    `**Source:** ${expected.source_sha}`,
    `**APK SHA-256:** ${expected.apk_sha256}`,
    `**Signer SHA-256:** ${expected.signer_sha256}`,'',
    'Verified LIVE website metadata and downloaded APK bytes match this exact signed build.','',
    '**Download:** https://www.cuberoot-systems.com/downloads/fidunio.apk',
    '**Website:** https://www.cuberoot-systems.com/','',
    'This confirms APK publication, not server-side ADM notification delivery.',
    `Publisher: https://github.com/${owner}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID||''}`
  ].join('\n');
  const issue=await github(`/repos/${owner}/${repo}/issues`,'POST',{title,body,assignees:['willyros01']});
  console.log('PASS: sent GitHub notification:',issue.html_url);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY||'/dev/null',`\n### FIDUNIO website publication verified\n\nGitHub notification: ${issue.html_url}\n`);
}
main().catch(err=>{console.error('FAIL:',err);process.exitCode=1;});
