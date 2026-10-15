const APPS = {fidunio:'FIDUNIO',scorecard:'The Scorecard',fairpot:'Fairpot',wire:'Wire',spendrecorder:'SpendRecorder','cloud-files':'Cloud Files'};
function el(tag, attrs={}, ...children) {
 const n=document.createElement(tag);
 for(const [k,v] of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}
 for(const child of children.flat())if(child!==null&&child!==undefined)n.append(child);
 return n;
}
export function cockpit({preview=false,load}) {
 const root=el('section',{class:'dc','aria-label':'APK download cockpit'});
 const select=el('select',{id:'dc-app'},el('option',{value:'',text:'All apps'}),Object.entries(APPS).map(([value,text])=>el('option',{value,text})));
 const refresh=el('button',{type:'button',class:'dc-refresh',text:'↻  Refresh'});
 const status=el('p',{class:'dc-status',role:'status','aria-live':'polite'});
 const content=el('div',{class:'dc-content'});
 root.append(el('div',{class:'dc-heading'},el('div',{},el('p',{class:'dc-kicker',text:'CUBEROOT / APK ACTIVITY'}),el('h1',{text:'Download cockpit'}),el('p',{class:'dc-subtitle',text:'Your apps. Their reach. One simple view.'})),el('span',{class:'dc-mode',text:preview?'DESIGN PREVIEW':'PRIVATE ADMIN'})));
 if(preview)root.append(el('div',{class:'dc-preview',role:'note'},el('strong',{text:'Sample data — counting is not active.'}),el('span',{text:' This preview opens without login. Real records stay in your admin area.'})));
 root.append(el('div',{class:'dc-toolbar'},el('label',{for:'dc-app'},'Show app',select),refresh),status,content);
 function render(data){
  if(!data||!Array.isArray(data.events)||!data.counts)throw new Error('Download records are unavailable.');
  const slug=select.value;
  const chosen=Object.entries(APPS).filter(([key])=>!slug||key===slug);
  const count=(key,field)=>Number.isSafeInteger(data.counts[key]?.[field])&&data.counts[key][field]>=0?data.counts[key][field]:0;
  const total=chosen.reduce((n,[key])=>n+count(key,'total'),0);
  const today=chosen.reduce((n,[key])=>n+count(key,'today'),0);
  const summary=el('div',{class:'dc-totals'},el('article',{class:'dc-total dc-total-primary'},el('span',{text:'Total recorded clicks'}),el('strong',{text:total.toLocaleString()}),el('span',{class:'dc-detail',text:preview?'Illustrative totals':'Since counting started'})),el('article',{class:'dc-total'},el('span',{text:'Today'}),el('strong',{text:today.toLocaleString()}),el('span',{class:'dc-detail',text:'Calendar day in Toronto'})));
  const apps=el('div',{class:'dc-apps'},chosen.map(([key,name])=>el('article',{class:'dc-app','data-app':key},el('span',{class:'dc-app-mark','aria-hidden':'true',text:name==='The Scorecard'?'S':name.slice(0,1)}),el('div',{},el('h3',{text:name}),el('span',{text:count(key,'today')+' today'})),el('strong',{text:count(key,'total').toLocaleString()}))));
  const events=data.events.filter(e=>!slug||e.app===slug);
  const list=el('ol',{class:'dc-events'});
  for(const event of events){
   let date='Unknown date';try{date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(event.at));}catch{}
   const timezone=typeof event.timezone==='string'&&event.timezone?event.timezone:'Unknown';
   const area=timezone==='Unknown'?'Unknown':timezone.split('/').slice(1).join(' / ').replaceAll('_',' ')||timezone;
   list.append(el('li',{},el('div',{class:'dc-event-app'},el('strong',{text:APPS[event.app]||'Unknown app'}),el('time',{text:date})),el('div',{class:'dc-event-area'},el('strong',{text:area}),el('span',{text:timezone}))));
  }
  content.replaceChildren(summary,el('div',{class:'dc-section-heading'},el('h2',{text:'By app'}),el('span',{text:'Recorded clicks'})),apps,el('div',{class:'dc-section-heading'},el('h2',{text:'Recent downloads'}),el('span',{text:'Times in Toronto'})),events.length?list:el('p',{class:'dc-empty',text:'No recorded clicks for this app yet.'}),el('p',{class:'dc-footnote',text:'Counts represent download-button clicks. Area is based on the browser’s reported timezone, not a verified location. Some clicks may not be recorded.'}));
 }
 let data=null,busy=false;
 async function update(){
  if(busy)return;busy=true;refresh.disabled=true;status.textContent='Loading…';
  try{const next=await load();if(!root.isConnected)return;data=next;render(data);status.textContent=preview?'Preview · sample activity':'Updated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
  catch(e){if(root.isConnected){content.replaceChildren(el('div',{class:'dc-empty'},el('h2',{text:'No live connection yet'}),el('p',{text:'Download counting needs its Firebase connection. Your APK download buttons continue to work normally.'})));status.textContent='Counting is not active.';}}
  finally{busy=false;refresh.disabled=false;}
 }
 select.addEventListener('change',()=>{if(data)render(data)});refresh.addEventListener('click',update);
 setTimeout(update,0);return root;
}
