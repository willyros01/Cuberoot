import {readFileSync,writeFileSync,existsSync,mkdirSync,rmSync,cpSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const api='https://api.github.com/repos/willyros01/clear-page/';
const headers={Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'};
async function get(path){const response=await fetch(api+path,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('ATE provenance HTTP '+response.status);return response.json();}
const lookup=await get('contents/ate-desktop-last-run.json?ref=desktop-releases');
const report=JSON.parse(Buffer.from(lookup.content,'base64').toString('utf8'));
if(!report.web_artifact_id){console.log('No verified web release ready.');process.exit(0);}
if(report.app!=='ATE'||report.workflow!=='ATE Apple and Desktop'||report.branch!=='desktop'||!/^[a-f0-9]{40}$/.test(report.source_sha)||!/^\d+\.\d+\.\d+$/.test(report.version)||!Number.isSafeInteger(report.run_id)||!Number.isSafeInteger(report.web_artifact_id))throw Error('Unexpected web release report');
let current={};try{current=JSON.parse(readFileSync('ate/app/ate-web-build.json','utf8'));}catch{}
if((current.run_id||0)>=report.run_id){console.log('ATE web app is already current.');process.exit(0);}
const [run,jobs,artifacts]=await Promise.all([get('actions/runs/'+report.run_id),get('actions/runs/'+report.run_id+'/jobs?per_page=100'),get('actions/runs/'+report.run_id+'/artifacts?per_page=100')]);
if(run.status!=='completed'){console.log('Coordinated release is still finalizing.');process.exit(0);}
if(run.head_sha!==report.source_sha||run.head_branch!==report.branch||!['.github/workflows/all-platforms.yml','.github/workflows/release-desktop-083.yml'].includes(run.path)||run.conclusion!=='success')throw Error('Coordinated release is not complete and successful');
for(const name of ['browser','mac-build','windows','report'])if(!jobs.jobs.some(j=>j.name===name&&j.conclusion==='success'))throw Error('Missing release gate '+name);
if(!artifacts.artifacts.some(a=>a.id===report.web_artifact_id&&a.name==='ate-web-app'&&!a.expired))throw Error('Web artifact does not belong to the verified release');
const temp=mkdtempSync(join(tmpdir(),'ate-web-'));
try{
 const response=await fetch(api+'actions/artifacts/'+report.web_artifact_id+'/zip',{headers,signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('Web artifact HTTP '+response.status);
 writeFileSync(join(temp,'artifact.zip'),Buffer.from(await response.arrayBuffer()));
 const python=[
  'import zipfile,sys,re,pathlib',
  'z=zipfile.ZipFile(sys.argv[1])',
  'items=z.infolist()',
  'assert 1<len(items)<40',
  'assert sum(i.file_size for i in items)<120*1024*1024',
  'assert len({i.filename for i in items})==len(items)',
  'for i in items:',
  ' assert re.fullmatch(r\"[a-zA-Z0-9][a-zA-Z0-9_.-]*\",i.filename) and not i.is_dir()',
  ' assert ((i.external_attr>>16)&0o170000)!=0o120000',
  'z.extractall(sys.argv[2])'
 ].join('\n');
 const unpacked=join(temp,'unpacked');execFileSync('python3',['-c',python,join(temp,'artifact.zip'),unpacked]);
 const manifest=JSON.parse(readFileSync(join(unpacked,'ate-web-build.json'),'utf8'));
 if(manifest.app!=='ATE'||manifest.platform!=='web'||manifest.run_id!==report.run_id||manifest.source_sha!==report.source_sha||manifest.version!==report.version||!Number.isSafeInteger(manifest.build))throw Error('Web manifest provenance mismatch');
 const extracted=readdirSync(unpacked);if(extracted.length!==Object.keys(manifest.files).length+1||extracted.some(name=>name!=='ate-web-build.json'&&!Object.hasOwn(manifest.files,name)))throw Error('Unexpected unverified web asset');
 for(const name of ['index.html','app.js','syntax-worker.js','ruff_wasm_bg.wasm','tree-sitter-c.wasm','tree-sitter-bash.wasm','web-tree-sitter.wasm','THIRD-PARTY-NOTICES.txt'])if(!manifest.files[name])throw Error('Required web asset missing: '+name);
 for(const [name,expected] of Object.entries(manifest.files)){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)||!/^[a-f0-9]{64}$/.test(expected.sha256))throw Error('Invalid web asset metadata');
  const bytes=readFileSync(join(unpacked,name));if(bytes.length!==expected.bytes||createHash('sha256').update(bytes).digest('hex')!==expected.sha256)throw Error('Web asset bytes differ: '+name);
 }
 const app=readFileSync(join(unpacked,'app.js'),'utf8');
 if(app.includes('ATE_IPAD_SYNTAX_VERIFICATION_ONLY')||app.includes('ate-tabs-verification-restart'))throw Error('Verification driver found in the web release');
 // Other publishers may have committed APK metadata while the artifact loaded.
 execFileSync('git',['pull','--ff-only','origin','main'],{stdio:'inherit'});
 rmSync('ate/app',{recursive:true,force:true});mkdirSync('ate/app',{recursive:true});cpSync(unpacked,'ate/app',{recursive:true});
 const pagePath='ate/index.html';let page=readFileSync(pagePath,'utf8');
 if(!page.includes('id="web-app"'))page=page.replace('<div class="platforms">','<div class="platforms"><section class="platform" id="web-app"><h2>Web app</h2><p>Open ATE in your browser. Edit text and code, keep tabs, and organise projects. No installation is needed.</p><a class="button" href="app/">Open web app</a><p>Projects stay in this browser. Export ZIP backups to keep independent copies.</p></section>');
 page=page.replace('JavaScript, TypeScript, JSON, YAML, HTML, CSS and C.','JavaScript, TypeScript, JSON, YAML, HTML, CSS, C, Python, Shell scripts, SQL and Markdown.').replace('12 pt menu and configuration text, headings up to 14 pt.','Readable menu controls and larger project headings and file labels.');
 writeFileSync(pagePath,page);
 execFileSync('git',['config','user.name','github-actions[bot]']);execFileSync('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
 execFileSync('git',['add','ate/app','ate/index.html']);execFileSync('git',['commit','-m','Publish verified ATE web '+manifest.version+' ('+manifest.build+') from run '+manifest.run_id],{stdio:'inherit'});execFileSync('git',['push','origin','HEAD:main'],{stdio:'inherit'});
 if(process.env.GITHUB_OUTPUT)writeFileSync(process.env.GITHUB_OUTPUT,'published=true\n',{flag:'a'});
 console.log('PASS: exact verified ATE web '+manifest.version+' ('+manifest.build+') published from '+manifest.source_sha);
}finally{rmSync(temp,{recursive:true,force:true});}
