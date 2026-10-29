/* A caddie's link from The Marker (the QR square on the golfer's phone).
   With The Marker app installed, iPhone and Android open the app directly and
   this page is never shown. Anywhere else it forwards to the web app with the
   same ?caddie=… code, which opens the Join screen with the code filled in. */
const target = new URL('https://willyros01.github.io/marker/');
if (window.location.search) {
  target.search = window.location.search;
  window.location.replace(target.href);
} else {
  document.querySelector('[data-web-link]').href = target.href;
  document.querySelector('[data-status]').hidden = false;
}
