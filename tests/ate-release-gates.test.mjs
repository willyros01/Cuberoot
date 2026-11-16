import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWebRelease,verifyDesktopRelease} from '../build/ate-release-gates.mjs';
function fixture(){
 const report={workflow:'ATE Apple and Desktop',branch:'desktop',run_id:123,source_sha:'a'.repeat(40),web_artifact_id:1,windows_artifact_id:2,mac_artifact_id:null};
 const run={id:123,head_sha:report.source_sha,head_branch:'desktop',name:report.workflow,path:'.github/workflows/all-platforms.yml',status:'in_progress',conclusion:null};
 const jobs=[{name:'browser',conclusion:'success'},{name:'windows',conclusion:'success'},{name:'mac-build',conclusion:null},{name:'android',conclusion:'failure'}];
 const artifacts=[{id:1,name:'ate-web-app',expired:false},{id:2,name:'ate-windows-x64',expired:false}];
 return {report,run,jobs,artifacts};
}
test('completed web and Windows gates survive an unrelated Android failure and queued Mac',()=>{
 const x=fixture();assert.doesNotThrow(()=>verifyWebRelease(x.report,x.run,x.jobs,x.artifacts));assert.doesNotThrow(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts));
});
test('web cannot publish with a failed browser gate',()=>{const x=fixture();x.jobs[0].conclusion='failure';assert.throws(()=>verifyWebRelease(x.report,x.run,x.jobs,x.artifacts),/browser/)});
test('Windows cannot publish an artifact from a failed installer job',()=>{const x=fixture();x.jobs[1].conclusion='failure';assert.throws(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts),/windows/)});
test('source SHA, branch and workflow identity remain mandatory',()=>{
 for(const field of ['head_sha','head_branch','name','path']){const x=fixture();x.run[field]='wrong';assert.throws(()=>verifyWebRelease(x.report,x.run,x.jobs,x.artifacts),/provenance/);assert.throws(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts),/provenance/)}
});
test('an expired or unrelated artifact cannot be substituted',()=>{
 for(const change of [{expired:true},{id:99},{name:'unrelated'}]){const x=fixture();Object.assign(x.artifacts[0],change);assert.throws(()=>verifyWebRelease(x.report,x.run,x.jobs,x.artifacts),/artifact/)}
});
test('Mac requires both native verification and successful website signing/notarization',()=>{
 const x=fixture();x.report.mac_artifact_id=3;x.artifacts.push({id:3,name:'ate-mac-website-release',expired:false});x.jobs.push({name:'mac-release (website)',conclusion:'success'});
 assert.throws(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts),/mac-build/);x.jobs[2].conclusion='success';assert.doesNotThrow(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts));
 x.jobs.at(-1).conclusion='failure';assert.throws(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts),/signing/);
});

function recovery(){
 const x=fixture();Object.assign(x.report,{windows_artifact_id:null,web_artifact_id:null,mac_artifact_id:3,native_verification_run_id:43810798310,application_source_sha:'23f352a4ceb3ad99a5f112a564253f0f0dd9ea9e'});
 x.run.path='.github/workflows/mac-website-retry.yml';x.run.name='ATE 0.8.7 Mac website signing from verified universal app';x.jobs=[{name:'mac-release (website)',conclusion:'success',steps:[{name:'Require original successful native Mac tests and unchanged application source',conclusion:'success'}]}];x.artifacts=[{id:3,name:'ate-mac-website-release',expired:false}];return x;
}
test('Mac signing recovery retains original native tests and unchanged source proof',()=>{const x=recovery();assert.doesNotThrow(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts))});
test('Mac recovery rejects missing or failed original native provenance',()=>{
 for(const change of ['failed-step','missing-step','failed-signing','other-source','other-run','windows']){const x=recovery();
  if(change==='failed-step')x.jobs[0].steps[0].conclusion='failure';
  if(change==='missing-step')x.jobs[0].steps=[];
  if(change==='failed-signing')x.jobs[0].conclusion='failure';
  if(change==='other-source')x.report.application_source_sha='b'.repeat(40);
  if(change==='other-run')x.report.native_verification_run_id=1;
  if(change==='windows')x.report.windows_artifact_id=2;
  assert.throws(()=>verifyDesktopRelease(x.report,x.run,x.jobs,x.artifacts));
 }
});
