// Cloudflare route Worker: stream the original APK response unchanged.
export const APPS = {'fidunio':'FIDUNIO','scorecard':'The Scorecard','fairpot':'Fairpot','wire':'Wire','spendrecorder':'SpendRecorder','cloud-files':'Cloud Files'};
const enc = new TextEncoder();
const json = (body, status=200) => Response.json(body, {status, headers:{'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}});
async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))); }
async function authorized(request, secret) {
  if (!secret || secret.length < 40) return false;
  const a = await digest(request.headers.get('Authorization') || '');
  const b = await digest('Bearer ' + secret);
  return a.reduce((n, v, i) => n | (v ^ b[i]), 0) === 0;
}
export function eligible(request, response) {
  const range = request.headers.get('Range');
  return request.method === 'GET' && [200,206].includes(response.status) &&
    (!range || /^bytes=0-\d*$/.test(range)) &&
    !/prefetch|prerender/i.test(request.headers.get('Purpose') || request.headers.get('Sec-Purpose') || '') &&
    !/bot|crawler|spider|preview|slurp/i.test(request.headers.get('User-Agent') || '') &&
    !request.cf?.botManagement?.verifiedBot;
}
export function filters(url, now = new Date()) {
  const end = new Date(now); end.setUTCDate(end.getUTCDate()+1);
  const start = new Date(now); start.setUTCDate(start.getUTCDate()-29);
  const from = url.searchParams.get('from') || start.toISOString().slice(0,10);
  const to = url.searchParams.get('to') || end.toISOString().slice(0,10);
  const app = url.searchParams.get('app') || '';
  const before = url.searchParams.get('before') || '';
  if (![from,to].every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v).toISOString().slice(0,10) === v) ||
      from >= to || (Date.parse(to)-Date.parse(from))/86400000 > 366 ||
      (app && !Object.hasOwn(APPS,app)) || (before && !/^[1-9]\d{0,14}$/.test(before))) throw new Error('Invalid filters');
  return {from:from+'T00:00:00.000Z',to:to+'T00:00:00.000Z',app,before};
}
async function record(request, env, app) {
  const now = new Date();
  // A keyed digest deduplicates retries within a 30-minute bucket. Never store raw IPs.
  const key = await crypto.subtle.importKey('raw',enc.encode(env.DOWNLOAD_ADMIN_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const identity = [Math.floor(now.getTime()/1800000), app, request.headers.get('CF-Connecting-IP') || crypto.randomUUID(),request.headers.get('User-Agent') || ''].join('|');
  const signature = await crypto.subtle.sign('HMAC',key,enc.encode(identity));
  const fingerprint = [...new Uint8Array(signature)].map(n=>n.toString(16).padStart(2,'0')).join('');
  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const device = /Silk/i.test(ua) ? 'Amazon Silk' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS / iPadOS' : /Windows|Macintosh|Linux/i.test(ua) ? 'Computer' : 'Unknown';
  const build = new URL(request.url).searchParams.get('build') || '';
  const clean = v => typeof v === 'string' ? v.slice(0,100) : '';
  await env.DB.prepare('INSERT OR IGNORE INTO downloads (fingerprint,at,app,build,country,region,city,device) VALUES (?,?,?,?,?,?,?,?)')
    .bind(fingerprint,now.toISOString(),app,/^\d{1,20}$/.test(build)?build:'',clean(cf.country),clean(cf.region),clean(cf.city),device).run();
}
async function report(request, env) {
  if (!await authorized(request,env.DOWNLOAD_ADMIN_KEY)) return json({error:'Unauthorized'},401);
  if (request.method !== 'GET') return json({error:'Method not allowed'},405);
  let f; try { f = filters(new URL(request.url)); } catch { return json({error:'Invalid date, app or page filter'},400); }
  const where = 'at >= ? AND at < ?' + (f.app ? ' AND app = ?' : '');
  const args = [f.from,f.to,...(f.app?[f.app]:[])];
  const batch = await env.DB.batch([
    env.DB.prepare(`SELECT app,COUNT(*) AS count FROM downloads WHERE ${where} GROUP BY app ORDER BY app`).bind(...args),
    env.DB.prepare(`SELECT substr(at,1,10) AS day,COUNT(*) AS count FROM downloads WHERE ${where} GROUP BY day ORDER BY day DESC`).bind(...args),
    env.DB.prepare(`SELECT country,COUNT(*) AS count FROM downloads WHERE ${where} GROUP BY country ORDER BY count DESC,country`).bind(...args),
    env.DB.prepare(`SELECT id,at,app,build,country,region,city,device FROM downloads WHERE ${where}${f.before?' AND id < ?':''} ORDER BY id DESC LIMIT 101`).bind(...args,...(f.before?[Number(f.before)]:[]))
  ]);
  const events = batch[3].results;
  return json({apps:APPS,counts:batch[0].results,daily:batch[1].results,countries:batch[2].results,events:events.slice(0,100),next:events.length>100?events[99].id:null,from:f.from,to:f.to,retentionDays:90});
}
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!['cuberoot-systems.com','www.cuberoot-systems.com'].includes(url.hostname)) return json({error:'Not found'},404);
    if (url.pathname === '/api/apk-downloads') {
      try { return await report(request,env); } catch { return json({error:'Download records temporarily unavailable'},503); }
    }
    const match = /^\/downloads\/([a-z-]+)\.apk$/.exec(url.pathname);
    // On a Worker Route, fetch(request) continues to the existing GitHub Pages origin.
    const response = await fetch(request);
    if (match && Object.hasOwn(APPS,match[1]) && env.DB && env.DOWNLOAD_ADMIN_KEY?.length >= 40 && eligible(request,response)) {
      ctx.waitUntil(record(request,env,match[1]).catch(()=>console.error('APK analytics write failed')));
    }
    return response;
  },
  async scheduled(event, env) {
    const cutoff = new Date(event.scheduledTime-90*86400000).toISOString();
    await env.DB.prepare('DELETE FROM downloads WHERE at < ?').bind(cutoff).run();
  }
};
