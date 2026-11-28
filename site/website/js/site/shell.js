// The frame of every page: header with the menu, language and palette, the cart, the gift card note, the booking bar
// and the footer with both clinics. Pages bring their own <main>; this file fills #header, #menu and #footer.
import { LANGS, LANG_NAMES } from '../i18n.js';
import { logoSvg } from '../logo.js';
import { onFrame, scroll } from '../fx/core.js';
import {
  $,
  $$,
  BASE,
  LOCALE,
  REDUCED,
  S,
  STUDIES,
  THEME,
  bookLink,
  cart,
  clamp,
  data,
  esc,
  lineBonus,
  img,
  link,
  money,
  params,
  productById,
  root,
  runLang,
  session,
  splitWords,
  state,
  store,
  watch,
} from './core.js';
import { account } from './account.js';
import { consentPending, openConsent, startConsent } from './consent.js';
import { acties } from './core.js';

const page = document.body.dataset.page;

/** Pure's company details, as in its own terms (algemene voorwaarden, pureclinics.nl). */
export const COMPANY = {
  address: 'Sint Annastraat 1, 6524 EA Nijmegen',
  kvk: '64095096',
  vat: 'NL150584647B01',
  terms: 'https://www.pureclinics.nl/wp-content/uploads/2022/04/algemene-voorwaarden.pdf',
};

/** The gift card line: Pure's offer from Huidly (what you pay and what the card is worth), or the card on its own. */
export function drawGiftOffer() {
  const g = acties.giftcard;
  $('#gift-note-offer').textContent = g?.active && g.bonus ? S('giftOffer', { a: money(g.amount), b: money(g.bonus) }) : S('giftPlain');
}

const NAV = [
  ['treatments', 'behandelingen/', 'navTreatments'],
  ['results', 'resultaten/', 'navResults'],
  ['prices', 'prijzen/', 'navPrices'],
  ['shop', 'shop/', 'navShop'],
  ['giftcard', 'cadeaubon/', 'navGift'],
  ['about', 'over-ons/', 'navAbout'],
];
const MORE = [['faq', 'vragen/', 'navFaq']];
const ACTIVE = { treatment: 'treatments', product: 'shop', checkout: 'shop' };

const ICON = {
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1.2-3.6 4-5.3 7.2-5.3s6 1.7 7.2 5.3"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></svg>',
};

/* ---------- Markup ---------- */

function navLinks(list) {
  const active = ACTIVE[page] ?? page;
  return list.map(([id, path, key]) => `<a href="${link(path)}" data-t="${key}"${id === active ? ' class="active" aria-current="page"' : ''}></a>`).join('');
}

function drawFrame() {
  const header = $('#header');
  header.innerHTML = `
    <a class="brand" href="${link('')}" aria-label="Pure Clinics" data-logo></a>
    <nav class="nav" data-t-label="navLabel">${navLinks(NAV)}</nav>
    <div class="header-end">
      <label class="lang"><span class="sr" data-t="language"></span><select id="lang"></select></label>
      <a class="icon-link" id="account-link" href="${link('account/')}">${ICON.person}<span class="icon-label" id="account-label"></span></a>
      <button class="icon-link" id="cart-button" type="button" aria-haspopup="dialog">${ICON.bag}<span class="cart-count" id="cart-count" hidden></span><span class="sr" data-t="cart"></span></button>
      <a class="btn btn-solid header-book" href="${bookLink()}" data-t="ctaBook"></a>
      <button class="menu-button" id="menu-button" type="button" aria-expanded="false" aria-controls="menu"><span class="sr" data-t="menu"></span><i></i><i></i></button>
    </div>`;
  $('#menu').innerHTML = `
    <nav data-t-label="menu">${navLinks([...NAV, ...MORE])}</nav>
    <div class="menu-end">
      <a class="btn btn-solid" href="${bookLink()}" data-t="ctaBook"></a>
      <a class="btn btn-line" href="${link('account/')}" data-t="myPure"></a>
    </div>`;
  $('#footer').innerHTML = `
    <div class="footer-cols" id="footer-places"></div>
    <div class="footer-cols footer-links">
      <div><p class="footer-kicker">Pure Clinics</p><p class="footer-nav">${navLinks([...NAV, ...MORE])}<a href="${link('afspraak/')}" data-t="ctaBook"></a><a href="${link('account/')}" data-t="myPure"></a></p></div>
      <div><p class="footer-kicker" data-t="footFollow"></p><p><a href="https://www.instagram.com/pureclinics_/" target="_blank" rel="noopener">Instagram</a><br /><a href="https://www.facebook.com/pureclinics.huidtherapie" target="_blank" rel="noopener">Facebook</a></p></div>
      <div><p class="footer-kicker" data-t="footAlso"></p><p><a href="${BASE}../app/" data-t="footApp"></a></p></div>
    </div>
    <div class="footer-mark" data-logo aria-hidden="true"></div>
    <div class="footer-legal">
      <p class="footer-fine">© ${new Date().getFullYear()} Pure Clinics · <span data-t="footFineLive"></span><br />${COMPANY.address} · KvK ${COMPANY.kvk} · <span data-t="vatShort"></span> ${COMPANY.vat}</p>
      <p class="footer-fine footer-legal-links"><a href="${link('privacy/')}" data-t="privacyTitle"></a><button type="button" class="linklike" data-cookie-settings data-t="cookieSettings"></button><a href="${COMPANY.terms}" target="_blank" rel="noopener" data-t="termsTitle"></a></p>
    </div>`;

  document.body.insertAdjacentHTML(
    'beforeend',
    `<a class="book-bar" id="book-bar" href="${bookLink()}"><span data-t="barText"></span><b data-t="barCta"></b></a>
    <aside class="gift-note" id="gift-note" hidden data-t-label="giftEyebrow">
      <a class="gift-note-link" href="${link('cadeaubon/')}">
        <img src="${img('cadeaubon/kaart-46-s.webp')}" alt="" />
        <span class="gift-note-copy"><small data-t="giftEyebrow"></small><b data-t="giftTitle"></b><span id="gift-note-offer"></span><em><span data-t="giftNoteCta"></span> <span class="arr">→</span></em></span>
      </a>
      <button class="gift-note-close" id="gift-note-close" type="button" data-t-label="close">×</button>
    </aside>
    <dialog class="drawer" id="cart-drawer" aria-labelledby="cart-title">
      <div class="drawer-inner">
        <header class="drawer-head"><h2 class="card-title" id="cart-title" data-t="cart"></h2><button class="sheet-close" type="button" id="cart-close" data-t-label="close">×</button></header>
        <div class="drawer-body" id="cart-body"></div>
      </div>
    </dialog>`,
  );
  $$('[data-logo]').forEach((el) => (el.innerHTML = logoSvg()));
  $('#lang').innerHTML = LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');
}

/* ---------- Texts ---------- */

export function applyTexts() {
  root.lang = state.lang;
  root.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  const title = document.body.dataset.title;
  document.title = title ? `${S(title)} · Pure Clinics` : S('pageTitle');
  $$('[data-t]').forEach((el) => {
    const v = S(el.dataset.t);
    if (el.hasAttribute('data-html')) el.innerHTML = v;
    else el.textContent = v;
  });
  $$('[data-t-label]').forEach((el) => el.setAttribute('aria-label', S(el.dataset.tLabel)));
  $$('.lines').forEach((el) => splitWords(el, 'wd'));
  $$('.arr').forEach((el) => (el.textContent = state.lang === 'ar' ? '←' : '→'));
  $('#lang').value = state.lang;
  $('#lang').setAttribute('aria-label', S('language'));
  drawGiftOffer();
  drawAccount();
  drawPlaces();
}

/* ---------- Footer: both clinics with their hours ---------- */

function drawPlaces() {
  const fmt = new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'long' });
  const dayName = (d) => fmt.format(new Date(2026, 10, 15 + d)); // 15 November 2026 is a Sunday
  const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  $('#footer-places').innerHTML = data.locations
    .map(
      (l) => `<div><p class="footer-kicker">${l.city}</p><p>${esc(l.address)}<br /><a href="tel:${l.phone.replace(/\s/g, '')}">${l.phone}</a></p>
      <table aria-label="${S('hours')}">${[1, 2, 3, 4, 5, 6, 0]
        .map((d) => `<tr><td>${dayName(d)}</td><td>${l.hours[d] ? `${hh(l.hours[d].open)} – ${hh(l.hours[d].close)}` : S('closed')}</td></tr>`)
        .join('')}</table></div>`,
    )
    .concat(`<div><p class="footer-kicker">Contact</p><p><a href="mailto:${data.clinic.email}">${data.clinic.email}</a><br /><a href="tel:+31246792236">${data.clinic.phone}</a></p></div>`)
    .join('');
}

/* ---------- Account link ---------- */

function drawAccount() {
  const me = account.current();
  const label = $('#account-label');
  label.textContent = me ? (me.name?.split(' ')[0] ?? S('myPure')) : S('signIn');
  $('#account-link').setAttribute('aria-label', me ? S('myPure') : S('signIn'));
}

/* ---------- Cart ---------- */

function drawCartCount() {
  const n = cart.count();
  const el = $('#cart-count');
  el.hidden = n === 0;
  el.textContent = String(n);
  $('#cart-button').setAttribute('aria-label', n ? S('cartCount', { n }) : S('cart'));
}

export function lineName(l) {
  if (l.kind === 'giftcard') return S('giftLine', { a: money(l.amount) });
  const p = productById[l.id];
  return p ? `${p.brand ? p.brand + ' · ' : ''}${p.name[state.lang] ?? p.name.nl}` : l.id;
}
export function lineThumb(l) {
  return l.kind === 'giftcard' ? img('cadeaubon/kaart-47-s.webp') : productImage(productById[l.id] ?? { id: l.id });
}
/** A product's photo: the one Pure keeps in Huidly when there is one (https only), else the site's own still life. */
export function productImage(p) {
  return typeof p.image === 'string' && p.image.startsWith('https://') ? p.image : img(`products/${PRODUCT_RENDER[p.id] ?? 'jar'}.webp`);
}
export const PRODUCT_RENDER = {
  'zo-cleanser': 'pump',
  'zo-defense': 'dropper',
  'zo-spf': 'tube',
  'lycogel-camouflage': 'tube',
  'wiqo-cream': 'jar',
  'xlhair-revitalix': 'serum',
  'xlhair-scalpfit': 'serum',
  'xlhair-spray': 'spray',
  'camouflage-set': 'jar',
  'laser-aftercare-set': 'pump',
};

function drawCart() {
  const lines = cart.lines();
  const body = $('#cart-body');
  if (!lines.length) {
    body.innerHTML = `<p class="drawer-empty" data-t="cartEmpty">${S('cartEmpty')}</p><a class="btn btn-line" href="${link('shop/')}">${S('toShop')}</a>`;
    return;
  }
  body.innerHTML = `
    <ul class="cart-lines">${lines
      .map((l, i) => {
        const bonus = lineBonus(l) * l.qty;
        return `<li class="cart-line">
          <img src="${lineThumb(l)}" alt="" />
          <div><p class="cart-name">${esc(lineName(l))}</p>${bonus ? `<p class="cart-bonus">${S('giftBonusLine', { b: money(bonus) })}</p>` : ''}
            <div class="qty"><button type="button" data-qty="${i}" data-d="-1" aria-label="−">−</button><span>${l.qty}</span><button type="button" data-qty="${i}" data-d="1" aria-label="+">+</button></div></div>
          <p class="cart-price">${money(cart.price(l) * l.qty)}</p>
        </li>`;
      })
      .join('')}</ul>
    <p class="cart-total"><span>${S('total')}</span><b>${money(cart.total())}</b></p>
    <p class="fine">${S('payAtPickup')}</p>
    <a class="btn btn-solid" href="${link('afrekenen/')}">${S('toCheckout')}</a>`;
}

/* ---------- Gift card note: shown once per visit, a moment after the page opens ---------- */

const NO_GIFT_NOTE = ['giftcard', 'checkout', 'booking', 'account'];
export function showGiftNote(delay = 1600) {
  const note = $('#gift-note');
  if (NO_GIFT_NOTE.includes(page) || session.get('pure-gift-note') || params.has('geen-cadeaubon')) return;
  const show = () =>
    setTimeout(() => {
      note.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => note.classList.add('show')));
    }, delay);
  // Never on top of the cookie question: the note waits until the visitor has chosen.
  if (consentPending()) document.addEventListener('pure:consent', show, { once: true });
  else show();
  const close = () => {
    session.set('pure-gift-note', '1');
    note.classList.remove('show');
    setTimeout(() => (note.hidden = true), 500);
  };
  $('#gift-note-close').addEventListener('click', close);
  $('.gift-note-link', note).addEventListener('click', () => session.set('pure-gift-note', '1'));
}

/* ---------- Start ---------- */

export function startShell() {
  drawFrame();

  // Language
  $('#lang').addEventListener('change', (e) => {
    state.lang = e.target.value;
    store.set('pure-web-lang', state.lang);
    window.PureLang?.choose(state.lang);
    applyTexts();
    runLang();
    watch();
    syncUrl();
    drawCart();
  });

  // Palette: fixed (Crème, Pure's choice); ?studie= still previews the other studies.
  root.dataset.study = state.study;
  $('meta[name="theme-color"]')?.setAttribute('content', THEME[state.study]);

  // Cookies: the banner on a first visit, and "Cookie-instellingen" in the footer to change the choice later.
  startConsent();
  document.addEventListener('click', (e) => e.target.closest('[data-cookie-settings]') && openConsent(true));

  // Menu
  const header = $('#header');
  const menu = $('#menu');
  const menuButton = $('#menu-button');
  const setMenu = (open) => {
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    onScroll();
  };
  menuButton.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));

  // Cart
  const drawer = $('#cart-drawer');
  $('#cart-button').addEventListener('click', () => {
    drawCart();
    drawer.showModal();
  });
  $('#cart-close').addEventListener('click', () => drawer.close());
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) drawer.close();
    const b = e.target.closest('[data-qty]');
    if (!b) return;
    const i = +b.dataset.qty;
    cart.setQty(i, cart.lines()[i].qty + +b.dataset.d);
    drawCart();
  });
  cart.onChange(() => {
    drawCartCount();
    if (drawer.open) drawCart();
  });
  account.onChange(drawAccount);

  // Header over the photo on the home page, solid elsewhere; it hides while you read down.
  const photoHero = $('.hero');
  const bookBar = $('#book-bar');
  const bookSection = $('.book');
  const noBar = ['booking', 'checkout', 'account'].includes(page);
  let lastY = scrollY;
  function onScroll() {
    const y = scrollY;
    const vh = innerHeight;
    const heroH = photoHero?.offsetHeight ?? 0;
    const over = !!photoHero && state.study !== 'karamel' && y < heroH - 80 && menu.hidden;
    header.classList.toggle('over-photo', over);
    header.classList.toggle('solid', !over);
    header.classList.toggle('hide', y > lastY && y > vh && menu.hidden);
    lastY = y;
    const br = bookSection?.getBoundingClientRect();
    bookBar.classList.toggle('show', !noBar && y > vh * 0.6 && (!br || br.top > vh));
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  document.addEventListener('pure:study', onScroll);

  applyTexts();
  drawCartCount();
  onScroll();
}

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('studie');
  if (state.lang === 'nl') u.searchParams.delete('lang');
  else u.searchParams.set('lang', state.lang);
  history.replaceState(null, '', u);
}

export const pageName = page;
export { onFrame, scroll, clamp, REDUCED };
