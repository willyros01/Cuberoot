const APPS = {fidunio:'FIDUNIO',scorecard:'The Scorecard',fairpot:'Fairpot',wire:'Wire',spendrecorder:'SpendRecorder','cloud-files':'Cloud Files',marker:'The Marker'};
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
 const from=el('input',{type:'date',id:'dc-from','aria-label':'From date in Toronto'});
 const to=el('input',{type:'date',id:'dc-to','aria-label':'To date in Toronto'});
 const apply=el('button',{type:'submit',class:'dc-apply',text:'Apply dates'});
 const clear=el('button',{type:'button',class:'dc-clear',text:'Clear dates'});
 const dates=el('form',{class:'dc-date-form'},
  el('div',{class:'dc-date-fields'},
   el('label',{for:'dc-from'},'From',from),
   el('label',{for:'dc-to'},'To',to)),
  el('div',{class:'dc-date-buttons'},apply,clear));
 const dateError=el('p',{class:'dc-range-error',role:'alert',hidden:''});
 const status=el('p',{class:'dc-status',role:'status','aria-live':'polite'});
 const content=el('div',{class:'dc-content'});
 root.append(el('div',{class:'dc-heading'},el('div',{},el('p',{class:'dc-kicker',text:'CUBEROOT / APK ACTIVITY'}),el('h1',{text:'Download cockpit'}),el('p',{class:'dc-subtitle',text:'Your apps. Their reach. One simple view.'})),el('span',{class:'dc-mode',text:preview?'DESIGN PREVIEW':'PRIVATE ADMIN'})));
 if(preview)root.append(el('div',{class:'dc-preview',role:'note'},el('strong',{text:'Sample data — counting is not active.'}),el('span',{text:' This preview opens without login. Real records stay in your admin area.'})));
 root.append(el('div',{class:'dc-toolbar'},el('label',{for:'dc-app'},'Show app',select),refresh),dates,dateError,status,content);
 let selectedRange=null; // Applied dates, not partially edited inputs.
 function dateDescription(){
  return selectedRange?'Toronto: '+selectedRange.from+' through '+selectedRange.to+' (inclusive)':'Calendar day in Toronto';
 }
 // Render the complete, non-numeric layout synchronously. Never display zero as
 // a substitute for a value that has not yet been retrieved from Firebase.
 function showPending(){
  const chosen=Object.entries(APPS).filter(([key])=>!select.value||key===select.value);
  const summary=el('div',{class:'dc-totals'},
   el('article',{class:'dc-total dc-total-primary'},
    el('span',{text:selectedRange?'Clicks in selected dates':'Total recorded clicks'}),el('strong',{text:'—'}),
    el('span',{class:'dc-detail',text:selectedRange?dateDescription():'Waiting for Firebase'})),
   el('article',{class:'dc-total'},
    el('span',{text:selectedRange?'All-time clicks':'Today'}),el('strong',{text:'—'}),
    el('span',{class:'dc-detail',text:selectedRange?'Since counting started':'Calendar day in Toronto'})));
  const apps=el('div',{class:'dc-apps'},chosen.map(([key,name])=>
   el('article',{class:'dc-app','data-app':key},
    el('span',{class:'dc-app-mark','aria-hidden':'true',text:name==='The Scorecard'?'S':name.slice(0,1)}),
    el('div',{},el('h3',{text:name}),el('span',{text:'Loading…'})),
    el('strong',{text:'—'}))));
  content.replaceChildren(summary,
   el('div',{class:'dc-section-heading'},el('h2',{text:'By app'}),el('span',{text:'Recorded clicks'})),
   apps,
   el('div',{class:'dc-section-heading'},el('h2',{text:selectedRange?'Downloads in selected dates':'Recent downloads'}),el('span',{text:'Times in Toronto'})),
   el('p',{class:'dc-empty',text:'Loading recent activity…'}));
 }
 showPending();
 function render(data){
  if(!data||!Array.isArray(data.events)||!data.counts)throw new Error('Download records are unavailable.');
  const slug=select.value;
  const chosen=Object.entries(APPS).filter(([key])=>!slug||key===slug);
  const period=selectedRange?'range':'today';
  // Missing, malformed or incomplete Firebase counts must never render as zero.
  const count=(key,field)=>{
   const value=data.counts[key]?.[field];
   if(!Number.isSafeInteger(value)||value<0)throw new Error('Incomplete Firebase count for '+key);
   return value;
  };
  const total=chosen.reduce((n,[key])=>n+count(key,'total'),0);
  const selected=chosen.reduce((n,[key])=>n+count(key,period),0);
  const summary=selectedRange
   ?el('div',{class:'dc-totals'},
     el('article',{class:'dc-total dc-total-primary'},
      el('span',{text:'Clicks in selected dates'}),el('strong',{text:selected.toLocaleString()}),
      el('span',{class:'dc-detail',text:dateDescription()})),
     el('article',{class:'dc-total'},el('span',{text:'All-time clicks'}),
      el('strong',{text:total.toLocaleString()}),
      el('span',{class:'dc-detail',text:'Since counting started'})))
   :el('div',{class:'dc-totals'},
     el('article',{class:'dc-total dc-total-primary'},
      el('span',{text:'Total recorded clicks'}),el('strong',{text:total.toLocaleString()}),
      el('span',{class:'dc-detail',text:preview?'Illustrative totals':'Since counting started'})),
     el('article',{class:'dc-total'},el('span',{text:'Today'}),
      el('strong',{text:selected.toLocaleString()}),
      el('span',{class:'dc-detail',text:'Calendar day in Toronto'})));
  const apps=el('div',{class:'dc-apps'},chosen.map(([key,name])=>el('article',
   {class:'dc-app','data-app':key},el('span',{class:'dc-app-mark','aria-hidden':'true',
    text:name==='The Scorecard'?'S':name.slice(0,1)}),
   el('div',{},el('h3',{text:name}),
    el('span',{text:selectedRange?count(key,'total')+' all time':count(key,'today')+' today'})),
   el('strong',{text:count(key,selectedRange?'range':'total').toLocaleString()}))));
  const events=data.events.filter(e=>!slug||e.app===slug);
  const list=el('ol',{class:'dc-events'});
  for(const event of events){
   let date='Unknown date';try{date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(event.at));}catch{}
   const timezone=typeof event.timezone==='string'&&event.timezone?event.timezone:'Unknown';
   const area=timezone==='Unknown'?'Unknown':timezone.split('/').slice(1).join(' / ').replaceAll('_',' ')||timezone;
   list.append(el('li',{},el('div',{class:'dc-event-app'},el('strong',{text:APPS[event.app]||'Unknown app'}),el('time',{text:date})),el('div',{class:'dc-event-area'},el('strong',{text:area}),el('span',{text:timezone}))));
  }
  content.replaceChildren(summary,el('div',{class:'dc-section-heading'},el('h2',{text:'By app'}),el('span',{text:'Recorded clicks'})),apps,el('div',{class:'dc-section-heading'},el('h2',{text:selectedRange?'Downloads in selected dates':'Recent downloads'}),el('span',{text:'Times in Toronto'})),events.length?list:el('p',{class:'dc-empty',text:selectedRange?'No recorded clicks in these dates.':'No recorded clicks for this app yet.'}),el('p',{class:'dc-footnote',text:'Counts represent download-button clicks. Area is based on the browser’s reported timezone, not a verified location. Some clicks may not be recorded.'}));
 }
 let data=null,busy=false;
 async function update(){
  if(busy)return;
  busy=true;refresh.disabled=true;apply.disabled=true;clear.disabled=true;
  from.disabled=true;to.disabled=true;
  data=null;showPending();status.textContent='Loading…';
  try{
   const next=await load(selectedRange?{...selectedRange}:null);
   if(!root.isConnected)return;
   render(next);
   data=next;
   status.textContent=preview?'Preview · sample activity':'Updated '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  }catch(e){
   if(root.isConnected){showPending();status.textContent='Unable to load statistics. Tap Refresh to try again.';}
  }finally{
   busy=false;refresh.disabled=false;apply.disabled=false;clear.disabled=false;
   from.disabled=false;to.disabled=false;
  }
 }
 function showDateError(message){
  dateError.textContent=message;
  dateError.hidden=!message;
 }
 dates.addEventListener('submit',event=>{
  event.preventDefault();
  if(busy)return;
  if(!from.value||!to.value){showDateError('Select both From and To dates.');return;}
  if(from.value>to.value){showDateError('From must be on or before To.');return;}
  showDateError('');
  selectedRange={from:from.value,to:to.value};
  void update();
 });
 clear.addEventListener('click',()=>{
  if(busy)return;
  from.value='';to.value='';selectedRange=null;
  showDateError('');
  void update();
 });
 select.addEventListener('change',()=>{if(data)render(data);else showPending();});
 refresh.addEventListener('click',update);
 // Schedule the query only AFTER the browser has had a chance to paint the
 // heading, totals placeholders and all six app cards.
 const afterPaint=()=>setTimeout(()=>{if(root.isConnected)void update();},0);
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(afterPaint);
 else setTimeout(afterPaint,0);
 return root;
}
