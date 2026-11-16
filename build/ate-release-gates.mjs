// Each public platform is gated by its own completed verification and artifact.
// An unrelated platform may still be queued or have a failed test attempt.
function source(report,run,paths){
 if(run.id!==report.run_id||run.head_sha!==report.source_sha||run.head_branch!==report.branch||run.name!==report.workflow||!paths.includes(run.path))throw Error('Release source provenance mismatch');
}
function job(jobs,name){if(!jobs.some(x=>x.name===name&&x.conclusion==='success'))throw Error('Required release gate not passed: '+name)}
function artifact(artifacts,id,name){if(!artifacts.some(x=>x.id===id&&x.name===name&&!x.expired))throw Error('Wrong verified artifact: '+name)}
const coordinated=['.github/workflows/all-platforms.yml','.github/workflows/release-desktop-083.yml'];
export function verifyWebRelease(report,run,jobs,artifacts){
 if(report.workflow!=='ATE Apple and Desktop'||report.branch!=='desktop')throw Error('Unexpected web release');
 source(report,run,coordinated);job(jobs,'browser');artifact(artifacts,report.web_artifact_id,'ate-web-app');
}
export function verifyDesktopRelease(report,run,jobs,artifacts){
 const windowsOnly=report.workflow==='ATE Windows website release'&&report.branch==='windows-compiler';
 if(!windowsOnly&&(report.workflow!=='ATE Apple and Desktop'||report.branch!=='desktop'))throw Error('Unexpected desktop release');
 source(report,run,windowsOnly?['.github/workflows/windows-website.yml']:coordinated);job(jobs,'browser');
 if(report.windows_artifact_id){job(jobs,'windows');artifact(artifacts,report.windows_artifact_id,'ate-windows-x64')}
 if(report.mac_artifact_id){
  job(jobs,'mac-build');
  if(!jobs.some(x=>x.name.includes('mac-release')&&x.name.includes('website')&&x.conclusion==='success'))throw Error('Mac website signing/notarization gate not passed');
  artifact(artifacts,report.mac_artifact_id,'ate-mac-website-release');
 }
}
