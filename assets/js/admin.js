// Cuberoot Publish — the admin page. Encrypts documents in this browser and commits
// only encrypted files to the GitHub repository. Nothing readable ever leaves the device.
import { SITE } from './config.js';
import { el, icon, hydrateIcons, formatDate, formatSize } from './common.js';
import { GitHubRepo } from './github.js';
import * as V from './vault.js';

hydrateIcons();
const root = document.getElementById('admin-root');
document.getElementById('version').textContent = 'Cuberoot Publish · version ' + SITE.version;

const TOKEN_KEY = 'cuberoot.admin.token.v1';
const ADMIN_PATH = 'vault/admin.json';
const READERS_PATH = 'vault/readers.json';

let repo = new GitHubRepo({ owner: SITE.owner, repo: SITE.repo });
let adminFile = null;      // the public, encrypted admin.json as loaded
let kek = null;            // key derived from the admin passphrase (memory only)
let state = null;          // decrypted admin state
let siteApps = [];         // apps from assets/data/apps.json
const indexes = {};        // slug -> { v, app, docs }
const ui = { tab: 'docs', app: null, newApp: '', pending: [], flash: null };

// ---------------- helpers ----------------
function flash(kind, text) { ui.flash = text ? { kind, text } : null; }
function passField(id, label, opts = {}) {
  const input = el('input', { class: 'input', id, type: 'password', autocomplete: opts.autocomplete || 'off', autocapitalize: 'off', spellcheck: 'false' });
  const btn = el('button', { class: 'show-btn', type: 'button', 'aria-pressed': 'false', 'aria-controls': id }, icon('eye'), el('span', { text: 'Show' }));
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.replaceChildren(icon(show ? 'eyeOff' : 'eye'), el('span', { text: show ? 'Hide' : 'Show' }));
  });
  return { input, node: el('div', { class: 'field' }, el('label', { for: id, text: label }), el('div', { class: 'pass-wrap' }, input, btn), opts.hint ? el('div', { class: 'hint', text: opts.hint }) : null) };
}
function textField(id, label, type = 'text', hint) {
  const input = el('input', { class: 'input', id, type, autocomplete: 'off', autocapitalize: type === 'email' ? 'off' : 'words', spellcheck: 'false' });
  return { input, node: el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('div', { class: 'hint', text: hint }) : null) };
}
function alertBox(kind, text) { return el('div', { class: 'alert ' + kind, role: kind === 'error' ? 'alert' : 'status', text }); }
function errorText(e) {
  if (e && e.status === 401) return 'GitHub did not accept the access token. It may have expired — create a new one in Settings.';
  if (e && e.status === 403) return 'GitHub refused the request. Check that the token can read and write Contents on the Cuberoot repository.';
  if (e && e.status === 404) return 'GitHub could not find the repository. Check the token has access to ' + SITE.owner + '/' + SITE.repo + '.';
  if (e && e.message === 'conflict') return 'The library was changed from another device or tab. Reload this page, then try again.';
  return (e && e.message) ? 'Something went wrong: ' + e.message : 'Something went wrong.';
}

function dialog(build, { locked = false } = {}) {
  const d = el('dialog');
  document.body.append(d);
  const close = v => { d.close(); d.remove(); return v; };
  if (locked) d.addEventListener('cancel', e => e.preventDefault());
  d.append(build(close));
  d.showModal();
  return d;
}
function confirmBox({ title, text, yes, no = 'No, keep it', danger = true }) {
  return new Promise(resolve => {
    dialog(close => el('div', { class: 'dialog-body' },
      el('h2', { text: title }), el('p', { text }),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', type: 'button', text: no, onclick: () => resolve(close(false)) }),
        el('button', { class: 'btn ' + (danger ? 'btn-danger' : ''), type: 'button', text: yes, onclick: () => resolve(close(true)) }))));
  });
}
function busy(text) {
  const msg = el('p', { text });
  const d = dialog(() => el('div', { class: 'dialog-body' }, el('div', { class: 'progress-note' }, el('div', { class: 'spinner' }), el('b', { text: 'Working…' })), msg), { locked: true });
  return { set: t => { msg.textContent = t; }, done: () => { d.close(); d.remove(); } };
}
function showSecret(record, pass, isNew) {
  const text = `Your invitation to the Cuberoot documentation library.\n\nSign in at the Library page with:\nEmail: ${record.email}\nPassphrase: ${pass}`;
  const copyBtn = el('button', { class: 'btn', type: 'button', text: 'Copy invitation' });
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied'; } catch (e) { copyBtn.textContent = 'Select the passphrase and copy it'; }
  });
  const shareBtn = navigator.share ? el('button', { class: 'btn btn-ghost', type: 'button', text: 'Share…', onclick: () => navigator.share({ title: 'Cuberoot library invitation', text }).catch(() => {}) }) : null;
  dialog(close => el('div', { class: 'dialog-body' },
    el('h2', { text: isNew ? 'Invitation created' : 'New passphrase issued' }),
    el('p', {}, 'Send this passphrase to ', el('b', { text: record.name || record.email }), ' (', record.email, '). ', el('b', { text: 'This is the only time it is shown.' })),
    el('div', { class: 'secret', text: pass }),
    el('p', { class: 'hint', text: 'Readers sign in with their email and this passphrase. Capitals and dashes don’t matter.' }),
    el('div', { class: 'dialog-actions' }, shareBtn, copyBtn, el('button', { class: 'btn btn-ghost', type: 'button', text: 'Done', onclick: () => close() }))));
}

// ---------------- token storage (encrypted with the admin key) ----------------
async function saveToken(token) {
  repo.token = token;
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ salt: adminFile.kdf.salt, box: await V.encryptJSON(kek, { token }, 'gh-token') })); }
  catch (e) { /* storage unavailable — token stays in memory for this visit */ }
}
async function loadToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    if (!saved || saved.salt !== adminFile.kdf.salt) return null;
    return (await V.decryptJSON(kek, saved.box, 'gh-token')).token;
  } catch (e) { return null; }
}
function forgetToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } repo.token = ''; }

async function checkToken(token) {
  const test = new GitHubRepo({ owner: SITE.owner, repo: SITE.repo, token });
  const info = await test.info();
  if (!info.permissions || !info.permissions.push) { const e = new Error('This token can read the repository but cannot write to it. Give it Contents: Read and write.'); throw e; }
  repo = test;
  return info;
}

// ---------------- loading ----------------
async function loadSiteApps() {
  try { siteApps = (await (await fetch('../assets/data/apps.json', { cache: 'no-cache' })).json()).apps || []; }
  catch (e) { siteApps = []; }
}
async function fetchAdminFile() {
  try { return await repo.readJSON(ADMIN_PATH); }
  catch (e) {
    const res = await fetch('../' + ADMIN_PATH, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw e;
    return res.json();
  }
}
async function loadIndexes() {
  for (const slug of Object.keys(state.apps)) {
    const box = await repo.readJSON(V.indexPath(slug), knownHead);
    indexes[slug] = box ? await V.decryptIndex(state.apps[slug].key, slug, box) : { v: 1, app: { slug, name: state.apps[slug].name }, docs: [] };
  }
}

// Before every change: make sure nobody changed the library meanwhile.
let knownHead = null;      // the commit this page last saw or made
async function assertFresh() {
  const head = await repo.head();
  if (head === knownHead) return;
  const fresh = await repo.readJSON(ADMIN_PATH, head);
  if (!fresh || fresh.state.data !== adminFile.state.data) throw new Error('conflict');
  knownHead = head;
}

async function readersFile() {
  const readers = [];
  for (const r of state.readers) readers.push(await V.buildReaderEntry(r, r.lock, state.apps));
  return { v: 1, readers };
}

// Commit the admin state and reader list along with any other changes.
async function save(extra, onProgress) {
  await assertFresh();
  const newAdmin = await V.resealAdmin(adminFile, kek, state);
  const changes = [...extra,
    { path: ADMIN_PATH, bytes: JSON.stringify(newAdmin, null, 1) },
    { path: READERS_PATH, bytes: JSON.stringify(await readersFile(), null, 1) }];
  knownHead = await repo.commit('Update library (encrypted)', changes, onProgress);
  adminFile = newAdmin;
}

// ---------------- screens ----------------
async function boot() {
  root.replaceChildren(el('div', { class: 'center-page' }, el('div', { class: 'progress-note' }, el('div', { class: 'spinner' }), 'Loading…')));
  await loadSiteApps();
  try {
    try { await repo.info(); } catch (e) { /* unauthenticated limits — carry on with defaults */ }
    adminFile = await fetchAdminFile();
  } catch (e) {
    root.replaceChildren(el('div', { class: 'center-page' }, el('h1', { text: 'Can’t reach GitHub' }), alertBox('error', errorText(e)),
      el('button', { class: 'btn', type: 'button', text: 'Try again', onclick: boot })));
    return;
  }
  adminFile ? unlockScreen() : setupScreen();
}

function setupScreen() {
  const token = passField('token', 'GitHub access token', { hint: 'A fine-grained token for ' + SITE.owner + '/' + SITE.repo + ' with Contents: Read and write. The setup guide shows how to make one.' });
  const name = textField('name', 'Your name');
  const email = textField('email', 'Your email', 'email', 'You will sign in to the library with this email and the admin passphrase.');
  const p1 = passField('p1', 'Admin passphrase', { autocomplete: 'new-password', hint: 'At least 14 characters. Four or five random words work well. There is no way to recover it, so keep a copy somewhere safe.' });
  const p2 = passField('p2', 'Repeat the admin passphrase', { autocomplete: 'new-password' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Set up the library' });
  const form = el('form', { class: 'stack-lg', novalidate: true }, token.node, name.node, email.node, p1.node, p2.node, err, btn);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fail = t => { err.replaceChildren(alertBox('error', t)); err.hidden = false; };
    err.hidden = true;
    if (!token.input.value.trim()) return fail('Please paste your GitHub access token.');
    if (!/^\S+@\S+\.\S+$/.test(email.input.value.trim())) return fail('Please enter a valid email address.');
    if (p1.input.value.length < 14) return fail('The admin passphrase must be at least 14 characters.');
    if (p1.input.value !== p2.input.value) return fail('The two passphrases don’t match.');
    btn.disabled = true;
    const b = busy('Checking the GitHub token…');
    try {
      await checkToken(token.input.value.trim());
      if (await repo.readJSON(ADMIN_PATH)) { b.done(); return fail('The library is already set up. Reload the page to unlock it.'); }
      b.set('Creating your keys…');
      const me = { id: await V.readerId(email.input.value), name: name.input.value.trim() || 'Willy', email: V.normalizeEmail(email.input.value),
        scope: 'all', rkey: V.newKeyB64(), norm: 'text', admin: true, created: new Date().toISOString() };
      me.lock = await V.wrapReaderKey(me, p1.input.value);
      state = { v: 1, apps: {}, readers: [me], created: new Date().toISOString() };
      const sealed = await V.sealAdmin(state, p1.input.value);
      adminFile = sealed.file; kek = sealed.kek;
      b.set('Saving to GitHub…');
      knownHead = await repo.commit('Set up the library (encrypted)', [
        { path: ADMIN_PATH, bytes: JSON.stringify(adminFile, null, 1) },
        { path: READERS_PATH, bytes: JSON.stringify(await readersFile(), null, 1) }]);
      await saveToken(repo.token);
      b.done();
      flash('ok', 'The library is set up. Choose an app and add your first documents.');
      mainScreen();
    } catch (e) { b.done(); btn.disabled = false; fail(errorText(e)); }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'First-time setup' }), el('h1', { text: 'Set up the library' }),
    el('p', { class: 'muted', text: 'This runs once. It creates your admin key and saves it, encrypted, to the Cuberoot repository.' }), form));
}

function unlockScreen() {
  const p = passField('ap', 'Admin passphrase', { autocomplete: 'current-password' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Unlock' });
  const note = el('div', { class: 'progress-note', hidden: true }, el('div', { class: 'spinner' }), 'Unlocking…');
  const form = el('form', { class: 'stack-lg', novalidate: true }, p.node, err, btn, note);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    err.hidden = true; btn.disabled = true; note.hidden = false;
    try {
      const opened = await V.openAdmin(adminFile, p.input.value);
      state = opened.state; kek = opened.kek;
      const token = await loadToken();
      if (token) {
        repo.token = token;
        try { await afterToken(p.input.value); return; }
        catch (e) { if (e.status === 401) { forgetToken(); tokenScreen(p.input.value, 'The saved GitHub token no longer works. Please paste a new one.'); return; } throw e; }
      }
      tokenScreen(p.input.value);
    } catch (e) {
      err.replaceChildren(alertBox('error', e.message === 'wrong-passphrase' ? 'That passphrase is not right. Try again.' : errorText(e)));
      err.hidden = false;
    } finally { btn.disabled = false; note.hidden = true; }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'Admin · Willy only' }), el('h1', { text: 'Unlock Publish' }), form,
    el('p', { class: 'hint', text: 'Your passphrase never leaves this device.' })));
  p.input.focus();
}

function tokenScreen(passphrase, message) {
  const t = passField('tk', 'GitHub access token', { hint: 'Fine-grained token for ' + SITE.owner + '/' + SITE.repo + ' with Contents: Read and write. It is saved on this device, encrypted with your admin key.' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Connect GitHub' });
  const form = el('form', { class: 'stack-lg', novalidate: true }, message ? alertBox('info', message) : null, t.node, err, btn);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    btn.disabled = true; err.hidden = true;
    try { await checkToken(t.input.value.trim()); await saveToken(repo.token); await afterToken(passphrase); }
    catch (e) { err.replaceChildren(alertBox('error', errorText(e))); err.hidden = false; }
    finally { btn.disabled = false; }
  });
  root.replaceChildren(el('div', { class: 'center-page' }, el('div', { class: 'eyebrow', text: 'This device' }), el('h1', { text: 'Connect GitHub' }), form));
}

async function afterToken(passphrase) {
  const b = busy('Loading the library…');
  try {
    await repo.info();
    // Re-read the admin state straight from GitHub so it is never stale.
    knownHead = await repo.head();
    const fresh = await repo.readJSON(ADMIN_PATH, knownHead);
    if (fresh && fresh.state.data !== adminFile.state.data) {
      const opened = fresh.kdf.salt === adminFile.kdf.salt ? { state: await V.decryptJSON(kek, fresh.state, 'admin-state'), kek } : await V.openAdmin(fresh, passphrase);
      state = opened.state; kek = opened.kek; adminFile = fresh;
    }
    await loadIndexes();
  } finally { b.done(); }
  mainScreen();
  startIdleLock();
}

// ---------------- main screen ----------------
function knownApps() {
  const list = siteApps.map(a => ({ slug: a.slug, name: a.name }));
  for (const [slug, a] of Object.entries(state.apps)) if (!list.find(x => x.slug === slug)) list.push({ slug, name: a.name });
  return list;
}

function mainScreen() {
  document.getElementById('admin-tools').hidden = false;
  document.getElementById('gh-pill').hidden = !repo.token;
  if (!ui.app) ui.app = knownApps()[0] ? knownApps()[0].slug : '__new';
  const tabs = [['docs', 'Documents'], ['readers', 'Readers'], ['settings', 'Settings']];
  const tabBar = el('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, label]) =>
    el('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(ui.tab === k), text: label, onclick: () => { ui.tab = k; flash(); mainScreen(); } })));
  const body = ui.tab === 'docs' ? docsTab() : ui.tab === 'readers' ? readersTab() : settingsTab();
  root.replaceChildren(
    el('div', { class: 'admin-head' },
      el('div', { class: 'row' },
        el('div', {}, el('div', { class: 'eyebrow', text: 'Admin · Willy only' }), el('h1', { text: 'Publish' })),
        el('a', { href: '../library.html', text: 'View the library as a reader →' })),
      ui.flash ? alertBox(ui.flash.kind, ui.flash.text) : null,
      tabBar),
    body);
}

// ----- documents -----
function docsTab() {
  const apps = knownApps();
  const picker = el('div', { class: 'panel app-picker' },
    apps.map(a => {
      const n = indexes[a.slug] ? indexes[a.slug].docs.length : 0;
      return el('button', { class: 'app-pick', type: 'button', 'aria-pressed': String(ui.app === a.slug),
        onclick: () => { ui.app = a.slug; ui.pending = []; flash(); mainScreen(); } }, a.name, el('span', { text: n ? String(n) : 'none yet' }));
    }),
    el('button', { class: 'app-pick add', type: 'button', 'aria-pressed': String(ui.app === '__new'), text: '+ Add a new app',
      onclick: () => { ui.app = '__new'; ui.pending = []; flash(); mainScreen(); } }));

  let newName = null;
  if (ui.app === '__new') {
    newName = textField('newapp', 'New app name', 'text', 'Its folder is created with the first upload.');
    newName.input.value = ui.newApp;
    newName.input.addEventListener('input', () => { ui.newApp = newName.input.value; });
  }
  const current = ui.app === '__new' ? null : apps.find(a => a.slug === ui.app);
  const appName = current ? current.name : 'the new app';

  return el('div', { class: 'docs-layout' },
    el('div', { class: 'stack' }, el('div', { class: 'step-title', text: '1 · Choose the app' }), picker, newName ? newName.node : null),
    el('div', { class: 'stack-lg' }, addSection(appName), publishSection(current), publishedSection(current)));
}

function addSection(appName) {
  const input = el('input', { type: 'file', multiple: true, hidden: true, accept: '.pdf,.md,.markdown,.txt,.docx,.xlsx,.png,.jpg,.jpeg,.zip' });
  const addFiles = files => {
    const name = ui.app === '__new' ? ui.newApp : appName;
    for (const f of files) ui.pending.push({ file: f, title: V.titleFromFilename(f.name, name) });
    flash(); mainScreen();
  };
  input.addEventListener('change', () => addFiles([...input.files]));
  const drop = el('button', { class: 'drop', type: 'button', onclick: () => input.click() },
    el('span', { class: 'up' }, icon('upload')), el('b', { text: 'Choose files' }),
    el('small', { text: 'From Files, iCloud Drive or your computer · PDF, Markdown, text and more' }));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });

  let list = null;
  if (ui.pending.length) {
    list = el('div', { class: 'panel' },
      el('div', { class: 'list-head' }, el('b', { text: ui.pending.length + (ui.pending.length === 1 ? ' document selected' : ' documents selected') }),
        el('span', { class: 'muted', text: 'Titles come from the file names — edit any before publishing' })),
      ui.pending.map((p, i) => {
        const kind = V.fileKind(p.file.name);
        const tin = el('input', { class: 'input', id: 'pt' + i, type: 'text', value: p.title });
        tin.addEventListener('input', () => { p.title = tin.value; });
        return el('div', { class: 'file-row' },
          el('span', { class: 'type' + (kind.ext === 'pdf' ? ' pdf' : ''), text: kind.label }),
          el('div', { class: 'grow' }, el('label', { for: 'pt' + i, text: p.file.name + ' · ' + formatSize(p.file.size) }), tin),
          el('button', { class: 'btn btn-ghost icon-btn', type: 'button', 'aria-label': 'Remove ' + p.file.name, onclick: () => { ui.pending.splice(i, 1); mainScreen(); } }, icon('close')));
      }));
  }
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: '2 · Add documents to ' + appName }), input, drop, list);
}

function publishSection(current) {
  const n = ui.pending.length;
  const btn = el('button', { class: 'btn btn-block', type: 'button', disabled: !n,
    text: n ? `Encrypt and publish ${n} document${n === 1 ? '' : 's'}` : 'Choose documents first', onclick: () => publish(current) });
  const step = (t, i) => el('div', { class: 'step' }, el('i', { text: String(i) }), t);
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: '3 · Publish' }),
    el('div', { class: 'panel publish-box' },
      el('div', { class: 'steps' }, step('Encrypt on this device', 1), step('Upload to GitHub', 2), step('Update the library index', 3)),
      btn,
      el('div', { class: 'hint', text: 'Originals never leave this device unencrypted. Only encrypted copies with random names reach the Cuberoot repository.' })));
}

function publishedSection(current) {
  if (!current) return null;
  const idx = indexes[current.slug];
  const docs = idx ? [...idx.docs].sort((a, b) => String(b.date).localeCompare(String(a.date))) : [];
  const list = docs.length ? el('div', { class: 'panel' }, docs.map(d => {
    const rep = el('input', { type: 'file', hidden: true });
    rep.addEventListener('change', () => { if (rep.files[0]) replaceDoc(current, d, rep.files[0]); });
    return el('div', { class: 'doc-row' },
      el('span', { class: 'type' + (d.ext === 'pdf' ? ' pdf' : ''), text: (d.ext || 'file').toUpperCase().slice(0, 4) }),
      el('div', { class: 'grow' }, el('div', { class: 'title', text: d.title }),
        el('div', { class: 'meta', text: 'Published ' + formatDate(d.date) + ' · ' + formatSize(d.size || 0) + (d.original ? ' · ' + d.original : '') })),
      el('div', { class: 'doc-actions' }, rep,
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Replace', 'aria-label': 'Replace ' + d.title, onclick: () => rep.click() }),
        el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Remove', 'aria-label': 'Remove ' + d.title, onclick: () => removeDoc(current, d) })));
  })) : el('div', { class: 'empty', text: 'Nothing published for this app yet.' });
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: 'Already published in ' + current.name }), list);
}

async function ensureApp(current) {
  if (current) {
    if (!state.apps[current.slug]) { state.apps[current.slug] = { name: current.name, key: V.newKeyB64(), created: new Date().toISOString() }; return current.slug; }
    return current.slug;
  }
  const name = ui.newApp.trim();
  if (!name) throw new Error('Please type a name for the new app first.');
  const slug = V.slugify(name);
  if (!state.apps[slug]) state.apps[slug] = { name, key: V.newKeyB64(), created: new Date().toISOString() };
  return slug;
}

async function publish(current) {
  if (!ui.pending.length) return;
  const snapshot = JSON.stringify(state);
  const b = busy('Encrypting…');
  try {
    const slug = await ensureApp(current);
    const app = state.apps[slug];
    const index = indexes[slug] ? structuredClone(indexes[slug]) : { v: 1, app: { slug, name: app.name }, docs: [] };
    const changes = [];
    let i = 0;
    for (const p of ui.pending) {
      i++; b.set(`Encrypting ${i} of ${ui.pending.length}: ${p.title}`);
      const bytes = new Uint8Array(await p.file.arrayBuffer());
      const id = V.randomId();
      const kind = V.fileKind(p.file.name);
      changes.push({ path: V.docPath(slug, id), bytes: await V.encryptDoc(app.key, slug, id, bytes) });
      index.docs.push({ id, title: (p.title || '').trim() || V.titleFromFilename(p.file.name, app.name), ext: kind.ext, mime: kind.mime,
        size: bytes.length, date: new Date().toISOString(), original: p.file.name });
    }
    changes.push({ path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) });
    b.set('Uploading to GitHub…');
    await save(changes, (done, total) => b.set(`Uploading to GitHub… ${done} of ${total}`));
    indexes[slug] = index;
    const n = ui.pending.length;
    ui.pending = []; ui.app = slug; ui.newApp = '';
    b.done();
    flash('ok', `Published ${n} document${n === 1 ? '' : 's'} to ${app.name}. Readers will see ${n === 1 ? 'it' : 'them'} within a minute or two, once GitHub Pages refreshes.`);
    mainScreen();
  } catch (e) {
    state = JSON.parse(snapshot);
    b.done(); flash('error', errorText(e)); mainScreen();
  }
}

async function removeDoc(current, d) {
  const ok = await confirmBox({ title: 'Remove this document?', text: `“${d.title}” will be removed from the library for everyone.`, yes: 'Yes, remove it' });
  if (!ok) return;
  const slug = current.slug, app = state.apps[slug];
  const b = busy('Removing…');
  try {
    const index = structuredClone(indexes[slug]);
    index.docs = index.docs.filter(x => x.id !== d.id);
    await save([{ path: V.docPath(slug, d.id), bytes: null }, { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }]);
    indexes[slug] = index;
    b.done(); flash('ok', `Removed “${d.title}”.`); mainScreen();
  } catch (e) { b.done(); flash('error', errorText(e)); mainScreen(); }
}

async function replaceDoc(current, d, file) {
  const ok = await confirmBox({ title: 'Replace this document?', text: `“${d.title}” will be replaced by ${file.name}. The title stays the same.`, yes: 'Yes, replace it', danger: false });
  if (!ok) return;
  const slug = current.slug, app = state.apps[slug];
  const b = busy('Encrypting the new version…');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = V.randomId(), kind = V.fileKind(file.name);
    const index = structuredClone(indexes[slug]);
    const entry = index.docs.find(x => x.id === d.id);
    Object.assign(entry, { id, ext: kind.ext, mime: kind.mime, size: bytes.length, date: new Date().toISOString(), original: file.name });
    b.set('Uploading to GitHub…');
    await save([{ path: V.docPath(slug, id), bytes: await V.encryptDoc(app.key, slug, id, bytes) },
      { path: V.docPath(slug, d.id), bytes: null },
      { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }]);
    indexes[slug] = index;
    b.done(); flash('ok', `Replaced “${d.title}”.`); mainScreen();
  } catch (e) { b.done(); flash('error', errorText(e)); mainScreen(); }
}

// ----- readers -----
// Give every app in a reader's scope a key now, so the app shows up for them
// (as "No documents yet") even before its first document is published.
function ensureScopeApps(scope) {
  const slugs = scope === 'all' ? knownApps().map(a => a.slug) : scope;
  for (const slug of slugs) {
    if (state.apps[slug]) continue;
    const a = knownApps().find(x => x.slug === slug);
    if (a) state.apps[slug] = { name: a.name, key: V.newKeyB64(), created: new Date().toISOString() };
  }
}

function scopeText(scope) {
  if (scope === 'all') return 'All apps';
  const names = scope.map(s => (knownApps().find(a => a.slug === s) || { name: s }).name);
  return names.length ? names.join(', ') : 'No apps';
}

function scopeFields(prefix, scope) {
  const all = el('input', { type: 'radio', name: prefix + '-scope', value: 'all', checked: scope === 'all' });
  const some = el('input', { type: 'radio', name: prefix + '-scope', value: 'some', checked: scope !== 'all' });
  const boxes = knownApps().map(a => ({ slug: a.slug, input: el('input', { type: 'checkbox', value: a.slug, checked: scope !== 'all' && scope.includes(a.slug) }), name: a.name }));
  const list = el('div', { class: 'scope-apps', hidden: scope === 'all' }, boxes.map(b => el('label', { class: 'check' }, b.input, b.name)));
  const sync = () => { list.hidden = all.checked; };
  all.addEventListener('change', sync); some.addEventListener('change', sync);
  const node = el('fieldset', {}, el('legend', { text: 'Can read' }),
    el('label', { class: 'check' }, all, 'All apps'), el('label', { class: 'check' }, some, 'Only the apps I choose'), list);
  return { node, value: () => all.checked ? 'all' : boxes.filter(b => b.input.checked).map(b => b.slug) };
}

function readersTab() {
  const rows = state.readers.map(r => el('div', { class: 'reader-row' },
    el('div', { class: 'avatar', text: (r.name || r.email || '?').trim().charAt(0).toUpperCase() }),
    el('div', { class: 'grow' }, el('b', { text: (r.name || 'Reader') + (r.admin ? ' (you)' : '') }),
      el('div', { class: 'meta', text: r.email + ' · Can read: ' + scopeText(r.scope) })),
    r.admin ? null : el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Change', onclick: () => changeReader(r) }),
    r.admin ? null : el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Revoke', onclick: () => revokeReader(r) })));

  const name = textField('rn', 'Name');
  const email = textField('re', 'Email', 'email');
  const scope = scopeFields('inv', 'all');
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Create invitation' });
  const form = el('form', { class: 'panel form-box', novalidate: true }, name.node, email.node, scope.node, err, btn,
    el('div', { class: 'hint', text: 'You get a passphrase to send them. It is shown only once; you can issue a new one at any time.' }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fail = t => { err.replaceChildren(alertBox('error', t)); err.hidden = false; };
    err.hidden = true;
    const mail = V.normalizeEmail(email.input.value);
    if (!/^\S+@\S+\.\S+$/.test(mail)) return fail('Please enter a valid email address.');
    const id = await V.readerId(mail);
    if (state.readers.find(r => r.id === id)) return fail('This email is already invited. Use Change to issue a new passphrase.');
    const sc = scope.value();
    if (sc !== 'all' && !sc.length) return fail('Choose at least one app, or All apps.');
    const snapshot = JSON.stringify(state);
    const b = busy('Creating the invitation…');
    try {
      const pass = V.generatePassphrase();
      const rec = { id, name: name.input.value.trim(), email: mail, scope: sc, rkey: V.newKeyB64(), norm: 'code', created: new Date().toISOString() };
      rec.lock = await V.wrapReaderKey(rec, pass);
      ensureScopeApps(sc);
      state.readers.push(rec);
      b.set('Saving to GitHub…');
      await save([]);
      b.done(); flash('ok', 'Invitation created for ' + (rec.name || rec.email) + '.'); mainScreen();
      showSecret(rec, pass, true);
    } catch (e) { state = JSON.parse(snapshot); b.done(); fail(errorText(e)); }
  });

  return el('div', { class: 'readers-layout' },
    el('div', { class: 'stack' }, el('div', { class: 'step-title', text: 'Invited readers' }), el('div', { class: 'panel' }, rows),
      el('p', { class: 'hint', text: 'Revoking removes a reader’s key at once. Copies they already downloaded stay with them, so you can also re-encrypt their apps with fresh keys.' })),
    el('div', { class: 'stack' }, el('div', { class: 'step-title', text: 'Invite a reader' }), form));
}

function changeReader(r) {
  const scope = scopeFields('chg', r.scope);
  dialog(close => {
    const saveBtn = el('button', { class: 'btn', type: 'button', text: 'Save' });
    const newPass = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Issue a new passphrase' });
    saveBtn.addEventListener('click', async () => {
      const sc = scope.value();
      if (sc !== 'all' && !sc.length) return;
      close();
      const snapshot = JSON.stringify(state);
      const b = busy('Saving…');
      try { r.scope = sc; ensureScopeApps(sc); await save([]); b.done(); flash('ok', 'Updated access for ' + (r.name || r.email) + '.'); }
      catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', errorText(e)); }
      mainScreen();
    });
    newPass.addEventListener('click', async () => {
      close();
      const snapshot = JSON.stringify(state);
      const b = busy('Issuing a new passphrase…');
      try {
        const pass = V.generatePassphrase();
        r.lock = await V.wrapReaderKey(r, pass);
        await save([]); b.done(); flash('ok', 'New passphrase issued. The old one no longer works.'); mainScreen(); showSecret(r, pass, false);
      } catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', errorText(e)); mainScreen(); }
    });
    return el('div', { class: 'dialog-body' }, el('h2', { text: 'Change ' + (r.name || r.email) }), el('p', { class: 'muted', text: r.email }), scope.node,
      el('div', { class: 'dialog-actions' }, el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancel', onclick: () => close() }), newPass, saveBtn));
  });
}

async function revokeReader(r) {
  const ok = await confirmBox({ title: 'Revoke access?', text: `${r.name || r.email} will no longer be able to sign in to the library.`, yes: 'Yes, revoke' });
  if (!ok) return;
  const affected = r.scope === 'all' ? Object.keys(state.apps) : r.scope.filter(s => state.apps[s]);
  const snapshot = JSON.stringify(state);
  const b = busy('Revoking…');
  try {
    state.readers = state.readers.filter(x => x.id !== r.id);
    await save([]);
    b.done(); flash('ok', 'Access revoked for ' + (r.name || r.email) + '.'); mainScreen();
  } catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', errorText(e)); mainScreen(); return; }
  if (!affected.length) return;
  const rotate = await confirmBox({ title: 'Re-encrypt their apps too?', danger: false,
    text: 'Their key is gone, but they may have kept a copy of the old app keys. Re-encrypting ' + affected.map(s => state.apps[s].name).join(', ') + ' with fresh keys makes sure old copies of the keys are useless. Other readers are not affected.',
    yes: 'Re-encrypt now', no: 'Not now' });
  if (rotate) rotateApps(affected);
}

async function rotateApps(slugs) {
  const snapshot = JSON.stringify(state);
  const b = busy('Re-encrypting…');
  try {
    const changes = [];
    const newIndexes = {};
    for (const slug of slugs) {
      const oldKey = state.apps[slug].key, newKey = V.newKeyB64();
      const index = structuredClone(indexes[slug] || { v: 1, app: { slug, name: state.apps[slug].name }, docs: [] });
      let i = 0;
      for (const d of index.docs) {
        i++; b.set(`Re-encrypting ${state.apps[slug].name}: ${i} of ${index.docs.length}`);
        const data = await repo.read(V.docPath(slug, d.id), knownHead);
        if (!data) continue;
        const plain = await V.decryptDoc(oldKey, slug, d.id, data);
        const id = V.randomId();
        changes.push({ path: V.docPath(slug, id), bytes: await V.encryptDoc(newKey, slug, id, plain) });
        changes.push({ path: V.docPath(slug, d.id), bytes: null });
        d.id = id;
      }
      changes.push({ path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(newKey, slug, index)) });
      state.apps[slug].key = newKey;
      newIndexes[slug] = index;
    }
    b.set('Uploading to GitHub…');
    await save(changes, (d, t) => b.set(`Uploading to GitHub… ${d} of ${t}`));
    Object.assign(indexes, newIndexes);
    b.done(); flash('ok', 'Re-encrypted with fresh keys. Current readers keep their access.'); mainScreen();
  } catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', errorText(e)); mainScreen(); }
}

// ----- settings -----
function settingsTab() {
  return el('div', { class: 'stack-lg', style: null },
    el('div', { class: 'panel form-box' },
      el('div', { class: 'step-title', text: 'GitHub' }),
      el('p', {}, 'Repository: ', el('b', { text: SITE.owner + '/' + SITE.repo }), ' · branch ', el('b', { text: repo.branch })),
      el('p', { class: 'muted', text: 'The access token is saved on this device only, encrypted with your admin key.' }),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Replace the token', onclick: () => { forgetToken(); tokenScreenFromMain(); } }),
        el('button', { class: 'btn btn-danger', type: 'button', text: 'Forget the token on this device', onclick: async () => {
          if (await confirmBox({ title: 'Forget the token?', text: 'You will need to paste a token again the next time you publish from this device.', yes: 'Yes, forget it' })) { forgetToken(); location.reload(); }
        } }))),
    el('div', { class: 'panel form-box' },
      el('div', { class: 'step-title', text: 'Security' }),
      el('p', { class: 'muted', text: 'Publish locks itself after ' + SITE.lockMinutes + ' minutes without use. Your admin passphrase cannot be recovered — keep a copy somewhere safe.' })));
}
function tokenScreenFromMain() {
  document.getElementById('admin-tools').hidden = true;
  const t = passField('tk2', 'New GitHub access token');
  const err = el('div', { hidden: true });
  const form = el('form', { class: 'stack-lg', novalidate: true }, t.node, err, el('button', { class: 'btn btn-block', type: 'submit', text: 'Save the new token' }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    try { await checkToken(t.input.value.trim()); await saveToken(repo.token); flash('ok', 'New token saved.'); mainScreen(); }
    catch (e) { err.replaceChildren(alertBox('error', errorText(e))); err.hidden = false; }
  });
  root.replaceChildren(el('div', { class: 'center-page' }, el('h1', { text: 'Replace the token' }), form));
}

// ---------------- lock ----------------
document.getElementById('admin-lock').addEventListener('click', () => location.reload());
function startIdleLock() {
  let last = Date.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, () => { last = Date.now(); }, { passive: true }));
  const check = () => { if (Date.now() - last > SITE.lockMinutes * 60 * 1000) location.reload(); };
  setInterval(check, 20000);
  document.addEventListener('visibilitychange', check);
}

boot();
