import { el } from './common.js?v=1.3.0';

// Invoked only after the existing admin vault is unlocked. The API independently
// authenticates every read; hiding the tab is not the access control.
export function downloadsTab({getKey, saveKey}) {
  const view = el('section',{class:'apk-cockpit stack-lg'},
    el('h2',{text:'APK download cockpit'}),
    el('p',{text:'Successful download requests, grouped by app. Retries from the same browser and network within each 30-minute window count once. These are estimates, not installations.'}));
  const key = el('input',{class:'input',type:'password',id:'apk-key',autocomplete:'off',spellcheck:'false','aria-label':'Download service admin key'});
  const status = el('p',{role:'status'});
  const connect = el('button',{class:'btn',type:'button',text:getKey()?'Replace connection key':'Connect download service'});
  const generate = el('button',{class:'btn btn-ghost',type:'button',text:'Generate key',onclick:()=>{
    key.value = Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    status.textContent='New key generated. Copy it into Cloudflare and keep a private backup, then connect the service.';
  }});
  const show = el('button',{class:'btn btn-ghost',type:'button',text:'Show key','aria-pressed':'false','aria-controls':'apk-key',onclick:()=>{
    const visible = key.type === 'password';key.type=visible?'text':'password';show.textContent=visible?'Hide key':'Show key';show.setAttribute('aria-pressed',String(visible));
  }});
  const copy = el('button',{class:'btn btn-ghost',type:'button',text:'Copy key',onclick:async()=>{
    if(!key.value){status.textContent='Generate or enter a key first.';return;}
    try{await navigator.clipboard.writeText(key.value);status.textContent='Key copied. Paste it into the Cloudflare Secret value field.';}
    catch{status.textContent='Copy was unavailable. Use Show key, select the value and copy it.';}
  }});
  view.append(el('details',{},el('summary',{text:'Download service connection'}),el('p',{text:'Use the private key shared with Cloudflare during activation. It is saved only inside your encrypted admin vault.'}),el('label',{for:'apk-key',text:'Private download service key'}),key,el('div',{class:'actions'},generate,show,copy,connect)));
  const dates = new Date();
  const to = new Date(dates); to.setUTCDate(to.getUTCDate()+1);
  dates.setUTCDate(dates.getUTCDate()-29);
  const fromField = el('input',{type:'date',class:'input',id:'apk-from',value:dates.toISOString().slice(0,10)});
  const toField = el('input',{type:'date',class:'input',id:'apk-to',value:to.toISOString().slice(0,10)});
  const app = el('select',{class:'input',id:'apk-app'},el('option',{value:'',text:'All APKs'}));
  for (const [slug,name] of Object.entries({'fidunio':'FIDUNIO','scorecard':'The Scorecard','fairpot':'Fairpot','wire':'Wire','spendrecorder':'SpendRecorder','cloud-files':'Cloud Files'})) app.append(el('option',{value:slug,text:name}));
  const refresh = el('button',{class:'btn',type:'button',text:'Show downloads'});
  const results = el('div',{class:'stack-lg'});
  const fields = el('div',{class:'apk-filters'},
    el('label',{for:'apk-from'},'From (UTC)',fromField),el('label',{for:'apk-to'},'Before (UTC)',toField),el('label',{for:'apk-app'},'APK',app),refresh);
  view.append(fields,status,results);
  let loading = false;
  const table = (labels,rows) => el('div',{class:'apk-table-wrap',tabindex:'0','aria-label':labels.join(',')},el('table',{},
    el('thead',{},el('tr',{},labels.map(text=>el('th',{scope:'col',text})))),el('tbody',{},rows.map(row=>el('tr',{},row.map(text=>el('td',{text:String(text)})))))));
  const cellDate = value => new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(value));
  async function load(before, frozen) {
    if (loading || !view.isConnected) return;
    if (!getKey()) { status.textContent = 'The download service needs activation and a connection key. No records are being displayed.'; return; }
    loading = true; refresh.disabled = true; connect.disabled = true;
    status.textContent = 'Loading download records…';
    const query = frozen || {from:fromField.value,to:toField.value,app:app.value};
    const params = new URLSearchParams(query); if (before) params.set('before',String(before));
    try {
      const res = await fetch('/api/apk-downloads?'+params,{headers:{Authorization:'Bearer '+getKey()},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
      if (res.status === 401) throw new Error('The download service did not accept this key. Check the connection key.');
      if (!res.ok || !res.headers.get('Content-Type')?.includes('application/json')) throw new Error('The download service is not activated or is temporarily unavailable.');
      const data = await res.json();
      if (!view.isConnected) return;
      const counts = new Map(data.counts.map(r=>[r.app,r.count]));
      const total = data.counts.reduce((n,r)=>n+r.count,0);
      results.replaceChildren(el('h3',{text:total+' download requests in this period'}),
        table(['APK','Requests'],Object.entries(data.apps).filter(([slug])=>!query.app||query.app===slug).map(([slug,name])=>[name,counts.get(slug)||0])),
        el('h3',{text:'By day (UTC)'}),table(['Date','Requests'],data.daily.map(r=>[r.day,r.count])),
        el('h3',{text:'By country'}),table(['Country','Requests'],data.countries.map(r=>[r.country||'Unknown',r.count])),
        el('h3',{text:'Download records · Toronto time'}),
        table(['Date / time','APK','Build','Approximate location','Device / browser'],data.events.map(r=>[
          cellDate(r.at),data.apps[r.app]||r.app,r.build||'Not specified',[r.city,r.region,r.country].filter(Boolean).join(', ')||'Unknown',r.device])));
      if (data.next) results.append(el('button',{class:'btn',type:'button',text:'Older records',onclick:()=>load(data.next,query)}));
      if (before) results.append(el('button',{class:'btn btn-ghost',type:'button',text:'Newest records',onclick:()=>load(null,query)}));
      status.textContent = data.events.length ? 'Showing '+data.events.length+' records. Location is approximate. Records are retained for 90 days.' : 'No recorded requests in this period. Counting begins only after activation.';
    } catch (e) { if(view.isConnected) {results.replaceChildren(); status.textContent=e.name==='TimeoutError'?'The download service took too long. Try again.':e.message;} }
    finally {loading=false;refresh.disabled=false;connect.disabled=false;}
  }
  refresh.addEventListener('click',()=>load());
  connect.addEventListener('click',async()=>{
    const value = key.value.trim();
    if (!/^[a-f0-9]{64}$/.test(value)) {status.textContent='Enter the 64-character private key from activation.';return;}
    connect.disabled=true;refresh.disabled=true;
    try { await saveKey(value);key.value='';status.textContent='Connection key saved in the encrypted vault.'; }
    catch {status.textContent='The key could not be saved. Reload the admin area and try again.';return;}
    finally {connect.disabled=false;refresh.disabled=false;}
    await load();
  });
  // Wait until mainScreen has attached this section.
  setTimeout(()=>load(),0);
  return view;
}
