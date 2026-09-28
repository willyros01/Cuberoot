const target = new URL('https://willyros01.github.io/scorecard/');
if (window.location.search) {
  target.search = window.location.search;
  window.location.replace(target.href);
} else {
  document.querySelector('[data-web-link]').href = target.href;
  document.querySelector('[data-status]').hidden = false;
}
