/* The caddie and follow links from The Marker (the QR square on the golfer's
   phone). With The Marker installed, iPhone and Android open the app directly
   and this page is never shown. Without it, this page asks for the app first
   (Willy, 2 Nov 2026: the app first, the web app only as a fallback): the App
   Store and the Android download, then the code to type in the app, and the
   web app as a small line at the bottom. Nothing is forwarded automatically.

   The page says which kind of link it is: <body data-kind="caddie|follow">. */
(function () {
  var kind = document.body.getAttribute('data-kind') === 'follow' ? 'follow' : 'caddie';
  var params = new URLSearchParams(window.location.search);
  /* Codes are letters and digits only; anything else is ignored. */
  var code = (params.get(kind) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();

  var $ = function (sel) { return document.querySelector(sel); };
  var spaced = code.length === 6 ? code.slice(0, 3) + ' ' + code.slice(3) : code;

  /* The web app, with the same code, as the fallback. */
  var web = new URL('https://willyros01.github.io/marker/');
  if (code) web.searchParams.set(kind, code);
  $('[data-web-link]').href = web.href;

  if (code) {
    $('[data-code]').textContent = spaced;
    $('[data-code]').setAttribute('aria-label', 'Code ' + code.split('').join(' '));
    $('[data-with-code]').hidden = false;
  } else {
    $('[data-no-code]').hidden = false;
  }

  /* Put the store for this phone first. */
  var ua = navigator.userAgent || '';
  var android = /Android|Silk|Kindle/i.test(ua);
  var stores = $('.stores');
  var apk = $('[data-apk]');
  if (android && stores && apk) stores.insertBefore(apk, stores.firstChild);

  /* The Android download: the current signed build, as on the home page. */
  fetch('../../downloads/marker-build.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (meta) {
      if (meta && Number.isSafeInteger(meta.run_id) && meta.run_id > 0) {
        apk.href = '../../downloads/marker.apk?build=' + meta.run_id;
        apk.setAttribute('download', 'marker-' + meta.run_id + '.apk');
      }
    })
    .catch(function () { /* the plain download link stays */ });
})();
