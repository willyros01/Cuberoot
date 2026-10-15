import { init, el, icon } from './common.js?v=1.3.0';
init();

// Show a same-origin Android download only after the APK is actually hosted.
// This avoids exposing repository URLs or advertising an unavailable file.
// Fairpot's published App Store Connect ID; use Apple's official, unmodified badge.
function addFairpotAppStore(box) {
  const row=[...box.querySelectorAll('.app-row')].find(node =>
    node.querySelector('h3')?.textContent === 'Fairpot');
  const details=row?.querySelector('h3')?.parentElement;
  if(!details)return;
  const actions=details.querySelector('.actions') ||
    details.appendChild(el('div',{class:'actions fairpot-store-actions'}));
  actions.appendChild(el('a',{
    class:'app-store-badge',
    href:'https://apps.apple.com/app/id6816560336',
    target:'_blank',
    rel:'noopener noreferrer',
    'aria-label':'Download Fairpot on the Apple App Store'
  },el('img',{
    src:'assets/img/app-store-badge.svg',
    alt:'Download on the App Store',
    width:'165',height:'55',loading:'lazy'
  })));
}

async function addFairpotDownload(box) {
  const base = 'downloads/fairpot.apk';
  try {
    const metaRes = await fetch('downloads/fairpot-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (!Number.isSafeInteger(meta.run_id) || meta.run_id < 1) return;
    // A distinct URL and filename for each build stops Fire/Silk from
    // reusing an older cached generic-icon APK.
    const url = base + '?build=' + meta.run_id;
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok) return;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'Fairpot');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    const actions=details.querySelector('.actions') || details.appendChild(el('div',{class:'actions fairpot-store-actions'}));
    actions.appendChild(el('a', { class: 'btn app-open android-apk-badge', href: url, download: 'fairpot-' + meta.run_id + '.apk',
        'aria-label': 'Download Fairpot Android APK' },
      el('span', { class: 'apk-small', text: 'Download' }),
      el('span', { class: 'apk-large', text: 'Android APK' }) ));
  } catch (_) {
    // Absence of a release is expected; do not show a broken link.
  }
}


async function addCloudFilesDownload(box) {
  try {
    const metaRes = await fetch('downloads/cloud-files-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (!Number.isSafeInteger(meta.run_id) || meta.run_id < 1) return;
    const url = 'downloads/cloud-files.apk?build=' + meta.run_id;
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'Cloud Files');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    details.appendChild(el('div', { class: 'actions' },
      el('a', { class: 'btn app-open android-apk-badge', href: url, download: 'cloud-files-' + meta.run_id + '.apk',
        'aria-label': 'Download Cloud Files Android APK' },
        el('span', { class: 'apk-small', text: 'Download' }),
        el('span', { class: 'apk-large', text: 'Android APK' }) )));
  } catch (_) {
    // The download button appears only when the exact APK has been published.
  }
}

async function addScorecardDownload(box) {
  try {
    const metaRes = await fetch('downloads/scorecard-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (!Number.isSafeInteger(meta.run_id) || meta.run_id < 1) return;
    const url = 'downloads/scorecard.apk?build=' + meta.run_id;
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'The Scorecard');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    details.appendChild(el('div', { class: 'actions' },
      el('a', { class: 'btn app-open android-apk-badge', href: url, download: 'scorecard-' + meta.run_id + '.apk',
        'aria-label': 'Download The Scorecard Android APK' },
        el('span', { class: 'apk-small', text: 'Download' }),
        el('span', { class: 'apk-large', text: 'Android APK' }) )));
  } catch (_) {
    // The download button appears only when the exact APK has been published.
  }
}


// Show SpendRecorder only when Cuberoot actually hosts the verified APK.
async function addSpendRecorderDownload(box) {
  try {
    const metaRes = await fetch('downloads/spendrecorder-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (!Number.isSafeInteger(meta.run_id) || meta.run_id < 1 || !meta.apk_sha256 || !meta.signer_sha256) return;
    const url = 'downloads/spendrecorder.apk?build=' + meta.run_id;
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!head.ok) return;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'SpendRecorder');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    details.appendChild(el('div', { class: 'actions' },
      el('a', { class: 'btn app-open android-apk-badge', href: url, download: 'spendrecorder-' + meta.run_id + '.apk',
        'aria-label': 'Download SpendRecorder Android APK' },
        el('span', { class: 'apk-small', text: 'Download' }),
        el('span', { class: 'apk-large', text: 'Android APK' }) )));
    const avail = row.querySelector('.avail');
    if (avail) avail.textContent = 'Signed Android test APK available · iOS TestFlight';
  } catch (_) {
    // Do not show a broken download or advertise an unpublished APK.
  }
}

// Show verified Wire Android APK only after matching Cuberoot metadata.
// Fire HD 8 ADM notifications and in-app Back routing confirmed working on the latest build.
async function addWireDownload(box) {
  try {
    const metaRes = await fetch('downloads/wire-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (!Number.isSafeInteger(meta.run_id) || meta.run_id < 1 ||
        !meta.apk_sha256 || !meta.signer_sha256 ||
        meta.channel !== 'android-adm-fcm-beta') return;
    const url = 'downloads/wire.apk?build=' + meta.run_id;
    const check = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!check.ok) return;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'Wire');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    details.appendChild(el('div', { class: 'actions' },
      el('a', { class: 'btn app-open android-apk-badge', href: url,
        download: 'wire-' + meta.run_id + '.apk',
        'aria-label': 'Download Wire Android APK with Amazon ADM and Google FCM support' },
        el('span', { class: 'apk-small', text: 'Download' }),
        el('span', { class: 'apk-large', text: 'Android APK' }) )));
    const avail = row.querySelector('.avail');
    if (avail) avail.textContent = 'Android APK available · Amazon Fire ADM and Google FCM support';
  } catch (_) {
    // Never advertise or link an unpublished Wire release.
  }
}


// FIDUNIO Android APK is offered ONLY when the independently verified
// same-origin signed artifact and its release manifest have been published.
async function addFidunioDownload(box) {
  try {
    const metaRes = await fetch('downloads/fidunio-build.json', { cache: 'no-store' });
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    if (meta.app !== 'FIDUNIO' || meta.channel !== 'android-fcm-beta' ||
        meta.origin !== 'github-actions-artifact' ||
        !Number.isSafeInteger(meta.run_id) || meta.run_id < 1 ||
        !/^[a-f0-9]{64}$/.test(meta.apk_sha256 || '') ||
        !/^[a-f0-9]{64}$/.test(meta.signer_sha256 || '') ||
        !/^[a-f0-9]{40}$/.test(meta.source_sha || '') ||
        !Number.isSafeInteger(meta.artifact_id) || meta.artifact_id < 1 ||
        !Number.isSafeInteger(meta.apk_bytes) || meta.apk_bytes < 1000000) return;
    // The publisher writes APK, checksum and manifest in one verified commit.
    // Safari/Fire Silk HEAD requests can fail despite a valid published APK.
    // Require the authenticated published manifest, but do not hide a verified
    // download solely because the browser rejected a redundant HEAD request.
    const url = 'downloads/fidunio.apk?build=' + meta.run_id;
    const row = [...box.querySelectorAll('.app-row')].find(node =>
      node.querySelector('h3')?.textContent === 'FIDUNIO');
    if (!row) return;
    const details = row.querySelector('h3')?.parentElement;
    if (!details) return;
    details.appendChild(el('div', { class: 'actions' },
      el('a', { class: 'btn app-open android-apk-badge', href: url,
        download: 'fidunio-' + meta.run_id + '.apk',
        'aria-label': 'Download signed FIDUNIO Android APK' },
        el('span', { class: 'apk-small', text: 'Download' }),
        el('span', { class: 'apk-large', text: 'Android APK' }) )));
    const avail = row.querySelector('.avail');
    if (avail) avail.textContent = 'Web app · iPhone TestFlight · Signed Android APK available';
  } catch (_) {
    // Never advertise an absent or unverified FIDUNIO APK.
  }
}

async function loadApps() {
  const box = document.getElementById('app-list');
  try {
    const res = await fetch('assets/data/apps.json', { cache: 'no-store' });
    const data = await res.json();
    const av = data.availability || {};
    box.replaceChildren(...data.apps.map(a => el('div', { class: 'app-row' },
      icon(a.icon),
      el('div', {},
        el('h3', { text: a.name }),
        el('p', { text: a.description }),
        a.url ? el('div', { class: 'actions' },
          el('a', { class: 'btn app-open', href: a.url, 'aria-label': 'Open ' + a.name, text: 'Open ' + a.name + ' →' })) : null,
        el('div', { class: 'avail', text: a.availability || ((av.now || 'Web app now') + ' · ' + (av.soon || 'iOS & Android soon')) })),
      el('a', { class: 'docs', href: 'docs.html?app=' + encodeURIComponent(a.slug), 'aria-label': 'Documentation for ' + a.name, text: 'Docs →' }))));
    addFairpotAppStore(box);
    // Show FIDUNIO first; do not delay its link behind other APK checks.
    await addFidunioDownload(box);
    await addFairpotDownload(box);
    await addCloudFilesDownload(box);
    await addScorecardDownload(box);
    await addSpendRecorderDownload(box);
    await addWireDownload(box);
  } catch (e) {
    box.replaceChildren(el('p', { class: 'muted', text: 'The app list could not be loaded. Please refresh the page.' }));
  }
}
loadApps();
