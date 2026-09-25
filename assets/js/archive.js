import { init } from './common.js';
init();

const buttons = [...document.querySelectorAll('.retro-menu button')];
function show(key, focus) {
  if (!document.getElementById('page-' + key)) key = 'home';
  document.querySelectorAll('.retro-section').forEach(s => { s.hidden = s.id !== 'page-' + key; });
  buttons.forEach(b => {
    if (b.dataset.page === key) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (focus) history.replaceState(null, '', '#' + key);
}
buttons.forEach(b => b.addEventListener('click', () => show(b.dataset.page, true)));
show(location.hash.slice(1) || 'home', false);
