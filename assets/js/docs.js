// Public documents page: docs.html?app=<slug>
// Shows only public documents. Everything else needs a sign-in to the library.
import { init, el, icon, formatDate } from './common.js?v=1.3.0';
import { PUBLIC_INDEX } from './vault.js?v=1.3.0';

init();
const root = document.getElementById('docs-root');

async function getJSON(path, fallback) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (res.status === 404) return fallback;
    if (!res.ok) throw new Error('status ' + res.status);
    return await res.json();
  } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

function badge() { return el('span', { class: 'badge public' }, icon('globe'), 'Public'); }

function docLink(slug, d) {
  return el('a', { class: 'doc-link', href: `view.html?app=${encodeURIComponent(slug)}&id=${encodeURIComponent(d.id)}` },
    el('span', { class: 'type' + (d.ext === 'pdf' ? ' pdf' : ''), text: (d.ext || 'file').toUpperCase().slice(0, 4) }),
    el('div', { class: 'grow' }, el('div', { class: 'title', text: d.title }), el('div', { class: 'meta', text: 'Updated ' + formatDate(d.date) })),
    badge(),
    el('span', { class: 'go', text: 'Open →' }));
}

function moreBox(slug, name) {
  return el('section', { class: 'more' },
    el('div', { class: 'inner' },
      el('div', { class: 'note-icon' }, icon('lock')),
      el('div', {}, el('b', { text: 'More documents for invited readers' }),
        el('span', { class: 'muted', text: `Code documentation, setup notes and more. Sign in to see all${name ? ' ' + name : ''} documents.` }))),
    el('a', { class: 'btn', href: 'library.html' + (slug ? '#' + encodeURIComponent(slug) : '') }, 'Sign in to see all documents'));
}

async function render() {
  let apps, pub;
  try {
    [apps, pub] = await Promise.all([getJSON('assets/data/apps.json', { apps: [] }), getJSON(PUBLIC_INDEX, { apps: {} })]);
  } catch (e) {
    root.replaceChildren(el('div', { class: 'appdocs-head' }, el('div', { class: 'alert error', text: 'The documents could not be loaded. Please refresh the page.' })));
    return;
  }
  const list = apps.apps || [];
  const pubApps = pub.apps || {};
  const slug = new URLSearchParams(location.search).get('app');
  const meta = list.find(a => a.slug === slug) || (pubApps[slug] ? { slug, name: pubApps[slug].name, icon: 'doc' } : null);

  if (!meta) {
    // No app chosen: list every app with its number of public documents.
    document.title = 'Documents — Cuberoot';
    const names = [...list.map(a => ({ slug: a.slug, name: a.name })),
      ...Object.keys(pubApps).filter(s => !list.find(a => a.slug === s)).map(s => ({ slug: s, name: pubApps[s].name }))];
    root.replaceChildren(
      el('div', { class: 'appdocs-head' }, el('a', { href: 'index.html#apps' }, el('b', { text: '← All apps' })),
        el('h1', { text: 'Documents' })),
      el('div', { class: 'all-apps' }, names.map(a => {
        const n = pubApps[a.slug] ? pubApps[a.slug].docs.length : 0;
        return el('a', { class: 'panel', href: 'docs.html?app=' + encodeURIComponent(a.slug) }, a.name, el('span', { text: n ? `${n} public` : 'Sign in to see' }));
      })),
      moreBox('', ''));
    return;
  }

  document.title = meta.name + ' documents — Cuberoot';
  const docs = (pubApps[meta.slug] ? pubApps[meta.slug].docs : []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  root.replaceChildren(
    el('div', { class: 'appdocs-head' },
      el('a', { href: 'index.html#apps' }, el('b', { text: '← All apps' })),
      el('div', { class: 'appdocs-title' },
        el('div', { class: 'appdocs-icon' }, icon(meta.icon || 'doc')),
        el('div', {}, el('div', { class: 'eyebrow', text: 'Documents' }), el('h1', { text: meta.name }))),
      meta.description ? el('p', { class: 'muted' }, meta.description + ' ', el('b', { text: 'Web app now · iOS & Android soon' })) : null),
    el('section', { class: 'stack' },
      el('div', { class: 'section-head' }, el('h2', { text: 'Public documents' }), el('span', { class: 'muted', text: 'Open to everyone — no sign-in needed' })),
      docs.length ? el('div', { class: 'panel' }, docs.map(d => docLink(meta.slug, d)))
        : el('div', { class: 'empty', text: 'No public documents yet.' })),
    moreBox(meta.slug, meta.name));
}

render();
