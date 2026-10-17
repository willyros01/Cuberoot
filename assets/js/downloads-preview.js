import {cockpit} from './downloads-ui.js?v=2.1.2';
import {torontoRange} from './apk-date-window.js?v=1';
const counts={fidunio:{total:42,today:4},scorecard:{total:31,today:3},fairpot:{total:25,today:2},wire:{total:20,today:1},spendrecorder:{total:18,today:1},'cloud-files':{total:12,today:1}};
const rows=[['fidunio','America/Toronto'],['scorecard','America/Vancouver'],['wire','Asia/Manila'],['fairpot','Europe/London'],['spendrecorder','America/New_York'],['cloud-files','Australia/Sydney'],['fidunio','Unknown'],['scorecard','America/Toronto']];
const now=Date.now();
const events=rows.map(([app,timezone],i)=>({app,timezone,at:new Date(now-i*37*60000).toISOString()}));
async function sampleReport(range){
 if(!range)return {counts,events};
 const dates=torontoRange(range.from,range.to);
 const selected=events.filter(e=>{const time=new Date(e.at);return time>=dates.start&&time<dates.end;});
 const result={};
 for(const [app,value] of Object.entries(counts)){
  result[app]={total:value.total,range:selected.filter(e=>e.app===app).length};
 }
 return {counts:result,events:selected};
}
document.getElementById('cockpit-root').append(cockpit({preview:true,load:sampleReport}));
