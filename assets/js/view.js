// Public document viewer: view.html?app=<slug>&id=<id>
// Shows every page of a PDF (with PDF.js, stored on this site) plus a large Back button.
import { hydrateIcons, el, icon, formatDate } from './common.js';
import { PUBLIC_INDEX } from './vault.js';

hydrateIcons();
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const slug = params.get('app') || '';
const id = params.get('id') || '';
const body = $('doc-body');

function message(title, text) {
  body.replaceChildren(el('div', { class: 'viewer-msg panel card white' }, el('h2', { text: title }), el('p', { text })));
}

async function main() {
  $('back').href = 'docs.html' + (slug ? '?app=' + encodeURIComponent(slug) : '');
  let index;
  try {
    const res = await fetch(PUBLIC_INDEX, { cache: 'no-cache' });
    index = res.ok ? await res.json() : { apps: {} };
  } catch (e) { index = { apps: {} }; }
  const app = (index.apps || {})[slug];
  const doc = app && app.docs.find(d => d.id === id);
  if (app) $('back').replaceChildren(icon('back'), 'Back to ' + app.name + ' documents');
  // Only files listed in the public index, inside guides/, are ever shown.
  if (!doc || !/^guides\/[a-z0-9-]+\/[a-z0-9.-]+$/.test(doc.path) || doc.path.includes('..')) {
    $('doc-title').textContent = 'Document not found';
    message('This document isn’t available', 'It may have been moved or made private. Use the Back button to see the documents that are available.');
    return;
  }
  document.title = doc.title + ' — Cuberoot';
  $('doc-title').textContent = doc.title;
  $('doc-meta').replaceChildren(el('span', { class: 'badge public' }, icon('globe'), 'Public'), el('span', { text: app.name + ' · Updated ' + formatDate(doc.date) }), el('span', { id: 'page-info' }));
  const dl = $('download');
  dl.href = doc.path; dl.setAttribute('download', doc.original || doc.path.split('/').pop()); dl.hidden = false;

  if (doc.ext === 'pdf') return showPdf(doc);
  if (['md', 'markdown', 'txt'].includes(doc.ext)) {
    const res = await fetch(doc.path, { cache: 'no-cache' });
    if (!res.ok) return message('This document couldn’t be loaded', 'Please refresh the page and try again.');
    body.replaceChildren(el('pre', { class: 'text-doc', text: await res.text() }));
    return;
  }
  if (['png', 'jpg', 'jpeg'].includes(doc.ext)) {
    body.replaceChildren(el('div', { class: 'pages' }, el('img', { src: doc.path, alt: doc.title })));
    return;
  }
  message('This file can’t be shown here', 'Use the Download button to open it on your device.');
}

// ---------------- PDF ----------------
let pdf = null, zoom = 1, observer = null, pageObserver = null;
const visible = new Map();

async function showPdf(doc) {
  body.replaceChildren(el('div', { class: 'viewer-msg progress-note' }, el('div', { class: 'spinner' }), 'Opening the document…'));
  try {
    const lib = await import('../vendor/pdfjs/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    pdf = await lib.getDocument({
      url: doc.path,
      isEvalSupported: false,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
      wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
    }).promise;
  } catch (e) {
    console.error(e);
    message('This document couldn’t be opened', 'Please refresh the page, or use the Download button to open it on your device.');
    return;
  }
  $('tools').hidden = false;
  $('zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
  $('zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 250); });
  layout();
}

function setZoom(z) {
  zoom = Math.min(3, Math.max(0.5, z));
  $('zoom-val').textContent = Math.round(zoom * 100) + '%';
  layout();
}

async function layout() {
  if (observer) observer.disconnect();
  if (pageObserver) pageObserver.disconnect();
  visible.clear();
  const first = await pdf.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const fit = Math.min(window.innerWidth - 32, 1000) / base.width;
  const scale = fit * zoom;
  const wrap = el('div', { class: 'pages' });
  const slots = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const slot = el('div', { class: 'page-slot', 'data-page': String(n), role: 'img', 'aria-label': 'Page ' + n });
    // Size each slot from page 1 until the page itself is rendered.
    slot.style.width = Math.floor(base.width * scale) + 'px';
    slot.style.height = Math.floor(base.height * scale) + 'px';
    slots.push(slot); wrap.append(slot);
  }
  body.replaceChildren(wrap);
  observer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting && !e.target.dataset.done) renderPage(e.target, scale);
  }, { rootMargin: '800px 0px' });
  pageObserver = new IntersectionObserver(entries => {
    for (const e of entries) visible.set(Number(e.target.dataset.page), e.intersectionRatio);
    let best = 1, ratio = -1;
    for (const [n, r] of visible) if (r > ratio) { ratio = r; best = n; }
    $('page-info').textContent = `Page ${best} of ${pdf.numPages}`;
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  slots.forEach(s => { observer.observe(s); pageObserver.observe(s); });
  $('page-info').textContent = `Page 1 of ${pdf.numPages}`;
}

async function renderPage(slot, scale) {
  slot.dataset.done = '1';
  const page = await pdf.getPage(Number(slot.dataset.page));
  const vp = page.getViewport({ scale });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width * ratio);
  canvas.height = Math.floor(vp.height * ratio);
  canvas.style.width = Math.floor(vp.width) + 'px';
  canvas.style.height = Math.floor(vp.height) + 'px';
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null }).promise;
  slot.replaceWith(canvas);
  canvas.dataset.page = slot.dataset.page;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Page ' + slot.dataset.page);
  pageObserver.observe(canvas);
}

main();
