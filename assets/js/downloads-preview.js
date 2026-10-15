import {cockpit} from './downloads-ui.js?v=2.0.0';
const counts={fidunio:{total:42,today:4},scorecard:{total:31,today:3},fairpot:{total:25,today:2},wire:{total:20,today:1},spendrecorder:{total:18,today:1},'cloud-files':{total:12,today:1}};
const rows=[['fidunio','America/Toronto'],['scorecard','America/Vancouver'],['wire','Asia/Manila'],['fairpot','Europe/London'],['spendrecorder','America/New_York'],['cloud-files','Australia/Sydney'],['fidunio','Unknown'],['scorecard','America/Toronto']];
const now=Date.now();const events=rows.map(([app,timezone],i)=>({app,timezone,at:new Date(now-i*37*60000).toISOString()}));
document.getElementById('cockpit-root').append(cockpit({preview:true,load:async()=>({counts,events})}));
