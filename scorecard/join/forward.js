/* The Scorecard's join page (www.cuberoot-systems.com/scorecard/join/).
 *
 * Invitations, approval emails and Forgot password links all come here
 * (Batch 2, Willy 23 Oct 2026: the app first, the web app only as a fallback).
 * On a phone with The Scorecard installed, tapping the link opens the app
 * directly and this page is never shown. Otherwise:
 *   - on a phone: get the app first (App Store / Android); each button also
 *     copies the link, so the new app can pick it up when first opened;
 *   - on a computer: straight on to the web app, with the same link.
 * The link is never used up here: only the app (or the web app) uses it, when
 * joining is finished. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var web = new URL('https://willyros01.github.io/scorecard/');
  web.search = window.location.search;
  $('[data-web-link]').href = web.href;

  /* A password reset or email check from an older app (2.30.0) still goes to
     Firebase's own page, as before, so nothing breaks while phones update. */
  var mode0 = new URLSearchParams(window.location.search).get('mode');
  if (mode0 && mode0 !== 'signIn') {
    window.location.replace('https://scorecard-f41b8.firebaseapp.com/__/auth/action' + window.location.search);
    return;
  }

  var ua = navigator.userAgent || '';
  var android = /Android|Silk|Kindle/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var hasLink = !!window.location.search;

  /* A computer: the web app, as before. */
  if (!android && !ios) { if (hasLink) window.location.replace(web.href); return; }

  var params = new URLSearchParams(window.location.search);
  if (params.get('join')) { $('[data-title]').textContent = 'You are invited'; }
  else if (params.get('mode') === 'signIn' || params.get('apply')) {
    $('[data-title]').textContent = params.get('reset') === '1' || /reset%3D1/.test(window.location.search) ? 'Choose a new password' : 'Welcome to The Scorecard';
  }
  if (!hasLink) $('[data-lead]').textContent = 'Install the app, then open the link from your email or message again.';

  /* Android and Fire (Willy, 5 Nov 2026): a link opened in the browser (from
     a saved file, say) never reaches the app by itself. This button hands it
     to The Scorecard directly; without the app, Android goes to the download. */
  if (android && hasLink) {
    var here = 'www.cuberoot-systems.com/scorecard/join/' + window.location.search;
    var fallback = 'https://www.cuberoot-systems.com/downloads/scorecard.apk';
    $('[data-open]').href = 'intent://' + here + '#Intent;scheme=https;package=io.github.willyros01.scorecard;S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
    $('[data-open-box]').hidden = false;
    $('[data-get-step]').hidden = true;
    $('[data-lead]').textContent = 'Your link opens in The Scorecard app.';
    $('[data-then]').textContent = 'After installing';
  }
  if (ios && hasLink) {
    $('[data-ios-open]').hidden = false;
  }

  /* Put this phone's store first, and hide the other one. */
  var apk = $('[data-apk]'), store = $('[data-ios]');
  if (android) store.hidden = true; else apk.hidden = true;

  /* The signed Android download, as on the home page. */
  fetch('../../downloads/scorecard-build.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (meta) {
      if (meta && Number.isSafeInteger(meta.run_id) && meta.run_id > 0) {
        apk.href = '../../downloads/scorecard.apk?build=' + meta.run_id;
        apk.setAttribute('download', 'scorecard-' + meta.run_id + '.apk');
      }
    })
    .catch(function () { /* the plain download link stays */ });

  /* Copy and continue: the link goes on the clipboard as the store opens. */
  function copyLink() {
    if (!hasLink || !navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(function () { $('[data-copied]').hidden = false; }, function () {});
  }
  apk.addEventListener('click', copyLink);
  store.addEventListener('click', copyLink);
})();
