// What visitors do on the site, for Pure to read: pages, treatments and products they look at, the booking steps,
// cart, orders, sign-ups. One call, track(name, params), with Google Analytics 4 event names. Nothing leaves the
// browser before the visitor agrees: statistics (Google Analytics 4 and Pure's own collector) need "Statistieken",
// the Meta Pixel needs "Marketing". Which tools are on is set in data/tracking.json (empty = off).
// ?debug-track prints every event in the console; window.__pureEvents keeps the last 100 of this page.
import { BASE, params, session, state } from './core.js';
import { consent } from './consent.js';

const cfg = await fetch(BASE + 'data/tracking.json')
  .then((r) => r.json())
  .catch(() => ({}));
const DEBUG = params.has('debug-track');
const queue = [];
window.__pureEvents = [];

/** A random id for this visit (no name, no e-mail), made only after the visitor agreed to statistics. */
function sid() {
  let s = session.get('pure-sid');
  if (!s) {
    s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    session.set('pure-sid', s);
  }
  return s;
}

/* ---------- Tools, loaded only after consent ---------- */

let gaReady = false;
function startGA() {
  if (gaReady || !cfg.ga4) return;
  gaReady = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', cfg.ga4, { send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4)}`;
  document.head.append(s);
}

let pixelReady = false;
function startPixel() {
  if (pixelReady || !cfg.metaPixel) return;
  pixelReady = true;
  /* Meta's standard loader, without the <noscript> image */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', cfg.metaPixel);
}

const PIXEL = { page_view: 'PageView', view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase', generate_lead: 'Lead', sign_up: 'CompleteRegistration' };

function send(e) {
  const c = consent();
  if (!c) return queue.push(e);
  if (c.stats) {
    startGA();
    if (cfg.ga4 && window.gtag) window.gtag('event', e.name, e.params);
    if (cfg.firstParty) {
      const body = JSON.stringify({ ...e, sid: sid(), page: location.pathname, ref: document.referrer ? new URL(document.referrer).hostname : '', lang: state.lang });
      navigator.sendBeacon?.(cfg.firstParty, new Blob([body], { type: 'application/json' })) || fetch(cfg.firstParty, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    }
  }
  if (c.marketing && PIXEL[e.name]) {
    startPixel();
    if (cfg.metaPixel && window.fbq) window.fbq('track', PIXEL[e.name], e.params);
  }
}

/** Records one thing a visitor did. Params follow GA4 (value, currency, items, item_id, …). */
export function track(name, params = {}) {
  const e = { name, params: { ...params }, ts: Date.now() };
  window.__pureEvents.push(e);
  if (window.__pureEvents.length > 100) window.__pureEvents.shift();
  if (DEBUG) console.info('[track]', name, params);
  send(e);
}

// Once the visitor chooses, what waited is sent (or dropped, if they said no).
document.addEventListener('pure:consent', () => {
  const waiting = queue.splice(0);
  waiting.forEach(send);
});

/* ---------- Things every page reports by itself ---------- */

export function startTracking(page) {
  track('page_view', { page_type: page, page_location: location.pathname + location.search, language: state.lang });

  // Clicks on the ways to book, the shop and the gift card, wherever they are on the page
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href], [data-track]');
    if (!a) return;
    const where = a.closest('section, header, footer, aside, nav')?.className?.split(' ')[0] || 'page';
    const href = a.getAttribute('href') || '';
    const kind = a.dataset.track || (href.includes('afspraak/') ? 'book' : href.includes('cadeaubon/') ? 'giftcard' : href.includes('shop/') ? 'shop' : href.startsWith('tel:') ? 'call' : href.startsWith('mailto:') ? 'email' : '');
    if (kind) track('select_content', { content_type: 'cta', item_id: kind, placement: where, page_type: page });
  });

  // Cart additions come from core.js as a DOM event
  document.addEventListener('pure:cart-add', (e) => {
    const l = e.detail;
    track('add_to_cart', { currency: 'EUR', value: l.price * l.qty, items: [{ item_id: l.id, item_name: l.name, item_category: l.kind, price: l.price, quantity: l.qty }] });
  });

  // How far people read
  const marks = [25, 50, 75, 100];
  const seen = new Set();
  addEventListener(
    'scroll',
    () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      if (h <= 0) return;
      const p = (scrollY / h) * 100;
      for (const m of marks) if (p >= m - 1 && !seen.has(m)) (seen.add(m), track('scroll', { percent_scrolled: m, page_type: page }));
    },
    { passive: true },
  );
}
