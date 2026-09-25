// Shared page behaviour: mobile menu, contact links, icons, small DOM helpers.
import { SITE } from './config.js';

export const ICONS = {
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  device: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  // app icons
  fidunio: '<polygon points="12,2 21,7 21,17 12,22 3,17 3,7"/><path d="M12 22V12M21 7l-9 5-9-5"/>',
  split: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 12l7-5"/>',
  flag: '<path d="M7 21V3"/><path d="M7 4h11l-2.5 4L18 12H7"/><path d="M4 21h8"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><rect x="9" y="8.5" width="6" height="4.5" rx="1"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
};

const SVGNS = 'http://www.w3.org/2000/svg';
export function icon(name, cls = 'icon') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  // ICONS are fixed strings defined above — never user data.
  const tpl = document.createElementNS(SVGNS, 'g');
  tpl.innerHTML = ICONS[name] || ICONS.doc;
  while (tpl.firstChild) svg.appendChild(tpl.firstChild);
  return svg;
}

// el('div', {class: 'x', text: 'hi'}, child1, child2)
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return iso; }
}
export function formatSize(n) {
  if (n < 1024) return n + ' bytes';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

// Replace every <span data-icon="name"> with the icon.
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(n => { n.replaceWith(icon(n.dataset.icon, n.className || 'icon')); });
}

function setupMenu() {
  const btn = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    btn.replaceChildren(icon(open ? 'close' : 'menu'));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
}

function setupContact() {
  document.querySelectorAll('[data-contact]').forEach(a => {
    if (SITE.contactEmail) a.setAttribute('href', 'mailto:' + SITE.contactEmail);
    else if (a.dataset.contact === 'hide') a.hidden = true;
  });
  document.querySelectorAll('[data-contact-text]').forEach(n => {
    if (!SITE.contactEmail) n.textContent = n.dataset.contactText;
  });
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = String(new Date().getFullYear()); });
}

export function init() {
  hydrateIcons();
  setupMenu();
  setupContact();
}
