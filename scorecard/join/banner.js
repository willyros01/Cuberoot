/* iPhone and iPad (Willy, 5 Nov 2026): Apple's own banner at the top of this
   page. With The Scorecard installed it says Open, and opens the app with this
   very link; without it, it offers the App Store. Loaded in the head, before
   the page is drawn, which is when Safari reads the banner. */
(function () {
  try {
    var m = document.createElement('meta');
    m.name = 'apple-itunes-app';
    m.content = 'app-id=6817462903, app-argument=' + window.location.href;
    document.head.appendChild(m);
  } catch (e) { /* no banner: the App Store button below still works */ }
})();
