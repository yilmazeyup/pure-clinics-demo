// What every page of the Pure Clinics website shares: language, palette, the clinic's data, links and small helpers.
// Since 27 Nov 2026 the site is many pages instead of one long one; each page folder loads ../js/app.js.
import { LANGS, STRINGS } from '../i18n.js';
import '../../../lang.js';
import { PAGE_STRINGS } from '../i18n-pages.js';

/** The website's root folder (…/website/), whatever page we are on. */
export const BASE = new URL('../../', import.meta.url).href;

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const root = document.documentElement;
export const params = new URLSearchParams(location.search);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function box(kind) {
  return {
    get(k) {
      try {
        return globalThis[kind].getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        globalThis[kind].setItem(k, v);
      } catch {
        /* private mode */
      }
    },
    remove(k) {
      try {
        globalThis[kind].removeItem(k);
      } catch {
        /* private mode */
      }
    },
  };
}
export const store = box('localStorage');
export const session = box('sessionStorage');

/* ---------- Palette and language ---------- */

export const STUDIES = ['creme', 'karamel', 'walnoot'];
export const HERO = { creme: 'c-web81-hero', karamel: 'c-mature-hero', walnoot: 'c-up-hero' };
export const THEME = { creme: '#f7f3ec', karamel: '#f3ece2', walnoot: '#f6f1ea' };
const pickFrom = (list, ...values) => values.find((v) => list.includes(v)) ?? list[0];
// The third palette was Bordeaux until 23 Nov 2026; old links and stored choices open Walnoot.
const renamed = (v) => (v === 'bordeaux' ? 'walnoot' : v);

// Pure chose cream with walnut (Neslihan, Nov 2026): the palette panel is gone and the site always opens in Crème.
// ?studie=karamel|walnoot still shows the other studies for comparison, without remembering it.
export const state = {
  study: pickFrom(STUDIES, renamed(params.get('studie')), 'creme'),
  // A ?lang= link, the visitor's own choice (here or on another Pure page, ../../lang.js), else Dutch.
  lang: pickFrom(LANGS, params.get('lang'), store.get('pure-web-lang'), window.PureLang?.pick(LANGS)),
};
root.dataset.study = state.study;

export const S = (key, vars = {}) => {
  const l = state.lang;
  let s = PAGE_STRINGS[l]?.[key] ?? STRINGS[l]?.[key] ?? PAGE_STRINGS.nl[key] ?? STRINGS.nl[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
};
export const L = (text) => (text ? (text[state.lang] ?? text.nl ?? '') : '');
export const LOCALE = { nl: 'nl-NL', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ar: 'ar-u-nu-latn' };
export const money = (n) =>
  new Intl.NumberFormat(LOCALE[state.lang], { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
export const priceLine = (t) => (t.priceFrom === 0 ? S('free') : S('from', { p: money(t.priceFrom) }));
export const arrow = () => (state.lang === 'ar' ? '←' : '→');

/* ---------- Links and pictures ---------- */

/** A page of the site, e.g. link('behandeling/', { id: 'laser' }). */
export function link(path = '', query = {}) {
  const u = new URL(path, BASE);
  for (const [k, v] of Object.entries(query)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.pathname + u.search + u.hash;
}
export const treatmentLink = (id) => link('behandeling/', { id });
export const productLink = (id) => link('product/', { id });
export const bookLink = (id = 'consult') => link('afspraak/', { behandeling: id });
export const img = (path) => BASE + 'img/' + path;
export const photo = (key, small = true) => img(`${key}${small ? '-s' : ''}.webp`);

/* ---------- The clinic's data ---------- */

const json = (path) => fetch(BASE + path).then((r) => r.json());
export const [data, acties] = await Promise.all([json('data/pure.json'), json('data/acties.json')]);
export const treatments = data.treatments;
export const byId = Object.fromEntries(treatments.map((t) => [t.id, t]));
export const productById = Object.fromEntries(data.products.map((p) => [p.id, p]));
export const nameOf = (id) => (byId[id] ? L(byId[id].name) : id);

/** Campaigns that run today (each has a last day; the gift card offer runs until Pure says otherwise). */
export function activeCampaigns(now = new Date()) {
  return acties.campaigns.filter((c) => (!c.from || new Date(c.from) <= now) && (!c.until || now <= new Date(c.until)));
}
export const dealsFor = (treatmentId) =>
  activeCampaigns().flatMap((c) => (c.deals ?? []).filter((d) => d.treatment === treatmentId).map((d) => ({ campaign: c, deal: d })));
export const dealsForProduct = (productId) =>
  activeCampaigns().flatMap((c) => (c.deals ?? []).filter((d) => d.product === productId).map((d) => ({ campaign: c, deal: d })));

/**
 * Pure's campaigns and gift card offer come from Huidly, where Pure's team keeps them (Campagnes). The site starts with
 * its own copy (data/acties.json) so it never waits, then takes Huidly's when it answers. What the site reads is
 * described in docs/website-kampanyalar.md (pure-ivy).
 */
export async function refreshFromHuidly() {
  const base = 'https://huidly.com/api/klant/pure';
  const get = (p) =>
    fetch(`${base}/${p}`, { credentials: 'omit', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  const [c, g] = await Promise.all([get('campaigns'), get('gift-cards')]);
  let changed = false;
  if (Array.isArray(c?.campaigns)) {
    acties.campaigns = c.campaigns.map((x) => ({ ...x, deals: Array.isArray(x.deals) ? x.deals : [] }));
    changed = true;
  }
  if (Array.isArray(g?.giftCards)) {
    const cards = g.giftCards.map((x) => ({ id: x.id, price: x.price, value: x.value ?? x.price }));
    const best = cards.filter((x) => x.value > x.price).sort((a, b) => b.value - b.price - (a.value - a.price))[0];
    acties.giftcard = { active: !!best, amount: best?.price ?? 0, bonus: best ? best.value - best.price : 0, cards };
    changed = true;
  }
  return changed;
}
export const untilLine = (c) =>
  S('until', { d: new Intl.DateTimeFormat(LOCALE[state.lang], { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(c.until)) });

/* ---------- Things that follow the language ---------- */

const langHooks = [];
/** Runs fn now and again whenever the visitor picks another language. */
export function onLang(fn) {
  langHooks.push(fn);
}
export function runLang() {
  for (const fn of langHooks) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
}

/* ---------- Words that rise line by line ---------- */

export function splitWords(el, className) {
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.append(' ');
            continue;
          }
          const outer = document.createElement('span');
          outer.className = className;
          if (className === 'wd') {
            const inner = document.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            outer.append(inner);
          } else {
            outer.textContent = part;
          }
          frag.append(outer);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);
}

/* ---------- Reveal on scroll ---------- */

const revealer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        revealer.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
);
export function watch(scope = document) {
  $$('.rise, .lines, .unveil, .card', scope).forEach((el) => {
    if (el.classList.contains('in')) return;
    if (el.classList.contains('rise') && !el.style.getPropertyValue('--d')) {
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('rise'));
      el.style.setProperty('--d', `${Math.max(0, sibs.indexOf(el)) * 90}ms`);
    }
    revealer.observe(el);
  });
}

/* ---------- A carousel that pages, swipes and plays by itself ---------- */

export function carousel({ track, prev, next, dots, perView, auto }) {
  let index = 0;
  let timer;
  const count = () => track.children.length;
  const pages = () => Math.max(1, count() - perView() + 1);
  const go = (i) => {
    index = (i + pages()) % pages();
    const first = track.children[0];
    if (!first) return;
    const step = first.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || '20');
    track.style.transform = `translateX(${(root.dir === 'rtl' ? 1 : -1) * index * step}px)`;
    $$('button', dots).forEach((d, j) => d.setAttribute('aria-current', String(j === index)));
  };
  const drawDots = () => {
    dots.innerHTML = Array.from({ length: pages() }, (_, j) => `<button type="button" aria-label="${j + 1}"></button>`).join('');
    go(Math.min(index, pages() - 1));
  };
  prev.addEventListener('click', () => go(index - 1));
  next.addEventListener('click', () => go(index + 1));
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) go([...dots.children].indexOf(b));
  });
  const play = () => {
    clearInterval(timer);
    if (!REDUCED && auto) timer = setInterval(() => go(index + 1), auto);
  };
  const frame = track.parentElement;
  frame.addEventListener('pointerenter', () => clearInterval(timer));
  frame.addEventListener('pointerleave', play);
  frame.addEventListener('focusin', () => clearInterval(timer));
  let sx = null;
  frame.addEventListener('pointerdown', (e) => (sx = e.clientX));
  frame.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 40) go(index + ((dx < 0) !== (root.dir === 'rtl') ? 1 : -1));
    sx = null;
  });
  addEventListener('resize', drawDots);
  play();
  return { refresh: drawDots };
}

/* ---------- Cart (kept in this browser until the order is placed) ---------- */

const CART_KEY = 'pure-web-cart';
const cartHooks = [];
export const cart = {
  lines() {
    try {
      return JSON.parse(store.get(CART_KEY) ?? '[]');
    } catch {
      return [];
    }
  },
  save(lines) {
    store.set(CART_KEY, JSON.stringify(lines));
    cartHooks.forEach((fn) => fn(lines));
  },
  add(line) {
    const lines = this.lines();
    const same = lines.find(
      (l) => l.kind === line.kind && l.id === line.id && l.amount === line.amount && (l.to ?? '') === (line.to ?? '') && (l.message ?? '') === (line.message ?? ''),
    );
    if (same) same.qty += line.qty ?? 1;
    else lines.push({ qty: 1, ...line });
    this.save(lines);
    // For the statistics (site/track.js), if the visitor agreed to them
    const p = productById[line.id];
    document.dispatchEvent(
      new CustomEvent('pure:cart-add', {
        detail: { id: line.id, kind: line.kind, qty: line.qty ?? 1, price: this.price(line), name: line.kind === 'giftcard' ? `Cadeaubon ${line.amount}` : (p?.name?.nl ?? line.id) },
      }),
    );
  },
  setQty(i, qty) {
    const lines = this.lines();
    if (!lines[i]) return;
    if (qty <= 0) lines.splice(i, 1);
    else lines[i].qty = qty;
    this.save(lines);
  },
  clear() {
    this.save([]);
  },
  count() {
    return this.lines().reduce((n, l) => n + l.qty, 0);
  },
  /** Price of one line in euros: a product's shop price, or the amount of a gift card. */
  price(l) {
    return l.kind === 'giftcard' ? l.amount : (productById[l.id]?.price ?? 0);
  },
  total() {
    return this.lines().reduce((sum, l) => sum + this.price(l) * l.qty, 0);
  },
  onChange(fn) {
    cartHooks.push(fn);
  },
};
addEventListener('storage', (e) => e.key === CART_KEY && cartHooks.forEach((fn) => fn(cart.lines())));

/** The gift card offer: €15 on top of a €100 card, as Pure wrote it. */
export const giftBonus = (amount) => (acties.giftcard.active && amount === acties.giftcard.amount ? acties.giftcard.bonus : 0);
/** What a gift card line adds on top: its value in the clinic minus what you pay. */
export const lineBonus = (l) => (l.kind !== 'giftcard' ? 0 : l.value != null ? l.value - l.amount : giftBonus(l.amount));
