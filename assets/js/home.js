import { init, el, icon } from './common.js';
init();

async function loadApps() {
  const box = document.getElementById('app-list');
  try {
    const res = await fetch('assets/data/apps.json', { cache: 'no-cache' });
    const data = await res.json();
    const av = data.availability || {};
    box.replaceChildren(...data.apps.map(a => el('div', { class: 'app-row' },
      icon(a.icon),
      el('div', {},
        el('h3', { text: a.name }),
        el('p', { text: a.description }),
        el('div', { class: 'avail' }, (av.now || 'Web app now') + ' · ', el('span', { text: av.soon || 'iOS & Android soon' }))),
      el('a', { class: 'docs', href: 'library.html#' + a.slug, 'aria-label': 'Documentation for ' + a.name, text: 'Docs →' }))));
  } catch (e) {
    box.replaceChildren(el('p', { class: 'muted', text: 'The app list could not be loaded. Please refresh the page.' }));
  }
}
loadApps();
