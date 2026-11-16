import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const expected=JSON.parse(readFileSync('ate/app/ate-web-build.json','utf8')),base='https://www.cuberoot-systems.com/ate/app/';
let ready=false,last='';
for(let attempt=0;attempt<36;attempt++){
 try{
  const r=await fetch(base+'ate-web-build.json?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Manifest HTTP '+r.status);
  const actual=await r.json();if(actual.run_id!==expected.run_id||actual.source_sha!==expected.source_sha)throw Error('Pages still serves the earlier web release');
  for(const [name,meta] of Object.entries(expected.files)){
   const asset=await fetch(base+name+'?verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!asset.ok)throw Error(name+' HTTP '+asset.status);
   const bytes=Buffer.from(await asset.arrayBuffer());if(bytes.length!==meta.bytes||createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error(name+' public bytes differ');
  }
  ready=true;break;
 }catch(error){last=error.message;console.log('Waiting for Pages: '+last);}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!ready)throw Error(last);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1194,height:834}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?verify='+Date.now());await page.waitForSelector('.cm-content');
 if(await page.locator('#termsDialog[open]').count()){
  if(!await page.locator('#acceptTerms').isDisabled())throw Error('First-use terms did not require explicit agreement');
  await page.locator('#termsCheck').check();await page.locator('#acceptTerms').click();await page.waitForSelector('#termsDialog',{state:'hidden'});
  console.log('PASS: public first-use Terms require agreement and accept through real visible controls');
 }
 if(!await page.locator('.brand').innerText().then(s=>s.includes(expected.version+' ('+expected.build+')')))throw Error('Public editor shows wrong version');
 await page.locator('#menuButton').click();await page.locator('#advancedMode').click();await page.locator('#closeMenu').click();
 await page.locator('#file').setInputFiles({name:'public-check.sql',mimeType:'application/sql',buffer:Buffer.from('SELECT FROM;')});
 await page.locator('#menuButton').click();await page.locator('#checkSyntax').click();await page.waitForSelector('#syntaxIssues li',{timeout:45000});await page.locator('#closeSyntax').click();
 await page.locator('#menuButton').click();await page.locator('#projectsButton').click();await page.locator('#openProjectPicker').click();await page.locator('#projectName').fill('Publication check');await page.locator('#createProject').click();await page.waitForSelector('#projects[open]');
 await page.waitForFunction(()=>document.getElementById('projectHeading').textContent==='Publication check');
 await page.screenshot({path:'ate-public-web.png'});
 if(errors.length)throw Error(errors.join('\n'));console.log('PASS: public ATE web '+expected.version+' ('+expected.build+'), every asset hash, SQL checker, tabs and real browser project storage');
}finally{await browser.close();}
