import {cockpit} from './downloads-ui.js?v=2.0.0';
import {DOWNLOADS_ENDPOINT} from './downloads-config.js?v=2.0.0';
export function downloadsTab({getKey}) {
 return cockpit({load:async()=>{
  const key=getKey();
  if(!DOWNLOADS_ENDPOINT||!key)throw new Error('Not connected');
  const response=await fetch(DOWNLOADS_ENDPOINT,{headers:{Authorization:'Bearer '+key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Unavailable');
  return response.json();
 }});
}
