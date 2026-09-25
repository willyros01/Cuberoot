// Documentation library: sign in, decrypt the lists, open documents. All in the browser.
import { SITE } from './config.js';
import { init, el, icon, formatDate, formatSize } from './common.js';
import { openReader, decryptIndex, decryptDoc, indexPath, docPath } from './vault.js';

init();

const $ = id => document.getElementById(id);
let session = null;           // { name, email, apps: [{slug, name, key, docs}] }
let lastActive = Date.now();
let lockTimer = null;

// ---------- show / hide passphrase ----------
$('show-pass').addEventListener('click', () => {
  const input = $('pass');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const btn = $('show-pass');
  btn.setAttribute('aria-pressed', String(show));
  btn.replaceChildren(icon(show ? 'eyeOff' : 'eye'), el('span', { class: 'label', text: show ? 'Hide' : 'Show' }));
});

if (new URLSearchParams(location.search).get('locked')) $('locked-note').hidden = false;

// ---------- sign in ----------
function showError(msg) { const e = $('signin-error'); e.textContent = msg; e.hidden = !msg; }

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('network');
  return res.json();
}

$('signin-form').addEventListener('submit', async ev => {
  ev.preventDefault();
  showError('');
  const email = $('email').value.trim();
  const pass = $('pass').value;
  if (!email || !pass) { showError('Please enter both your email and your passphrase.'); return; }
  $('signin-btn').disabled = true;
  $('signin-progress').hidden = false;
  try {
    const readers = await fetchJSON('vault/readers.json');
    if (!readers) { showError('The library has not been set up yet. Please try again later.'); return; }
    let grant;
    try { grant = await openReader(readers, email, pass); }
    catch (e) {
      if (e.message === 'no-match') { showError('That email and passphrase don’t match an invitation. Check both and try again.'); return; }
      throw e;
    }
    $('pass').value = '';
    await openLibrary(grant);
  } catch (e) {
    console.error(e);
    showError('The library couldn’t be reached. Check your connection and try again.');
  } finally {
    $('signin-btn').disabled = false;
    $('signin-progress').hidden = true;
  }
});

// ---------- library ----------
async function loadAppMeta() {
  try { const r = await fetch('assets/data/apps.json', { cache: 'no-cache' }); return (await r.json()).apps || []; }
  catch (e) { return []; }
}

async function openLibrary(grant) {
  const meta = await loadAppMeta();
  const order = meta.map(a => a.slug);
  const iconFor = slug => (meta.find(a => a.slug === slug) || {}).icon || 'doc';
  const apps = [...grant.apps].sort((a, b) => {
    const ia = order.indexOf(a.slug), ib = order.indexOf(b.slug);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  let failed = 0;
  for (const app of apps) {
    app.icon = iconFor(app.slug);
    app.docs = [];
    try {
      const box = await fetchJSON(indexPath(app.slug));
      if (box) app.docs = (await decryptIndex(app.key, app.slug, box)).docs || [];
    } catch (e) { console.error(e); failed++; }
  }
  session = { name: grant.name, email: grant.email, apps };
  $('who').textContent = 'Unlocked · ' + (grant.email || grant.name || 'reader');
  $('signin-view').hidden = true;
  $('library-view').hidden = false;
  document.title = 'Library — Cuberoot';
  const status = $('lib-status');
  status.hidden = !failed;
  status.textContent = failed ? 'Some lists could not be loaded. Refresh the page to try again.' : '';
  render();
  startAutoLock();
  const target = decodeURIComponent(location.hash.slice(1));
  if (target && document.getElementById('app-' + target)) document.getElementById('app-' + target).scrollIntoView();
  else window.scrollTo(0, 0);
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const match = d => !q || (d.title + ' ' + (d.original || '') + ' ' + (d.ext || '')).toLowerCase().includes(q);
  const total = session.apps.reduce((n, a) => n + a.docs.filter(match).length, 0);

  const side = [el('div', { class: 'eyebrow', text: 'Apps' }),
    el('a', { href: '#', 'aria-current': 'true', onclick: e => { e.preventDefault(); window.scrollTo(0, 0); } },
      'All documents', el('span', { text: String(total) }))];
  const content = [];

  for (const app of session.apps) {
    const docs = app.docs.filter(match).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (q && !docs.length) continue;
    side.push(el('a', { href: '#app-' + app.slug }, app.name, el('span', { text: String(docs.length) })));
    const rows = docs.length ? docs.map(d => docRow(app, d)) :
      [el('div', { class: 'doc-row' }, el('div', { class: 'grow muted', text: 'No documents yet.' }))];
    content.push(el('section', { class: 'app-section', id: 'app-' + app.slug, 'aria-labelledby': 'h-' + app.slug },
      el('h2', { id: 'h-' + app.slug }, el('span', { class: 'app-badge' }, icon(app.icon)), app.name),
      el('div', { class: 'panel' }, rows)));
  }
  if (!session.apps.length) content.push(el('div', { class: 'empty', text: 'No apps have been shared with you yet.' }));
  else if (!content.length) content.push(el('div', { class: 'empty', text: 'No documents match your search.' }));
  $('lib-side').replaceChildren(...side);
  $('lib-content').replaceChildren(...content);
}

function docRow(app, d) {
  const meta = [d.date ? 'Updated ' + formatDate(d.date) : '', d.size ? formatSize(d.size) : ''].filter(Boolean).join(' · ');
  return el('div', { class: 'doc-row' },
    el('span', { class: 'type' + (d.ext === 'pdf' ? ' pdf' : ''), text: (d.ext || 'file').toUpperCase().slice(0, 4) }),
    el('div', { class: 'grow' }, el('div', { class: 'title', text: d.title }), el('div', { class: 'meta', text: meta })),
    el('div', { class: 'doc-actions' },
      el('button', { class: 'btn btn-small', type: 'button', onclick: e => openDoc(app, d, e.currentTarget, false), 'aria-label': 'Read ' + d.title, text: 'Read' }),
      el('button', { class: 'btn btn-ghost btn-small', type: 'button', onclick: e => openDoc(app, d, e.currentTarget, true), 'aria-label': 'Download ' + d.title, text: 'Download' })));
}

async function openDoc(app, d, btn, download) {
  // Open the tab straight away (inside the tap) so Safari does not block it.
  const win = download ? null : window.open('', '_blank');
  if (win) { try { win.document.title = 'Opening…'; win.document.body.textContent = 'Decrypting ' + d.title + '…'; } catch (e) { /* ignore */ } }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = download ? 'Preparing…' : 'Opening…';
  try {
    const res = await fetch(docPath(app.slug, d.id), { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch ' + res.status);
    const plain = await decryptDoc(app.key, app.slug, d.id, new Uint8Array(await res.arrayBuffer()));
    const url = URL.createObjectURL(new Blob([plain], { type: d.mime || 'application/octet-stream' }));
    if (download || !win) {
      const a = el('a', { href: url, download: d.original || (d.title + '.' + (d.ext || 'bin')) });
      document.body.append(a); a.click(); a.remove();
    } else {
      win.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  } catch (e) {
    console.error(e);
    if (win) win.close();
    const s = $('lib-status'); s.hidden = false;
    s.textContent = '“' + d.title + '” could not be opened. It may have just been replaced — refresh the page and try again.';
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

$('search').addEventListener('input', () => { if (session) render(); });
$('lock-btn').addEventListener('click', () => lock(false));

// ---------- auto-lock ----------
function lock(auto) {
  session = null;
  $('lib-content').replaceChildren();
  location.replace('library.html' + (auto ? '?locked=1' : ''));
}
function startAutoLock() {
  const touch = () => { lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => window.addEventListener(ev, touch, { passive: true }));
  const check = () => { if (session && Date.now() - lastActive > SITE.lockMinutes * 60 * 1000) lock(true); };
  document.addEventListener('visibilitychange', check);
  lockTimer = setInterval(check, 20 * 1000);
}
