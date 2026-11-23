// Pure Clinics website, second round: three palettes in light brown and bordeaux, seven languages, every section the meeting of November 2026 asked for.
import { logoSvg } from './logo.js';
import { LANGS, LANG_NAMES, STRINGS } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const params = new URLSearchParams(location.search);
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/* ---------- Study and language ---------- */

const STUDIES = ['creme', 'karamel', 'bordeaux'];
const HERO = { creme: 'c-web81-hero', karamel: 'c-mature-hero', bordeaux: 'c-up-hero' };
const THEME = { creme: '#f7f3ec', karamel: '#f3ece2', bordeaux: '#f6f1ea' };
const pickFrom = (list, ...values) => values.find((v) => list.includes(v)) ?? list[0];

let study = pickFrom(STUDIES, params.get('studie'), store.get('pure-web-study'));
let lang = pickFrom(LANGS, params.get('lang'), store.get('pure-web-lang'));

const S = (key, vars = {}) => {
  let s = STRINGS[lang]?.[key] ?? STRINGS.nl[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
};
const L = (text) => (text ? (text[lang] ?? text.nl ?? '') : '');
const LOCALE = { nl: 'nl-NL', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ar: 'ar-u-nu-latn' };
const money = (n) =>
  new Intl.NumberFormat(LOCALE[lang], { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
const priceLine = (t) => (t.priceFrom === 0 ? S('free') : S('from', { p: money(t.priceFrom) }));
const appUrl = (path) => `../app/${path}?lang=${lang}`;
const photo = (key, small = true) => `img/${key}${small ? '-s' : ''}.webp`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const data = await fetch('data/pure.json').then((r) => r.json());
const treatments = data.treatments;
const byId = Object.fromEntries(treatments.map((t) => [t.id, t]));

/* ---------- Static pieces ---------- */

$$('[data-logo]').forEach((el) => (el.innerHTML = logoSvg()));

const LOGOS = {
  obagi: 2.34,
  'zo-skin-health': 2.77,
  'synergie-skin': 7.38,
  skinpen: 2.96,
  alma: 2.69,
  picoway: 1.95,
  tixel: 3.28,
  'sure-medical': 3.05,
  kp: 3.66,
  nvh: 2.24,
  rie: 1.3,
};
const LOGO_NAMES = {
  obagi: 'Obagi Medical',
  'zo-skin-health': 'ZO Skin Health',
  'synergie-skin': 'Synergie Skin',
  skinpen: 'SkinPen',
  alma: 'Alma',
  picoway: 'PicoWay',
  tixel: 'Tixel',
  'sure-medical': 'SURE Medical',
  kp: 'Kwaliteitsregister Paramedici',
  nvh: 'Nederlandse Vereniging van Huidtherapeuten',
  rie: 'RIE Specialist',
};
function setMask(el, name) {
  el.style.setProperty('--m', `url("${new URL(`img/logos/${name}.png`, location.href).href}")`);
  el.style.setProperty('--ratio', LOGOS[name]);
  if (LOGOS[name] > 5) el.style.height = '18px';
}
$$('[data-mask]').forEach((el) => setMask(el, el.dataset.mask));

const brandTrack = $('#brand-track');
const brandItems = Object.keys(LOGOS)
  .map((name) => `<li><i class="mask" data-brand="${name}"></i><span class="sr">${LOGO_NAMES[name]}</span></li>`)
  .join('');
brandTrack.innerHTML = brandItems + brandItems.replaceAll('<li>', '<li aria-hidden="true">');
$$('[data-brand]', brandTrack).forEach((el) => setMask(el, el.dataset.brand));

const langSelect = $('#lang');
langSelect.innerHTML = LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');

/* ---------- Words that rise line by line, and a statement that lights up word by word ---------- */

function splitWords(el, className) {
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
function watch(scope = document) {
  $$('.rise, .lines, .unveil, .card', scope).forEach((el) => {
    if (el.classList.contains('in')) return;
    if (el.classList.contains('rise') && !el.style.getPropertyValue('--d')) {
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('rise'));
      el.style.setProperty('--d', `${Math.max(0, sibs.indexOf(el)) * 90}ms`);
    }
    revealer.observe(el);
  });
}

/* ---------- Texts ---------- */

function applyTexts() {
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = S('pageTitle');
  $$('[data-t]').forEach((el) => {
    const v = S(el.dataset.t);
    if (el.hasAttribute('data-html')) el.innerHTML = v;
    else el.textContent = v;
  });
  $$('.lines').forEach((el) => {
    splitWords(el, 'wd');
    if (revealed.has(el.id)) el.classList.add('in');
  });
  const statement = $('.statement');
  splitWords(statement, 'w');
  statementWords = $$('.w', statement);
  langSelect.value = lang;
  langSelect.setAttribute('aria-label', S('language'));
  $$('[data-book]').forEach((a) => (a.href = appUrl('afspraak/consult')));
  $$('[data-app]').forEach((a) => {
    a.dataset.path ??= a.getAttribute('href').replace('../app/', '');
    a.href = appUrl(a.dataset.path);
  });
  $$('#car-prev, #rev-prev').forEach((b) => b.setAttribute('aria-label', S('prev')));
  $$('#car-next, #rev-next').forEach((b) => b.setAttribute('aria-label', S('next')));
  $('#sheet-close').setAttribute('aria-label', S('close'));
  $('#compare-handle').setAttribute('aria-label', S('compareLabel'));
  $('#studies-note').textContent = S('study' + study[0].toUpperCase() + study.slice(1));
  $('#studies-toggle').setAttribute('aria-label', S(studies.classList.contains('collapsed') ? 'expand' : 'collapse'));
}
const revealed = new Set();
let statementWords = [];

/* ---------- Highlights and treatment cards ---------- */

const HIGHLIGHTS = ['laser', 'acne', 'pigment'];
const CATEGORIES = ['all', 'removal', 'conditions', 'skin', 'hair'];
let category = 'all';

function renderTreatments() {
  $('#highlights').innerHTML = HIGHLIGHTS.map((id) => {
    const t = byId[id];
    return `<div class="rise"><h3>${esc(L(t.name))}</h3><p>${esc(L(t.description))}</p><button type="button" data-open="${id}">${S('readMore')}</button></div>`;
  }).join('');
  $('#filters').innerHTML = CATEGORIES.map(
    (c) => `<button type="button" role="tab" data-cat="${c}" aria-selected="${c === category}">${S(c === 'all' ? 'catAll' : 'cat_' + c)}</button>`,
  ).join('');
  $('#cards').innerHTML = treatments
    .map(
      (t) => `<li class="card" data-cat="${t.category}">
        <button type="button" data-open="${t.id}">
          <figure><img src="${photo(t.photo)}" alt="" loading="lazy" /></figure>
          <h3>${esc(L(t.name))}</h3>
          <p>${esc(L(t.description))}</p>
          <span class="card-meta"><span>${priceLine(t)} · ${S('minutes', { m: t.minutes })}</span><b>${S('readMore')} ${lang === 'ar' ? '←' : '→'}</b></span>
        </button>
      </li>`,
    )
    .join('');
  filterCards(false);
  watch($('#behandelingen'));
}

function filterCards(animate = true) {
  let n = 0;
  $$('#cards .card').forEach((card) => {
    const show = category === 'all' || card.dataset.cat === category || card.dataset.cat === 'consult';
    card.hidden = !show;
    if (show && animate) {
      card.classList.remove('in');
      card.style.setProperty('--d', `${Math.min(n, 8) * 60}ms`);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
    }
    if (show) n++;
  });
  $$('#filters button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cat === category)));
}

$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  category = b.dataset.cat;
  filterCards();
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-open]');
  if (b) openSheet(b.dataset.open);
});

/* ---------- Treatment sheet: everything the clinic tells about one treatment ---------- */

const sheet = $('#sheet');
function openSheet(id) {
  const t = byId[id];
  if (!t) return;
  const i = t.info ?? {};
  $('#sheet-img').src = photo(t.photo, false);
  const facts = [
    i.sessions && [S('sessions'), L(i.sessions)],
    i.interval && [S('interval'), L(i.interval)],
    i.downtime && [S('downtime'), L(i.downtime)],
    [S('duration'), S('minutes', { m: t.minutes })],
    [S('price'), priceLine(t)],
  ].filter(Boolean);
  const cat = t.category === 'consult' ? S('cat_consult') : S('cat_' + t.category);
  $('#sheet-body').innerHTML = `
    <p class="eyebrow">${cat}</p>
    <h2 class="title" id="sheet-title">${esc(L(t.name))}</h2>
    ${t.insurable ? `<span class="insured">${S('insurable')}</span>` : ''}
    <p class="sheet-intro">${esc(L(i.intro) || L(t.description))}</p>
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${i.how ? `<h3>${S('howH')}</h3><p>${esc(L(i.how))}</p>` : ''}
    ${i.results ? `<h3>${S('resultH')}</h3><p>${esc(L(i.results))}</p>` : ''}
    ${i.aftercare?.length ? `<h3>${S('aftercareH')}</h3><ul>${i.aftercare.map((a) => `<li>${esc(L(a))}</li>`).join('')}</ul>` : ''}
    ${t.ba.length ? `<h3>${S('baH')}</h3><div class="sheet-ba">${t.ba.map((k) => `<img src="img/${k}.webp" alt="" loading="lazy" />`).join('')}</div>` : ''}
    ${
      i.faq?.length
        ? `<h3>${S('faqH')}</h3><div class="sheet-faq">${i.faq.map((f) => `<details><summary>${esc(L(f.q))}</summary><p>${esc(L(f.a))}</p></details>`).join('')}</div>`
        : ''
    }
    <div class="sheet-cta">
      <a class="btn btn-solid" href="${appUrl('afspraak/' + t.id)}">${t.id === 'consult' ? S('ctaIntakePlan') : S('bookThis')}</a>
      ${t.id === 'consult' ? '' : `<a class="btn btn-line" href="${appUrl('afspraak/consult')}">${S('ctaIntake')}</a>`}
      <span class="price-from">${priceLine(t)}</span>
    </div>`;
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  $('.sheet-inner', sheet).scrollTop = 0;
  if (!sheet.open) sheet.showModal();
}
$('#sheet-close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) sheet.close();
});

/* ---------- Before and after ---------- */

const RESULT_ORDER = ['acne', 'pigment', 'couperose', 'prx', 'sylfirm', 'skinpen', 'ipl', 'xlhair', 'peel', 'legveins', 'tattoo'];
const results = [];
const seenBa = new Set();
// Two per treatment for the first four, one for the rest: twelve pictures, not twenty-six.
RESULT_ORDER.forEach((id, n) => {
  for (const key of (byId[id]?.ba ?? []).slice(0, n < 4 ? 2 : 1)) if (!seenBa.has(key) && seenBa.add(key)) results.push({ key, id });
});
let resultIndex = 0;
const compare = $('#compare');
const handle = $('#compare-handle');

function renderResults() {
  $('#compare-pick').innerHTML = results
    .map((r, i) => `<button type="button" role="option" data-r="${i}" aria-selected="${i === resultIndex}" aria-label="${esc(L(byId[r.id].name))}"><img src="img/${r.key}-na.webp" alt="" loading="lazy" /></button>`)
    .join('');
  showResult(resultIndex);
}
function showResult(i) {
  resultIndex = i;
  const r = results[i];
  $('#compare-na').src = `img/${r.key}-na.webp`;
  $('.compare-voor img').src = `img/${r.key}-voor.webp`;
  $('#compare-caption').textContent = L(byId[r.id].name);
  $$('#compare-pick button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.r === i)));
}
function setSplit(v) {
  v = clamp(v, 0.02, 0.98);
  compare.style.setProperty('--split', `${v * 100}%`);
  handle.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  split = v;
}
let split = 0.5;
$('#compare-pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]');
  if (b) showResult(+b.dataset.r);
});
let dragging = false;
const fromEvent = (e) => {
  const r = compare.getBoundingClientRect();
  return (e.clientX - r.left) / r.width;
};
compare.addEventListener('pointerdown', (e) => {
  dragging = true;
  compare.setPointerCapture(e.pointerId);
  setSplit(fromEvent(e));
});
compare.addEventListener('pointermove', (e) => dragging && setSplit(fromEvent(e)));
compare.addEventListener('pointerup', () => (dragging = false));
handle.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') setSplit(split - 0.05);
  if (e.key === 'ArrowRight') setSplit(split + 0.05);
});
new IntersectionObserver(
  ([e], obs) => {
    if (!e.isIntersecting || REDUCED) return;
    obs.disconnect();
    const keys = [0.5, 0.18, 0.82, 0.5];
    const start = performance.now();
    const step = (now) => {
      const p = clamp((now - start) / 2600);
      const seg = Math.min(2, Math.floor(p * 3));
      const local = p * 3 - seg;
      const ease = local < 0.5 ? 2 * local * local : 1 - (-2 * local + 2) ** 2 / 2;
      if (!dragging) setSplit(keys[seg] + (keys[seg + 1] - keys[seg]) * ease);
      if (p < 1 && !dragging) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
  { threshold: 0.5 },
).observe(compare);

/* ---------- Carousels: products and reviews ---------- */

function carousel({ track, prev, next, dots, perView, auto }) {
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
  const box = track.parentElement;
  box.addEventListener('pointerenter', () => clearInterval(timer));
  box.addEventListener('pointerleave', play);
  box.addEventListener('focusin', () => clearInterval(timer));
  let sx = null;
  box.addEventListener('pointerdown', (e) => (sx = e.clientX));
  box.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    if (Math.abs(dx) > 40) go(index + ((dx < 0) !== (root.dir === 'rtl') ? 1 : -1));
    sx = null;
  });
  addEventListener('resize', drawDots);
  play();
  return { refresh: drawDots };
}

const RENDER = {
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
const wide = () => innerWidth > 1100;
const mid = () => innerWidth > 520;

function renderProducts() {
  $('#carousel-track').innerHTML = data.products
    .map(
      (p) => `<article class="product">
        <a href="${appUrl('product/' + p.id)}" title="${S('viewInApp')}">
          <figure><img src="img/products/${RENDER[p.id] ?? 'jar'}.webp" alt="" loading="lazy" /></figure>
          <p class="brand-name">${esc(p.brand ?? 'Pure Clinics')}</p>
          <h3>${esc(L(p.name))}</h3>
          <p class="price">${money(p.price)}</p>
        </a>
      </article>`,
    )
    .join('');
  productCarousel.refresh();
}
const productCarousel = carousel({
  track: $('#carousel-track'),
  prev: $('#car-prev'),
  next: $('#car-next'),
  dots: $('#car-dots'),
  perView: () => (wide() ? 3 : mid() ? 2 : 1),
  auto: 4800,
});

// Real Google reviews of Pure Clinics Nijmegen, as shown on Google Maps on 14 November 2026 (texts cut where Google cuts them).
const REVIEWS = [
  { name: 'Tessa', months: 5, text: 'Super tevreden klant hier! Nu drie laserbehandelingen gehad voor een tatoeage, al een heel fijn resultaat tot dusver. Maar bovenal heel blij met de vriendelijkheid, kundigheid en goede uitleg en zorg van Loubna! Altijd vrolijk de deur uit :)' },
  { name: 'Lisa J.', months: 5, text: 'Ik word geholpen door Loubna voor mijn laserontharing en ik ben ontzettend tevreden! Inmiddels zit ik in de onderhoudsfase en het resultaat is echt fantastisch. Ik had veel eerder moeten beginnen.' },
  { name: 'Samantha F.', months: 4, text: 'Hele fijne kliniek! Super lieve meiden stuk voor stuk. Ik word altijd warm ontvangen en goed geïnformeerd over mijn behandeling. Qua prijs/kwaliteit verhouding, dikke prima!' },
  { name: 'D.', months: 4, text: 'Vandaag een Glow-behandeling gehad bij Nadila en ik ben ontzettend tevreden met het resultaat. Nadila is erg vriendelijk, professioneel en stelt je direct op je gemak. Ze nam de tijd om alles duidelijk uit te leggen en werkte zorgvuldig.' },
  { name: 'Julia S.', months: 5, text: 'Heel blij met mijn ervaringen hier. De behandeling wordt steeds goed afgestemd op mijn wensen en vragen. Voorafgaand aan de start van de behandeling wordt een intakegesprek ingepland, waardoor je goed geïnformeerd aan de behandelingen …' },
];
function renderReviews() {
  $('#review-track').innerHTML = REVIEWS.map(
    (r) => `<article class="review">
      <header><span class="initial" aria-hidden="true">${r.name[0]}</span><span class="who">${esc(r.name)}<span class="when">${S('monthsAgo', { n: r.months })}</span></span><span class="g-logo" aria-hidden="true"></span></header>
      <span class="stars" aria-label="5/5">★★★★★</span>
      <blockquote lang="nl" dir="ltr">${esc(r.text)}</blockquote>
      ${lang === 'nl' ? '' : `<p class="orig">${S('originalDutch')}</p>`}
    </article>`,
  ).join('');
  reviewCarousel.refresh();
}
const reviewCarousel = carousel({
  track: $('#review-track'),
  prev: $('#rev-prev'),
  next: $('#rev-next'),
  dots: $('#rev-dots'),
  perView: () => (innerWidth > 860 ? 2 : 1),
  auto: 6500,
});

/* ---------- Team ---------- */

// The team as pureclinics.nl shows it, with the clinic's own portraits.
const TEAM = [
  { id: 'maud', name: 'Maud', role: 'roleTherapist' },
  { id: 'margot', name: 'Margot', role: 'roleTherapist' },
  { id: 'nadila', name: 'Nadila', role: 'roleTherapist' },
  { id: 'sam', name: 'Sam', role: 'roleTherapist' },
  { id: 'husna', name: 'Husna', role: 'roleReception' },
  { id: 'hawin', name: 'Hawin', role: 'roleBeauty' },
];
function renderTeam() {
  $('#people').innerHTML = TEAM.map(
    (p, i) => `<li class="person rise" style="--d:${(i % 3) * 110}ms"><figure><img src="img/team/${p.id}.webp" alt="${p.name}" loading="lazy" /></figure><h3>${p.name}</h3><p>${S(p.role)}</p></li>`,
  ).join('');
  watch($('#team'));
}

/* ---------- FAQ: the clinic's own questions per treatment, grouped ---------- */

const FAQ_GROUPS = [
  { key: 'faqIntake', ids: ['consult'] },
  { key: 'faqLaser', ids: ['laser', 'epilation'] },
  { key: 'faqConditions', ids: ['acne', 'pigment', 'couperose', 'legveins', 'eyes', 'tattoo', 'ipl'] },
  { key: 'faqSkin', ids: ['skinpen', 'sylfirm', 'tixel', 'prx', 'skinbooster', 'exosomes', 'pdrn', 'tca', 'peel', 'deepclean', 'facial', 'massage'] },
  { key: 'faqHair', ids: ['xlhair', 'camouflage'] },
];
let faqGroup = 'faqAll';
function faqEntries() {
  const list = [];
  for (const g of FAQ_GROUPS)
    for (const id of g.ids) for (const f of byId[id]?.info?.faq ?? []) list.push({ group: g.key, id, q: L(f.q), a: L(f.a), tag: L(byId[id].name) });
  list.push({ group: 'faqGeneral', q: S('faqInsuranceQ'), a: S('q2Body'), tag: S('faqGeneral') });
  list.push({ group: 'faqGeneral', q: S('faqWhereQ'), a: S('faqWhereA'), tag: S('faqGeneral') });
  return list;
}
function renderFaq() {
  const tabs = ['faqAll', ...FAQ_GROUPS.map((g) => g.key), 'faqGeneral'];
  $('#faq-filters').innerHTML = tabs.map((k) => `<button type="button" role="tab" data-g="${k}" aria-selected="${k === faqGroup}">${S(k)}</button>`).join('');
  const all = faqEntries();
  let shown;
  if (faqGroup === 'faqAll') {
    const per = {};
    shown = all.filter((f) => (per[f.group] = (per[f.group] ?? 0) + 1) <= 2);
  } else shown = all.filter((f) => f.group === faqGroup);
  $('#faq-list').innerHTML = shown
    .map(
      (f) => `<details><summary><small>${esc(f.tag)}</small><span>${esc(f.q)}</span></summary><div class="faq-answer"><p>${esc(f.a)}</p>${
        f.id ? `<button type="button" class="btn btn-line" data-open="${f.id}">${S('faqMore', { t: esc(f.tag) })}</button>` : ''
      }</div></details>`,
    )
    .join('');
}
$('#faq-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-g]');
  if (!b) return;
  faqGroup = b.dataset.g;
  renderFaq();
});

/* ---------- Footer: both clinics with their hours ---------- */

function renderPlaces() {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long' });
  const dayName = (d) => fmt.format(new Date(2026, 10, 15 + d)); // 15 November 2026 is a Sunday
  const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  $('#footer-places').innerHTML = data.locations
    .map(
      (l) => `<div><p class="footer-kicker">${l.city}</p><p>${esc(l.address)}<br /><a href="tel:${l.phone.replace(/\s/g, '')}">${l.phone}</a></p>
      <table aria-label="${S('hours')}">${[1, 2, 3, 4, 5, 6, 0]
        .map((d) => `<tr><td>${dayName(d)}</td><td>${l.hours[d] ? `${hh(l.hours[d].open)} – ${hh(l.hours[d].close)}` : S('closed')}</td></tr>`)
        .join('')}</table></div>`,
    )
    .concat(
      `<div><p class="footer-kicker">Contact</p><p><a href="mailto:${data.clinic.email}">${data.clinic.email}</a><br /><a href="tel:+31246792236">${data.clinic.phone}</a></p></div>`,
    )
    .join('');
}

/* ---------- Everything that follows the language ---------- */

function renderAll() {
  applyTexts();
  renderTreatments();
  renderResults();
  renderProducts();
  renderReviews();
  renderTeam();
  renderFaq();
  renderPlaces();
  watch();
}

langSelect.addEventListener('change', () => {
  lang = langSelect.value;
  store.set('pure-web-lang', lang);
  $$('.lines.in').forEach((el) => revealed.add(el.id));
  renderAll();
  syncUrl();
});

/* ---------- Studies ---------- */

const studies = $('#studies');
const heroImg = $('#hero-img');
function setStudy(next, first = false) {
  study = next;
  root.dataset.study = study;
  store.set('pure-web-study', study);
  $('meta[name="theme-color"]').content = THEME[study];
  $$('.studies-buttons button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.study === study)));
  $('#studies-note').textContent = S('study' + study[0].toUpperCase() + study.slice(1));
  const src = `img/close/${HERO[study]}.webp`;
  if (first) heroImg.src = src;
  else if (!heroImg.src.endsWith(src)) {
    heroImg.style.opacity = '0';
    setTimeout(() => {
      heroImg.src = src;
      heroImg.onload = () => (heroImg.style.opacity = '1');
    }, 300);
  }
  syncUrl();
  onScroll();
}
$('.studies-buttons').addEventListener('click', (e) => {
  const b = e.target.closest('[data-study]');
  if (b) setStudy(b.dataset.study);
});
function collapseStudies(c) {
  studies.classList.toggle('collapsed', c);
  $('#studies-toggle').textContent = c ? '+' : '–';
  $('#studies-toggle').setAttribute('aria-expanded', String(!c));
  $('#studies-toggle').setAttribute('aria-label', S(c ? 'expand' : 'collapse'));
}
$('#studies-toggle').addEventListener('click', () => collapseStudies(!studies.classList.contains('collapsed')));
// On a phone the panel starts folded, so it does not cover the page.
if (innerWidth < 860) collapseStudies(true);
function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('studie', study);
  if (lang === 'nl') u.searchParams.delete('lang');
  else u.searchParams.set('lang', lang);
  history.replaceState(null, '', u);
}

/* ---------- Header, menu, booking bar ---------- */

const header = $('#header');
const hero = $('.hero');
const menu = $('#menu');
const menuButton = $('#menu-button');
function setMenu(open) {
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  header.classList.toggle('solid', open || scrollY > hero.offsetHeight - 80);
}
menuButton.addEventListener('click', () => setMenu(menu.hidden));
menu.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));

const navLinks = $$('.nav a');
const navObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  },
  { rootMargin: '-45% 0px -50% 0px' },
);
navLinks.forEach((a) => {
  const s = $(a.getAttribute('href'));
  if (s) navObserver.observe(s);
});

/* ---------- Scroll-linked motion ---------- */

const statement = $('.statement');
const drift = $('#drift');
const driftTrack = $('.drift-track');
const bookBar = $('#book-bar');
const bookSection = $('.book');
let lastY = scrollY;
let driftNow = 0;
let driftTarget = 0;

function onScroll() {
  const y = scrollY;
  const vh = innerHeight;
  const heroH = hero.offsetHeight;
  const photoBehind = study !== 'karamel' && y < heroH - 80;
  header.classList.toggle('over-photo', photoBehind && menu.hidden);
  header.classList.toggle('solid', !photoBehind || !menu.hidden);
  header.classList.toggle('hide', y > lastY && y > vh && menu.hidden);
  lastY = y;

  if (!REDUCED && y < heroH) root.style.setProperty('--hero-shift', `${y * 0.22}px`);

  const r = statement.getBoundingClientRect();
  const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3));
  const n = statementWords.length;
  statementWords.forEach((w, i) => w.style.setProperty('--o', REDUCED ? 1 : clamp(p * (n + 2) - i, 0.16, 1)));

  const dr = drift.getBoundingClientRect();
  const dp = clamp((vh - dr.top) / (vh + dr.height));
  driftTarget = -dp * Math.max(0, driftTrack.scrollWidth - innerWidth);

  const br = bookSection.getBoundingClientRect();
  bookBar.classList.toggle('show', y > heroH * 0.8 && br.top > vh);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);

(function loop() {
  driftNow += (driftTarget - driftNow) * (REDUCED ? 1 : 0.08);
  driftTrack.style.setProperty('--drift', `${driftNow.toFixed(1)}px`);
  requestAnimationFrame(loop);
})();

/* ---------- Start ---------- */

setStudy(study, true);
renderAll();
onScroll();
const ready = () => requestAnimationFrame(() => document.body.classList.add('loaded'));
if (heroImg.complete) ready();
else heroImg.addEventListener('load', ready, { once: true });
