// Pure Clinics website, second round: three palettes in cream and walnut brown, seven languages, every section the meeting of November 2026 asked for.
import { logoSvg } from './logo.js';
import { LANGS, LANG_NAMES, STRINGS } from './i18n.js';
import { TEAM } from './team-data.js';
// The first site's parts (October 2026), each after a site that won in 2026.
import { onFrame, scroll, pointer, FINE, lerp, smoothstep, transition } from './fx/core.js';
import { startHeroGL } from './fx/gl.js';
import { buildLogoFromSquares } from './fx/loader.js';
import { startToc } from './fx/toc.js';
import { startParticles } from './fx/particles.js';
import { startLoupe } from './fx/loupe.js';
import { startDrop } from './fx/drop.js';
import { startLayers } from './fx/layers.js';
import { startFilm } from './fx/film.js';
import { startMirror } from './fx/mirror.js';

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

const STUDIES = ['creme', 'karamel', 'walnoot'];
const HERO = { creme: 'c-web81-hero', karamel: 'c-mature-hero', walnoot: 'c-up-hero' };
const THEME = { creme: '#f7f3ec', karamel: '#f3ece2', walnoot: '#f6f1ea' };
const pickFrom = (list, ...values) => values.find((v) => list.includes(v)) ?? list[0];

// The third palette was Bordeaux until 23 Nov 2026; old links and stored choices open Walnoot.
const renamed = (v) => (v === 'bordeaux' ? 'walnoot' : v);
let study = pickFrom(STUDIES, renamed(params.get('studie')), renamed(store.get('pure-web-study')));
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
  $$('[data-t-label]').forEach((el) => el.setAttribute('aria-label', S(el.dataset.tLabel)));
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

$('#filters')?.addEventListener('click', (e) => {
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
// Every member has their own page (team/<id>/); a walk-in film plays on hover where one exists.
function renderTeam() {
  $('#people').innerHTML = TEAM.map(
    (p, i) => `<li class="person rise" style="--d:${(i % 3) * 110}ms"><a href="team/${p.id}/?lang=${lang}" aria-label="${esc(S('teamSee', { name: p.name }))}"><figure><img src="img/team/${p.id}.webp" alt="${p.name}" loading="lazy" />${p.video ? `<video src="video/team/${p.id}.mp4" muted playsinline preload="none" aria-hidden="true"></video>` : ''}</figure><h3>${p.name}</h3><p>${S(p.role)}</p></a></li>`,
  ).join('');
  watch($('#team'));
}
$('#people').addEventListener('pointerover', (e) => {
  const v = e.target.closest('.person')?.querySelector('video');
  if (v && v.paused) {
    v.currentTime = 0;
    v.play().catch(() => {});
    v.closest('figure').classList.add('playing');
  }
});
$('#people').addEventListener('pointerout', (e) => {
  const li = e.target.closest('.person');
  if (!li || li.contains(e.relatedTarget)) return;
  const v = li.querySelector('video');
  if (v) {
    v.pause();
    v.closest('figure').classList.remove('playing');
  }
});

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


/* ---------- The first site's parts, back in this one ---------- */

const CONCERN_IDS = data.concerns.map((c) => c.id);
const concernName = (id) => S(`concern_${id}`);
const nameOf = (id) => (byId[id] ? L(byId[id].name) : id);

// Huidscan: tap what you recognise; the route lists the treatments named for most of your choices first.
const concernList = $('#concerns');
const picked = new Set();
function renderScan() {
  concernList.innerHTML = data.concerns
    .map(
      (c, i) => `<li class="concern">
        <button type="button" aria-pressed="${picked.has(c.id)}" data-id="${c.id}" data-photo="${c.photo}">
          <span class="idx">${String(i + 1).padStart(2, '0')}</span>
          <span class="name">${esc(concernName(c.id))}</span>
          <span class="tick" aria-hidden="true"></span>
        </button>
        <div class="concern-text"><p>${esc(L(c.text))}</p></div>
      </li>`,
    )
    .join('');
  renderRoute();
}
function renderRoute() {
  const score = new Map();
  for (const c of data.concerns) {
    if (!picked.has(c.id)) continue;
    c.treatments.forEach((id, rank) => byId[id] && score.set(id, (score.get(id) ?? 0) + 10 - rank));
  }
  const list = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => byId[id]);
  $('#route-empty').hidden = list.length > 0;
  $('#route-full').hidden = list.length === 0;
  $('#route-count').textContent = S(picked.size === 1 ? 'routeOne' : 'routeMany', { n: picked.size });
  $('#route-list').innerHTML = list
    .map(
      (t, i) => `<li class="route-item" style="--i:${i}">
        <button type="button" data-open="${t.id}" aria-label="${esc(L(t.name))}">
          <img src="${photo(t.photo)}" alt="" loading="lazy" />
          <span><strong>${esc(L(t.name))}</strong><small>${S('minutes', { m: t.minutes })}</small><span class="price">${priceLine(t)}</span></span>
        </button>
      </li>`,
    )
    .join('');
}
concernList.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  on ? picked.add(b.dataset.id) : picked.delete(b.dataset.id);
  renderRoute();
});
// The concern's photo follows the pointer and leans into the direction it moves.
const float = $('#scan-float');
const fp = { x: 0, y: 0, vx: 0 };
if (FINE) {
  concernList.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button[data-photo]');
    if (!b) return;
    float.firstElementChild.src = photo(b.dataset.photo);
    float.classList.add('on');
  });
  concernList.addEventListener('pointerleave', () => float.classList.remove('on'));
  onFrame(() => {
    if (!float.classList.contains('on')) {
      fp.x = pointer.x;
      fp.y = pointer.y;
      return;
    }
    const nx = lerp(fp.x, pointer.x + 150, 0.12);
    fp.vx = lerp(fp.vx, nx - fp.x, 0.2);
    fp.x = nx;
    fp.y = lerp(fp.y, pointer.y, 0.12);
    float.style.transform = `translate3d(${fp.x}px, ${fp.y}px, 0) translate(-50%, -50%) rotate(${clamp(fp.vx * 0.6, -12, 12)}deg)`;
  });
}

// Behandelkamers: a row that moves sideways while the page scrolls, and leans with the scroll speed.
const roomsSection = $('#behandelingen');
const roomsTrack = $('#rooms-track');
const ROOM_CATS = ['all', 'removal', 'conditions', 'skin', 'hair'];
let roomCat = 'all';
function renderRooms() {
  roomsTrack.innerHTML = treatments
    .filter((t) => t.id !== 'consult')
    .map(
      (t) => `<button type="button" class="room" data-open="${t.id}" data-cat="${t.category}"${roomCat !== 'all' && t.category !== roomCat ? ' hidden' : ''}>
        <div class="room-photo"><img src="${photo(t.photo)}" alt="" loading="lazy" /><span class="room-tag">${t.insurable ? S('insurable') : S('cat_' + t.category)}</span></div>
        <div class="room-meta"><span class="room-name">${esc(L(t.name))}</span><span class="room-price">${priceLine(t)}</span></div>
        <p class="room-desc">${esc(L(t.description))}</p>
      </button>`,
    )
    .join('');
  $('#rooms-filter').setAttribute('aria-label', S('roomsFilter'));
  $('#rooms-filter').innerHTML = ROOM_CATS.map(
    (c) => `<button type="button" class="chip" role="tab" aria-selected="${c === roomCat}" data-f="${c}">${S(c === 'all' ? 'catAll' : 'cat_' + c)}</button>`,
  ).join('');
  sizeRooms();
}
$('#rooms-filter').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  roomCat = chip.dataset.f;
  $$('#rooms-filter .chip').forEach((c) => c.setAttribute('aria-selected', String(c === chip)));
  transition(() => {
    $$('.room', roomsTrack).forEach((r) => (r.hidden = roomCat !== 'all' && r.dataset.cat !== roomCat));
    sizeRooms();
  });
  scroll.to(roomsSection.offsetTop, true);
});
let roomsTravel = 0;
function sizeRooms() {
  roomsTravel = Math.max(0, roomsTrack.scrollWidth - innerWidth);
  roomsSection.style.setProperty('--rooms-h', `${innerHeight + roomsTravel}px`);
}
const roomsTitle = $('#rooms-title');
let lean = 0;
let leanV = 0;
onFrame((_, y) => {
  const top = roomsSection.offsetTop;
  const p = roomsTravel ? clamp((y - top) / roomsTravel, 0, 1) : 0;
  const inside = y > top - innerHeight && y < top + roomsSection.offsetHeight;
  const target = inside && !REDUCED ? clamp(-scroll.velocity * 0.35, -6, 6) : 0;
  leanV += (target - lean) * 0.09;
  leanV *= 0.78;
  lean += leanV;
  roomsTrack.style.transform = `translate3d(${-p * roomsTravel * (root.dir === 'rtl' ? -1 : 1)}px, 0, 0) skewX(${lean.toFixed(2)}deg)`;
  roomsTitle.style.transform = `skewX(${(lean * 0.6).toFixed(2)}deg)`;
  $('#rooms-bar').parentElement.style.setProperty('--p', p.toFixed(4));
  if (inside) {
    for (const img of roomsTrack.querySelectorAll('.room:not([hidden]) img')) {
      const r = img.parentElement.getBoundingClientRect();
      img.style.setProperty('--px', `${((-(r.left + r.width / 2 - innerWidth / 2) / innerWidth) * 30).toFixed(1)}px`);
    }
  }
});
addEventListener('resize', () => sizeRooms());

// Prijskaart: every price on one card; a photo peeks out at the pointer.
function renderMenu() {
  $('#menu-card').innerHTML = ['consult', 'removal', 'conditions', 'skin', 'hair']
    .map(
      (cat) => `<div class="menu-group"><h3>${S('cat_' + cat)}</h3>${treatments
        .filter((t) => t.category === cat)
        .map(
          (t) => `<button type="button" class="menu-row" data-open="${t.id}" data-photo="${t.photo}">
            <span class="n">${esc(L(t.name))}</span>${t.insurable ? `<span class="v">${S('insurable')}</span>` : ''}<span class="dots"></span><span class="p">${priceLine(t)}</span>
          </button>`,
        )
        .join('')}</div>`,
    )
    .join('');
}
const peek = $('#price-peek');
const pk = { x: 0, y: 0 };
if (FINE) {
  $('#menu-card').addEventListener('pointerover', (e) => {
    const row = e.target.closest('.menu-row');
    if (!row) return;
    peek.firstElementChild.src = photo(row.dataset.photo);
    peek.classList.add('on');
  });
  $('#menu-card').addEventListener('pointerleave', () => peek.classList.remove('on'));
  onFrame(() => {
    pk.x = lerp(pk.x, pointer.x + 140, 0.14);
    pk.y = lerp(pk.y, pointer.y - 40, 0.14);
    peek.style.transform = `translate3d(${pk.x}px, ${pk.y}px, 0) translate(-50%, -50%) scale(${peek.classList.contains('on') ? 1 : 0.4})`;
  });
}

// The words in the sentence are the switch: "voor" shows the photo before, "na" the one after.
let glideAnim = 0;
$('#era-switch').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-side]');
  if (!b) return;
  $$('#era-switch button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  const from = split;
  const to = b.dataset.side === 'voor' ? 0.98 : 0.02;
  const start = performance.now();
  cancelAnimationFrame(glideAnim);
  const step = (now) => {
    const t = Math.min((now - start) / (REDUCED ? 1 : 900), 1);
    setSplit(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) glideAnim = requestAnimationFrame(step);
  };
  glideAnim = requestAnimationFrame(step);
});

// Ticker: drifts on its own, speeds up and leans with the scroll.
const ticker = $('#ticker');
ticker.innerHTML += ticker.innerHTML.replaceAll('<span', '<span aria-hidden="true"');
let tickerX = 0;
let tickerDir = -1;
onFrame(() => {
  const v = scroll.velocity;
  if (Math.abs(v) > 0.4) tickerDir = v > 0 ? -1 : 1;
  tickerX += tickerDir * (0.55 + Math.min(Math.abs(v) * 0.35, 14));
  const half = ticker.scrollWidth / 2;
  if (tickerX <= -half) tickerX += half;
  if (tickerX > 0) tickerX -= half;
  ticker.style.transform = `translate3d(${tickerX}px,0,0) skewX(${clamp(-v * 0.25, -8, 8)}deg)`;
});

// The booking button rises out of its rings as the last section comes in.
const ringCta = $('#ring-cta');
onFrame(() => {
  const r = ringCta.getBoundingClientRect();
  if (r.top > innerHeight || r.bottom < 0) return;
  const p = smoothstep(innerHeight, innerHeight * 0.55, r.top);
  ringCta.style.transform = `translate3d(0, ${((1 - p) * 60).toFixed(1)}px, 0) scale(${(0.9 + p * 0.1).toFixed(3)})`;
});

// Framed index, particles, loupe, serum drop, skin layers, film and mirror.
const namesNow = new Proxy({}, { get: (_, id) => concernName(id) });
startToc();
startParticles(concernList, namesNow);
const relabelLoupe = startLoupe(S, nameOf);
startDrop();
const relabelLayers = startLayers(byId, S, nameOf);
const relabelFilm = startFilm(S);
startMirror();
function relabelFx() {
  relabelLoupe?.();
  relabelLayers?.();
  relabelFilm?.();
}
let heroGL = null;

/* ---------- Everything that follows the language ---------- */

function renderAll() {
  applyTexts();
  renderScan();
  renderRooms();
  renderMenu();
  relabelFx();
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
      heroImg.onload = () => {
        heroImg.style.opacity = '1';
        heroGL?.setImage(heroImg);
      };
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

// The loader counts while the fonts and the first photo arrive; the wordmark builds itself out of squares, then the
// photo appears as dots that sharpen (after Lama Lama) and takes the light of the hour in Nijmegen (after Bruno Simon).
const loader = $('#loader');
const loaderCount = $('#loader-count');
const arrived = Promise.all([document.fonts.ready, heroImg.decode().catch(() => {})]);
let loadedAll = false;
arrived.then(() => (loadedAll = true));
const squares = REDUCED ? Promise.resolve() : buildLogoFromSquares($('.loader-logo')).catch(() => $('.loader-logo').classList.add('crisp'));
if (REDUCED) $('.loader-logo').classList.add('crisp');
const t0 = performance.now();
await new Promise((resolve) => {
  const step = (now) => {
    const t = Math.min((now - t0) / (REDUCED ? 200 : 1500), 1);
    const n = Math.round((loadedAll ? t : Math.min(t, 0.86)) * 100);
    loaderCount.textContent = String(n);
    if (n >= 100) resolve();
    else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
await squares;
heroGL = await startHeroGL($('#hero-gl'), heroImg, pointer, onFrame).catch(() => null);
loader.classList.add('done');
heroGL?.reveal();
ready();
setTimeout(() => loader.remove(), 1400);
sizeRooms();
