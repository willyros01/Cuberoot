import { init, el, icon } from './common.js?v=1.3.0';
init();

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
        el('div', { class: 'avail', text: a.availability || ((av.now || 'Web app now') + ' · ' + (av.soon || 'iOS & Android soon')) })),
      el('a', { class: 'docs', href: 'docs.html?app=' + encodeURIComponent(a.slug), 'aria-label': 'Documentation for ' + a.name, text: 'Docs →' }))));
  } catch (e) {
    box.replaceChildren(el('p', { class: 'muted', text: 'The app list could not be loaded. Please refresh the page.' }));
  }
}
loadApps();
