// Cuberoot Publish — the admin page. Encrypts documents in this browser and commits
// only encrypted files to the GitHub repository. Nothing readable ever leaves the device.
import { SITE } from './config.js?v=1.3.0';
import { el, icon, hydrateIcons, formatDate, formatSize, connectionNotice } from './common.js?v=1.3.0';
import { GitHubRepo } from './github.js?v=1.3.0';
import * as V from './vault.js?v=1.3.0';

hydrateIcons();
const root = document.getElementById('admin-root');
document.getElementById('version').textContent = 'Cuberoot Publish · version ' + SITE.version;

const ADMIN_PATH = 'vault/admin.json';
const READERS_PATH = 'vault/readers.json';

let repo = new GitHubRepo({ owner: SITE.owner, repo: SITE.repo });
let adminFile = null;      // the public, encrypted admin.json as loaded
let kek = null;            // key derived from the admin passphrase (memory only)
let state = null;          // decrypted admin state
let siteApps = [];         // apps from assets/data/apps.json
const indexes = {};        // slug -> { v, app, docs }  (encrypted, by invitation)
let publicIndex = { v: 1, apps: {} };   // guides/index.json (public documents)
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
  if (e && e.message === 'no-random') return 'This browser cannot provide secure random numbers, so it cannot encrypt. Please use an up-to-date Safari, Chrome, Edge or Firefox.';
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

// ---------------- GitHub token ----------------
// The token is kept inside the encrypted admin state in the repository itself — never in
// the browser's storage — so every device and every web address finds it after unlock.
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function savedToken() { return state && state.github && state.github.token ? state.github.token : null; }
function setToken(token) { state.github = { token, saved: new Date().toISOString() }; repo.token = token; }

async function checkToken(token) {
  const test = new GitHubRepo({ owner: SITE.owner, repo: SITE.repo, token });
  const info = await test.info();
  if (!info.permissions || !info.permissions.push) { const e = new Error('This token can read the repository but cannot write to it. Give it Contents: Read and write.'); throw e; }
  repo = test;
  return info;
}

// ---------------- loading ----------------
async function loadSiteApps() {
  try { siteApps = (await (await fetch('../assets/data/apps.json', { cache: 'no-store' })).json()).apps || []; }
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
  publicIndex = (await repo.readJSON(V.PUBLIC_INDEX, knownHead)) || { v: 1, apps: {} };
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
  await commitAdmin(await V.resealAdmin(adminFile, kek, state), extra, 'Update library (encrypted)', onProgress);
}
// One commit with a new admin.json. adminFile only changes once GitHub has accepted it.
async function commitAdmin(newAdmin, extra = [], message = 'Update library (encrypted)', onProgress) {
  await assertFresh();
  const changes = [...extra,
    { path: ADMIN_PATH, bytes: JSON.stringify(newAdmin, null, 1) },
    { path: READERS_PATH, bytes: JSON.stringify(await readersFile(), null, 1) }];
  knownHead = await repo.commit(message, changes, onProgress);
  adminFile = newAdmin;
}

// ---------------- recovery code ----------------
// Shown once, right after it has been saved to GitHub. The dialog cannot be closed until
// Willy confirms he has written it down.
function showRecoveryCode(code, isNew) {
  return new Promise(resolve => {
    const copyBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Copy' });
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); copyBtn.textContent = 'Copied'; } catch (e) { copyBtn.textContent = 'Select the code and copy it'; }
    });
    const tick = el('input', { type: 'checkbox', id: 'rc-ok' });
    const done = el('button', { class: 'btn', type: 'button', text: 'Done', disabled: true });
    tick.addEventListener('change', () => { done.disabled = !tick.checked; });
    dialog(close => {
      done.addEventListener('click', () => resolve(close(true)));
      return el('div', { class: 'dialog-body' },
        el('h2', { text: isNew ? 'Your new recovery code' : 'Your recovery code' }),
        el('p', {}, 'If you ever forget your admin passphrase, this code lets you choose a new one. ', el('b', { text: 'This is the only time it is shown.' })),
        el('div', { class: 'secret', text: code }),
        el('p', { class: 'hint', text: 'Write it on paper and keep it with your important papers, away from this device. Anyone who has this code can open Publish, so do not email it or keep it in the same place as your passphrase. Capitals and dashes don’t matter.' }),
        isNew === 'replaced' ? el('p', { class: 'hint', text: 'Your previous recovery code no longer works.' }) : null,
        el('label', { class: 'check-row', for: 'rc-ok' }, tick, el('span', { text: 'I have written down my recovery code' })),
        el('div', { class: 'dialog-actions' }, copyBtn, done));
    }, { locked: true });
  });
}
function recoveryInfo() {
  return adminFile && adminFile.recovery ? adminFile.recovery : null;
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
  const p1 = passField('p1', 'Admin passphrase', { autocomplete: 'new-password', hint: 'At least 14 characters. Four or five random words work well. You will also get a recovery code, in case you ever forget it.' });
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
      setToken(repo.token);
      const rc = V.generateRecoveryCode();
      const sealed = await V.sealAdmin(state, p1.input.value, rc);
      adminFile = sealed.file; kek = sealed.kek;
      b.set('Saving to GitHub…');
      knownHead = await repo.commit('Set up the library (encrypted)', [
        { path: ADMIN_PATH, bytes: JSON.stringify(adminFile, null, 1) },
        { path: READERS_PATH, bytes: JSON.stringify(await readersFile(), null, 1) }]);
      b.done();
      await showRecoveryCode(rc);
      flash('ok', 'The library is set up. Choose an app and add your first documents.');
      mainScreen();
      startIdleLock();
    } catch (e) { b.done(); btn.disabled = false; fail(errorText(e)); }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'First-time setup' }), el('h1', { text: 'Set up the library' }),
    el('p', { class: 'muted', text: 'This runs once. It creates your admin key and saves it, with your GitHub token, encrypted in the Cuberoot repository.' }), form));
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
      const token = savedToken();
      if (token) {
        repo.token = token;
        try { await afterToken(p.input.value); return; }
        catch (e) { if (e.status === 401) { tokenScreen(p.input.value, 'Your passphrase is correct, but GitHub no longer accepts the saved token (it may have expired). Paste a new token once; it replaces the old one for every device.'); return; } throw e; }
      }
      tokenScreen(p.input.value, 'Your passphrase is correct. Paste your GitHub token once. It is then kept, encrypted with your admin passphrase, inside the library itself, so every device and every web address will find it.');
    } catch (e) {
      err.replaceChildren(alertBox('error', e.message === 'wrong-passphrase' ? 'That passphrase is not right. Try again.' : errorText(e)));
      err.hidden = false;
    } finally { btn.disabled = false; note.hidden = true; }
  });
  const forgot = el('button', { class: 'link-btn', type: 'button', text: 'Forgot your passphrase? Use your recovery code', onclick: () => recoveryScreen() });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'Admin · Willy only' }), el('h1', { text: 'Unlock Publish' }), connectionNotice(), form,
    el('p', {}, forgot),
    el('p', { class: 'hint', text: 'Your passphrase never leaves this device.' })));
  p.input.focus();
}

function tokenScreen(passphrase, message) {
  const t = passField('tk', 'GitHub access token', { hint: 'Fine-grained token for ' + SITE.owner + '/' + SITE.repo + ' with Contents: Read and write. It is saved in the library, encrypted.' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Connect GitHub' });
  const form = el('form', { class: 'stack-lg', novalidate: true }, message ? alertBox('info', message) : null, t.node, err, btn);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    btn.disabled = true; err.hidden = true;
    try { await checkToken(t.input.value.trim()); await afterToken(passphrase, repo.token); }
    catch (e) { err.replaceChildren(alertBox('error', errorText(e))); err.hidden = false; }
    finally { btn.disabled = false; }
  });
  root.replaceChildren(el('div', { class: 'center-page' }, el('div', { class: 'eyebrow', text: 'This device' }), el('h1', { text: 'Connect GitHub' }), form));
}

async function afterToken(passphrase, newToken) {
  const b = busy('Loading the library…');
  try {
    await repo.info();
    // Re-read the admin state straight from GitHub so it is never stale.
    knownHead = await repo.head();
    const fresh = await repo.readJSON(ADMIN_PATH, knownHead);
    if (fresh && fresh.state.data !== adminFile.state.data) {
      let opened;
      try { opened = { state: await V.decryptJSON(kek, fresh.state, 'admin-state'), kek }; }
      catch (e) { opened = await V.openAdmin(fresh, passphrase); }
      state = opened.state; kek = opened.kek; adminFile = fresh;
    }
    await loadIndexes();
    if (newToken) {
      b.set('Saving the token, encrypted, to the library…');
      const snapshot = JSON.stringify(state);
      try { setToken(newToken); await save([]); }
      catch (e) { state = JSON.parse(snapshot); repo.token = newToken; flash('error', 'The token works, but it could not be saved yet, so you will be asked again next time. ' + errorText(e)); }
    }
  } finally { b.done(); }
  startIdleLock();
  if (!recoveryInfo()) return upgradeScreen(passphrase);
  mainScreen();
}

// Libraries made before version 1.3.0 have no recovery code yet. Add one now.
function upgradeScreen(passphrase) {
  document.getElementById('admin-tools').hidden = true;
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'button', text: 'Create my recovery code' });
  btn.addEventListener('click', async () => {
    btn.disabled = true; err.hidden = true;
    const b = busy('Creating your recovery code…');
    try {
      const rc = V.generateRecoveryCode();
      // A new master key; the state is the same. Nothing counts until GitHub accepts the commit.
      const sealed = await V.sealAdmin(state, passphrase, rc);
      b.set('Saving to GitHub…');
      await commitAdmin(sealed.file, [], 'Add admin recovery code (encrypted)');
      kek = sealed.kek;
      b.done();
      await showRecoveryCode(rc);
      flash('ok', 'Your recovery code is saved. You can make a new one at any time in Settings.');
      mainScreen();
    } catch (e) {
      b.done(); btn.disabled = false;
      err.replaceChildren(alertBox('error', 'Nothing was changed. ' + errorText(e))); err.hidden = false;
    }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'One more step' }), el('h1', { text: 'Create a recovery code' }),
    el('p', { class: 'muted', text: 'A recovery code lets you choose a new admin passphrase if you ever forget it. It is created once, shown once, and saved in the library encrypted — just like your passphrase, it is never stored anywhere readable.' }),
    err, btn,
    el('p', {}, el('button', { class: 'link-btn', type: 'button', text: 'Not now', onclick: () => { flash('info', 'You have no recovery code yet. Create one in Settings.'); mainScreen(); } }))));
}

// Forgot the passphrase: recovery code → new passphrase → one commit.
function recoveryScreen() {
  const code = passField('rc', 'Recovery code', { hint: 'The code of 24 characters you wrote down, like K7QF-9MXA-2PLD-8RTE-HW3N-4JCB. Capitals and dashes don’t matter.' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Check the code' });
  const note = el('div', { class: 'progress-note', hidden: true }, el('div', { class: 'spinner' }), 'Checking…');
  const form = el('form', { class: 'stack-lg', novalidate: true }, code.node, err, btn, note);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    err.hidden = true; btn.disabled = true; note.hidden = false;
    try {
      const opened = await V.openAdminWithRecovery(adminFile, code.input.value);
      newPassphraseScreen(opened);
    } catch (e) {
      const t = e.message === 'wrong-code' ? 'That recovery code is not right. Check it and try again.'
        : e.message === 'no-recovery' ? 'This library has no recovery code yet. Recovery codes are created when you unlock Publish with version 1.3.0 or later.'
        : errorText(e);
      err.replaceChildren(alertBox('error', t)); err.hidden = false;
    } finally { btn.disabled = false; note.hidden = true; }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'Admin · Willy only' }), el('h1', { text: 'Recover Publish' }), connectionNotice(), form,
    el('p', {}, el('button', { class: 'link-btn', type: 'button', text: '← Back to the passphrase', onclick: () => unlockScreen() }))));
  code.input.focus();
}

function newPassphraseScreen(opened) {
  const needToken = !(opened.state.github && opened.state.github.token);
  const t = needToken ? passField('tk3', 'GitHub access token', { hint: 'No working token is saved in the library. Paste one; it is saved with the new passphrase.' }) : null;
  const p1 = passField('np1', 'New admin passphrase', { autocomplete: 'new-password', hint: 'At least 14 characters. Four or five random words work well.' });
  const p2 = passField('np2', 'Repeat the new admin passphrase', { autocomplete: 'new-password' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Save the new passphrase' });
  const form = el('form', { class: 'stack-lg', novalidate: true }, alertBox('ok', 'The recovery code is correct. Choose a new admin passphrase.'), t ? t.node : null, p1.node, p2.node, err, btn);
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fail = x => { err.replaceChildren(alertBox('error', x)); err.hidden = false; };
    err.hidden = true;
    if (p1.input.value.length < 14) return fail('The new passphrase must be at least 14 characters.');
    if (p1.input.value !== p2.input.value) return fail('The two passphrases don’t match.');
    if (t && !t.input.value.trim()) return fail('Please paste your GitHub access token.');
    btn.disabled = true;
    const b = busy('Connecting to GitHub…');
    state = clone(opened.state); kek = opened.kek;
    try {
      if (t) { await checkToken(t.input.value.trim()); setToken(repo.token); }
      else {
        repo.token = state.github.token;
        try { await repo.info(); }
        catch (e) { if (e.status === 401) { b.done(); btn.disabled = false; opened.state.github = null; return newPassphraseScreen(opened); } throw e; }
      }
      b.set('Locking the library with the new passphrase…');
      const pass = p1.input.value;
      // Your own sign-in to the Library uses the admin passphrase too, so re-lock it as well.
      for (const r of state.readers) if (r.admin) r.lock = await V.wrapReaderKey(r, pass);
      let next = await V.relockPassphrase(adminFile, kek, pass);
      next = await V.resealAdmin(next, kek, state);
      b.set('Saving to GitHub…');
      knownHead = null;
      await commitAdmin(next, [], 'New admin passphrase (encrypted)');
      b.done();
      flash('ok', 'Your new admin passphrase is saved. Use it from now on, here and on the Library page. Your recovery code still works; you can make a new one in Settings.');
      await afterToken(pass);
    } catch (e) {
      b.done(); btn.disabled = false;
      state = null; kek = null;
      fail('Nothing was changed. ' + errorText(e));
    }
  });
  root.replaceChildren(el('div', { class: 'center-page' },
    el('div', { class: 'eyebrow', text: 'Recover Publish' }), el('h1', { text: 'Choose a new passphrase' }), form));
  (t ? t.input : p1.input).focus();
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
// A document is either "By invitation" (encrypted in vault/) or "Public" (plain in guides/).
function publicDocs(slug) { return (publicIndex.apps[slug] && publicIndex.apps[slug].docs) || []; }
function allDocs(slug) {
  const priv = (indexes[slug] ? indexes[slug].docs : []).map(d => ({ ...d, public: false }));
  const pub = publicDocs(slug).map(d => ({ ...d, public: true }));
  return [...pub, ...priv].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function takenPaths() {
  const s = new Set();
  for (const a of Object.values(publicIndex.apps)) for (const d of a.docs) s.add(d.path);
  return s;
}
function publicIndexChange(pi) { return { path: V.PUBLIC_INDEX, bytes: JSON.stringify(pi, null, 1) }; }
function withPublicApp(pi, slug, name) {
  if (!pi.apps[slug]) pi.apps[slug] = { name, docs: [] };
  pi.apps[slug].name = name;
  return pi.apps[slug];
}

// Segmented switch: Public | By invitation
function visibilitySwitch(isPublic, onPublic, onPrivate, label) {
  return el('div', { class: 'switch', role: 'group', 'aria-label': 'Who can read ' + label },
    el('button', { type: 'button', class: 'switch-opt', 'aria-pressed': String(isPublic), onclick: () => { if (!isPublic) onPublic(); } }, icon('globe'), 'Public'),
    el('button', { type: 'button', class: 'switch-opt', 'aria-pressed': String(!isPublic), onclick: () => { if (isPublic) onPrivate(); } }, icon('lock'), 'By invitation'));
}

const PUBLIC_WARNING = 'Anyone will be able to read it, without signing in. Switching it back later removes it from the site, but copies stay in GitHub’s history and with anyone who downloaded it.';

function docsTab() {
  const apps = knownApps();
  const picker = el('div', { class: 'panel app-picker' },
    apps.map(a => {
      const n = allDocs(a.slug).length;
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
    for (const f of files) ui.pending.push({ file: f, title: V.titleFromFilename(f.name, name), public: false });
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
          visibilitySwitch(p.public, () => { p.public = true; mainScreen(); }, () => { p.public = false; mainScreen(); }, p.file.name),
          el('button', { class: 'btn btn-ghost icon-btn', type: 'button', 'aria-label': 'Remove ' + p.file.name, onclick: () => { ui.pending.splice(i, 1); mainScreen(); } }, icon('close')));
      }),
      el('div', { class: 'list-foot hint', text: 'New documents start as By invitation. Switch to Public only for documents anyone may keep, such as user guides.' }));
  }
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: '2 · Add documents to ' + appName }), input, drop, list);
}

function publishSection(current) {
  const n = ui.pending.length;
  const pubN = ui.pending.filter(p => p.public).length;
  const btn = el('button', { class: 'btn btn-block', type: 'button', disabled: !n,
    text: n ? `Publish ${n} document${n === 1 ? '' : 's'}` : 'Choose documents first', onclick: () => publish(current) });
  const step = (t, i) => el('div', { class: 'step' }, el('i', { text: String(i) }), t);
  const summary = n ? (pubN === 0 ? `All ${n} will be encrypted, for invited readers only.` :
    pubN === n ? `All ${n} will be public — readable by anyone.` : `${n - pubN} encrypted for invited readers · ${pubN} public.`) : '';
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: '3 · Publish' }),
    el('div', { class: 'panel publish-box' },
      el('div', { class: 'steps' }, step('Encrypt on this device', 1), step('Upload to GitHub', 2), step('Update the lists', 3)),
      summary ? el('div', { class: 'alert ' + (pubN ? 'info' : 'ok'), text: summary }) : null,
      btn,
      el('div', { class: 'hint', text: 'By-invitation documents are encrypted on this device before upload. Public documents are uploaded as they are.' })));
}

function publishedSection(current) {
  if (!current) return null;
  const docs = allDocs(current.slug);
  const list = docs.length ? el('div', { class: 'panel' }, docs.map(d => {
    const rep = el('input', { type: 'file', hidden: true });
    rep.addEventListener('change', () => { if (rep.files[0]) replaceDoc(current, d, rep.files[0]); });
    return el('div', { class: 'doc-row admin-doc' },
      el('span', { class: 'type' + (d.ext === 'pdf' ? ' pdf' : ''), text: (d.ext || 'file').toUpperCase().slice(0, 4) }),
      el('div', { class: 'grow' }, el('div', { class: 'title', text: d.title }),
        el('div', { class: 'meta', text: 'Published ' + formatDate(d.date) + ' · ' + formatSize(d.size || 0) + (d.original ? ' · ' + d.original : '') })),
      visibilitySwitch(d.public, () => makePublic(current, d), () => makePrivate(current, d), d.title),
      el('div', { class: 'doc-actions' }, rep,
        el('button', { class: 'btn btn-ghost btn-small', type: 'button', text: 'Replace', 'aria-label': 'Replace ' + d.title, onclick: () => rep.click() }),
        el('button', { class: 'btn btn-danger btn-small', type: 'button', text: 'Remove', 'aria-label': 'Remove ' + d.title, onclick: () => removeDoc(current, d) })));
  })) : el('div', { class: 'empty', text: 'Nothing published for this app yet.' });
  return el('div', { class: 'stack' }, el('div', { class: 'step-title', text: 'Already published in ' + current.name }), list);
}

async function ensureApp(current) {
  if (current) {
    if (!state.apps[current.slug]) state.apps[current.slug] = { name: current.name, key: V.newKeyB64(), created: new Date().toISOString() };
    return current.slug;
  }
  const name = ui.newApp.trim();
  if (!name) throw new Error('Please type a name for the new app first.');
  const slug = V.slugify(name);
  if (!state.apps[slug]) state.apps[slug] = { name, key: V.newKeyB64(), created: new Date().toISOString() };
  return slug;
}

// Every change below is one GitHub commit. Local lists are updated only after
// GitHub confirms it; on any failure everything is rolled back and nothing changes.
async function publish(current) {
  if (!ui.pending.length) return;
  const pubN = ui.pending.filter(p => p.public).length;
  if (pubN) {
    const ok = await confirmBox({ title: pubN === 1 ? 'Publish 1 document as public?' : `Publish ${pubN} documents as public?`,
      text: PUBLIC_WARNING, yes: 'Yes, publish', no: 'No, go back', danger: false });
    if (!ok) return;
  }
  const snapshot = JSON.stringify(state);
  const b = busy('Preparing…');
  try {
    const slug = await ensureApp(current);
    const app = state.apps[slug];
    const index = indexes[slug] ? clone(indexes[slug]) : { v: 1, app: { slug, name: app.name }, docs: [] };
    const pi = clone(publicIndex);
    const taken = takenPaths();
    const changes = [];
    let i = 0, priv = 0;
    for (const p of ui.pending) {
      i++; b.set(`${p.public ? 'Preparing' : 'Encrypting'} ${i} of ${ui.pending.length}: ${p.title}`);
      const bytes = new Uint8Array(await p.file.arrayBuffer());
      const id = V.randomId();
      const kind = V.fileKind(p.file.name);
      const meta = { id, title: (p.title || '').trim() || V.titleFromFilename(p.file.name, app.name), ext: kind.ext, mime: kind.mime,
        size: bytes.length, date: new Date().toISOString(), original: p.file.name };
      if (p.public) {
        meta.path = V.publicPath(slug, meta.title, kind.ext, taken); taken.add(meta.path);
        changes.push({ path: meta.path, bytes });
        withPublicApp(pi, slug, app.name).docs.push(meta);
      } else {
        priv++;
        changes.push({ path: V.docPath(slug, id), bytes: await V.encryptDoc(app.key, slug, id, bytes) });
        index.docs.push(meta);
      }
    }
    if (priv) changes.push({ path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) });
    if (pubN) changes.push(publicIndexChange(pi));
    b.set('Uploading to GitHub…');
    await save(changes, (done, total) => b.set(`Uploading to GitHub… ${done} of ${total}`));
    indexes[slug] = index; publicIndex = pi;
    const n = ui.pending.length;
    ui.pending = []; ui.app = slug; ui.newApp = '';
    b.done();
    flash('ok', `Published ${n} document${n === 1 ? '' : 's'} to ${app.name}. ${n === 1 ? 'It appears' : 'They appear'} on the site within a minute or two, once GitHub Pages refreshes.`);
    mainScreen();
  } catch (e) {
    state = JSON.parse(snapshot);
    b.done(); flash('error', 'Nothing was published. ' + errorText(e)); mainScreen();
  }
}

async function makePublic(current, d) {
  const ok = await confirmBox({ title: 'Make this document public?', text: `“${d.title}” — ${PUBLIC_WARNING}`, yes: 'Yes, make it public', no: 'No, keep it private', danger: false });
  if (!ok) return;
  const slug = current.slug, app = state.apps[slug];
  const b = busy('Making it public…');
  try {
    const data = await repo.read(V.docPath(slug, d.id), knownHead);
    if (!data) throw new Error('the encrypted file could not be found');
    const plain = await V.decryptDoc(app.key, slug, d.id, data);
    const index = clone(indexes[slug]);
    index.docs = index.docs.filter(x => x.id !== d.id);
    const pi = clone(publicIndex);
    const { public: _p, ...meta } = d;
    meta.path = V.publicPath(slug, d.title, d.ext, takenPaths());
    withPublicApp(pi, slug, app.name).docs.push(meta);
    await save([{ path: meta.path, bytes: plain }, { path: V.docPath(slug, d.id), bytes: null },
      { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }, publicIndexChange(pi)]);
    indexes[slug] = index; publicIndex = pi;
    b.done(); flash('ok', `“${d.title}” is now public.`); mainScreen();
  } catch (e) { b.done(); flash('error', 'Nothing was changed. ' + errorText(e)); mainScreen(); }
}

async function makePrivate(current, d) {
  const slug = current.slug;
  const snapshot = JSON.stringify(state);
  const b = busy('Encrypting it for invited readers…');
  try {
    await ensureApp(current);
    const app = state.apps[slug];
    const plain = await repo.read(d.path, knownHead);
    if (!plain) throw new Error('the public file could not be found');
    const id = V.randomId();
    const index = indexes[slug] ? clone(indexes[slug]) : { v: 1, app: { slug, name: app.name }, docs: [] };
    const { public: _p, path: _path, ...meta } = d;
    meta.id = id;
    index.docs.push(meta);
    const pi = clone(publicIndex);
    pi.apps[slug].docs = pi.apps[slug].docs.filter(x => x.id !== d.id);
    if (!pi.apps[slug].docs.length) delete pi.apps[slug];
    await save([{ path: V.docPath(slug, id), bytes: await V.encryptDoc(app.key, slug, id, plain) }, { path: d.path, bytes: null },
      { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }, publicIndexChange(pi)]);
    indexes[slug] = index; publicIndex = pi;
    b.done(); flash('ok', `“${d.title}” is now for invited readers only. Copies made while it was public cannot be recalled.`); mainScreen();
  } catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', 'Nothing was changed. ' + errorText(e)); mainScreen(); }
}

async function removeDoc(current, d) {
  const ok = await confirmBox({ title: 'Remove this document?', text: `“${d.title}” will be removed from the site for everyone.`, yes: 'Yes, remove it' });
  if (!ok) return;
  const slug = current.slug, app = state.apps[slug];
  const b = busy('Removing…');
  try {
    if (d.public) {
      const pi = clone(publicIndex);
      pi.apps[slug].docs = pi.apps[slug].docs.filter(x => x.id !== d.id);
      if (!pi.apps[slug].docs.length) delete pi.apps[slug];
      await save([{ path: d.path, bytes: null }, publicIndexChange(pi)]);
      publicIndex = pi;
    } else {
      const index = clone(indexes[slug]);
      index.docs = index.docs.filter(x => x.id !== d.id);
      await save([{ path: V.docPath(slug, d.id), bytes: null }, { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }]);
      indexes[slug] = index;
    }
    b.done(); flash('ok', `Removed “${d.title}”.`); mainScreen();
  } catch (e) { b.done(); flash('error', 'Nothing was removed. ' + errorText(e)); mainScreen(); }
}

async function replaceDoc(current, d, file) {
  const ok = await confirmBox({ title: 'Replace this document?', text: `“${d.title}” will be replaced by ${file.name}. The title and who can read it stay the same.`, yes: 'Yes, replace it', danger: false });
  if (!ok) return;
  const slug = current.slug, app = state.apps[slug];
  const b = busy('Preparing the new version…');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = V.fileKind(file.name);
    const upd = { ext: kind.ext, mime: kind.mime, size: bytes.length, date: new Date().toISOString(), original: file.name };
    if (d.public) {
      const pi = clone(publicIndex);
      const entry = pi.apps[slug].docs.find(x => x.id === d.id);
      const changes = [];
      let path = d.path;
      if (kind.ext !== d.ext) { path = V.publicPath(slug, d.title, kind.ext, takenPaths()); changes.push({ path: d.path, bytes: null }); }
      Object.assign(entry, upd, { path });
      changes.unshift({ path, bytes });
      changes.push(publicIndexChange(pi));
      b.set('Uploading to GitHub…');
      await save(changes);
      publicIndex = pi;
    } else {
      const id = V.randomId();
      const index = clone(indexes[slug]);
      Object.assign(index.docs.find(x => x.id === d.id), upd, { id });
      b.set('Uploading to GitHub…');
      await save([{ path: V.docPath(slug, id), bytes: await V.encryptDoc(app.key, slug, id, bytes) },
        { path: V.docPath(slug, d.id), bytes: null },
        { path: V.indexPath(slug), bytes: JSON.stringify(await V.encryptIndex(app.key, slug, index)) }]);
      indexes[slug] = index;
    }
    b.done(); flash('ok', `Replaced “${d.title}”.`); mainScreen();
  } catch (e) { b.done(); flash('error', 'Nothing was replaced. ' + errorText(e)); mainScreen(); }
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
      const index = clone(indexes[slug] || { v: 1, app: { slug, name: state.apps[slug].name }, docs: [] });
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
      el('p', { class: 'muted', text: 'The access token is kept inside the library, encrypted with your admin passphrase. Every device and web address finds it after you unlock. Nothing is stored in the browser.' }),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Replace the token', onclick: () => tokenScreenFromMain() }),
        el('button', { class: 'btn btn-danger', type: 'button', text: 'Remove the saved token', onclick: async () => {
          if (!(await confirmBox({ title: 'Remove the saved token?', text: 'You will need to paste a token the next time you unlock Publish, on any device.', yes: 'Yes, remove it' }))) return;
          const snapshot = JSON.stringify(state);
          const b = busy('Removing the token…');
          try { delete state.github; await save([]); b.done(); location.reload(); }
          catch (e) { state = JSON.parse(snapshot); b.done(); flash('error', 'Nothing was changed. ' + errorText(e)); mainScreen(); }
        } }))),
    el('div', { class: 'panel form-box' },
      el('div', { class: 'step-title', text: 'Admin passphrase' }),
      el('p', { class: 'muted', text: 'Used to unlock Publish and to sign in to the Library.' }),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', type: 'button', text: 'Change the admin passphrase', onclick: () => changePassphraseScreen() }))),
    el('div', { class: 'panel form-box' },
      el('div', { class: 'step-title', text: 'Recovery code' }),
      recoveryInfo()
        ? el('p', {}, 'You have a recovery code, made ', el('b', { text: formatDate(recoveryInfo().created) }), '. If you forget your passphrase, use it on the unlock page.')
        : alertBox('info', 'You have no recovery code yet. Without one, a forgotten passphrase cannot be recovered.'),
      el('div', { class: 'dialog-actions' },
        el('button', { class: 'btn ' + (recoveryInfo() ? 'btn-ghost' : ''), type: 'button', text: recoveryInfo() ? 'Make a new recovery code' : 'Create my recovery code', onclick: () => newRecoveryCode() }))),
    el('div', { class: 'panel form-box' },
      el('div', { class: 'step-title', text: 'Security' }),
      el('p', { class: 'muted', text: 'Publish locks itself after ' + SITE.lockMinutes + ' minutes without use.' })));
}

// Settings → Change the admin passphrase (asks for the current one first).
function changePassphraseScreen() {
  document.getElementById('admin-tools').hidden = true;
  const cur = passField('cp0', 'Current admin passphrase', { autocomplete: 'current-password' });
  const p1 = passField('cp1', 'New admin passphrase', { autocomplete: 'new-password', hint: 'At least 14 characters.' });
  const p2 = passField('cp2', 'Repeat the new admin passphrase', { autocomplete: 'new-password' });
  const err = el('div', { hidden: true });
  const btn = el('button', { class: 'btn btn-block', type: 'submit', text: 'Save the new passphrase' });
  const form = el('form', { class: 'stack-lg', novalidate: true }, cur.node, p1.node, p2.node, err, btn,
    el('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Cancel', onclick: () => mainScreen() }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fail = x => { err.replaceChildren(alertBox('error', x)); err.hidden = false; };
    err.hidden = true;
    if (p1.input.value.length < 14) return fail('The new passphrase must be at least 14 characters.');
    if (p1.input.value !== p2.input.value) return fail('The two new passphrases don’t match.');
    btn.disabled = true;
    const b = busy('Checking your current passphrase…');
    const snapshot = JSON.stringify(state);
    try {
      try { await V.openAdmin(adminFile, cur.input.value); }
      catch (e) { b.done(); btn.disabled = false; return fail('The current passphrase is not right.'); }
      b.set('Locking the library with the new passphrase…');
      const pass = p1.input.value;
      for (const r of state.readers) if (r.admin) r.lock = await V.wrapReaderKey(r, pass);
      let next = adminFile.v === 2 ? await V.relockPassphrase(adminFile, kek, pass) : null;
      if (!next) throw new Error('Create a recovery code first, then change the passphrase.');
      next = await V.resealAdmin(next, kek, state);
      b.set('Saving to GitHub…');
      await commitAdmin(next, [], 'New admin passphrase (encrypted)');
      b.done();
      flash('ok', 'Your new admin passphrase is saved. Use it from now on, here and on the Library page.');
      mainScreen();
    } catch (e) { state = JSON.parse(snapshot); b.done(); btn.disabled = false; fail('Nothing was changed. ' + errorText(e)); }
  });
  root.replaceChildren(el('div', { class: 'center-page' }, el('h1', { text: 'Change the admin passphrase' }), form));
  cur.input.focus();
}

// Settings → Make a new recovery code (the old one stops working).
async function newRecoveryCode() {
  if (recoveryInfo() && !(await confirmBox({ title: 'Make a new recovery code?', text: 'Your current recovery code will stop working. The new one is shown once.', yes: 'Yes, make a new one', no: 'No, keep the current one', danger: false }))) return;
  if (!recoveryInfo()) return adminPassphrasePrompt();
  const b = busy('Creating a new recovery code…');
  try {
    const rc = V.generateRecoveryCode();
    const next = await V.relockRecovery(adminFile, kek, rc);
    b.set('Saving to GitHub…');
    await commitAdmin(next, [], 'New admin recovery code (encrypted)');
    b.done();
    await showRecoveryCode(rc, 'replaced');
    flash('ok', 'Your new recovery code is saved. The old one no longer works.');
  } catch (e) { b.done(); flash('error', 'Nothing was changed. ' + errorText(e)); }
  mainScreen();
}
// Older library without a recovery code: needs the passphrase once to add it.
function adminPassphrasePrompt() {
  document.getElementById('admin-tools').hidden = true;
  const cur = passField('up0', 'Admin passphrase', { autocomplete: 'current-password' });
  const err = el('div', { hidden: true });
  const form = el('form', { class: 'stack-lg', novalidate: true },
    el('p', { class: 'muted', text: 'Type your admin passphrase once to create your recovery code.' }), cur.node, err,
    el('button', { class: 'btn btn-block', type: 'submit', text: 'Continue' }),
    el('button', { class: 'btn btn-ghost btn-block', type: 'button', text: 'Cancel', onclick: () => mainScreen() }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = busy('Checking your passphrase…');
    try { await V.openAdmin(adminFile, cur.input.value); b.done(); upgradeScreen(cur.input.value); }
    catch (e) { b.done(); err.replaceChildren(alertBox('error', 'That passphrase is not right.')); err.hidden = false; }
  });
  root.replaceChildren(el('div', { class: 'center-page' }, el('h1', { text: 'Create a recovery code' }), form));
  cur.input.focus();
}
function tokenScreenFromMain() {
  document.getElementById('admin-tools').hidden = true;
  const t = passField('tk2', 'New GitHub access token');
  const err = el('div', { hidden: true });
  const form = el('form', { class: 'stack-lg', novalidate: true }, t.node, err, el('button', { class: 'btn btn-block', type: 'submit', text: 'Save the new token' }));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const snapshot = JSON.stringify(state);
    const oldToken = repo.token;
    try { await checkToken(t.input.value.trim()); setToken(repo.token); await save([]); flash('ok', 'New token saved, encrypted, in the library.'); mainScreen(); }
    catch (e) { state = JSON.parse(snapshot); repo.token = oldToken; err.replaceChildren(alertBox('error', 'Nothing was changed. ' + errorText(e))); err.hidden = false; }
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
