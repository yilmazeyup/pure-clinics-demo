/* Which language a Pure Clinics page opens in. Dutch, always, unless the visitor asks for another one: a ?lang= link
   first, then a language they picked themselves on any Pure page (remembered here), else Dutch (the owner's rule,
   28 Nov 2026: "her zaman default Felemenkçe olmalı"). Nothing is guessed from the browser or the visitor's country.
   The owner may want the language to follow the visitor's location later ("belki sonra konuma göre değişebilir"): the
   time-zone table of huidly/web/src/i18n/auto.ts can then go into pick(), between the choice and the Dutch default.
   Loads as a classic <script> (pages that pick their file before they paint) or as a module import (the website). */
(function (w) {
  var KEY = 'pure-lang';

  function chosen() {
    try {
      return w.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  /** The language to open in, one of `supported` (an array of codes such as ['nl', 'tr', 'en']). */
  function pick(supported) {
    var q = null;
    try {
      q = new URLSearchParams(w.location.search).get('lang');
    } catch (e) {
      q = null;
    }
    if (supported.indexOf(q) >= 0) return q;
    var c = chosen();
    if (supported.indexOf(c) >= 0) return c;
    return supported.indexOf('nl') >= 0 ? 'nl' : supported[0];
  }

  /** Remember a language the visitor picked themselves. */
  function choose(lang) {
    try {
      w.localStorage.setItem(KEY, lang);
    } catch (e) {
      /* private windows may refuse storage; the page still works */
    }
  }

  /** For a page kept as one file per language ({nl: 'index.html', tr: 'tr.html', en: 'en.html'}): if the visitor asked
      for a language that lives in another file, open that one instead, at the same place on the page. Call it in the
      <head> of the Dutch index.html. */
  function route(files) {
    var lang = pick(Object.keys(files));
    var here = w.location.pathname.split('/').pop() || 'index.html';
    if (files[lang] && files[lang] !== here) w.location.replace(files[lang] + w.location.hash);
  }

  // Language links (<a data-pure-lang="tr" href="tr.html">) remember the choice and keep the place on the page.
  if (w.document) {
    w.document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[data-pure-lang]') : null;
      if (!a) return;
      choose(a.getAttribute('data-pure-lang'));
      if (w.location.hash && !a.hash) a.href = a.href.split('#')[0] + w.location.hash;
    });
  }

  w.PureLang = { pick: pick, choose: choose, route: route };
})(window);
