// Pure Toronto calendar-day bounds for the APK cockpit. End date is inclusive.
// UTC instants are derived from Toronto midnight, not the iPad's time zone.
const TZ='America/Toronto';
const formatter=new Intl.DateTimeFormat('en-CA',{
 timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function localParts(date){
 return Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
}
export function validDate(iso){
 if(typeof iso!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(iso))return false;
 const parsed=new Date(iso+'T00:00:00Z');
 return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===iso;
}
export function torontoMidnight(iso){
 if(!validDate(iso))throw new Error('Enter a valid calendar date.');
 const [year,month,day]=iso.split('-').map(Number);
 // For Toronto, midnight is 04:00 or 05:00 UTC. Allow a wider safe
 // search for historic daylight-saving shifts; reject any ambiguous result.
 for(let h=0;h<=9;h++){
  const instant=new Date(iso+'T00:00:00Z');
  instant.setUTCHours(h);
  const x=localParts(instant);
  if(+x.year===year&&+x.month===month&&+x.day===day&&+x.hour===0&&+x.minute===0){
   return instant;
  }
 }
 throw new Error('Could not determine Toronto midnight.');
}
export function torontoToday(now=new Date()){
 const p=localParts(now);
 return [p.year,p.month,p.day].join('-');
}
export function torontoRange(from,to){
 if(!validDate(from)||!validDate(to))throw new Error('Enter both valid dates.');
 if(from>to)throw new Error('From must be on or before To.');
 const next=new Date(to+'T00:00:00Z');
 next.setUTCDate(next.getUTCDate()+1);
 const endDate=next.toISOString().slice(0,10);
 return {from,to,start:torontoMidnight(from),end:torontoMidnight(endDate)};
}
