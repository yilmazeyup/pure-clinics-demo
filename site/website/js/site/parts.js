// The sections of the site, each on its own: a page calls the ones it shows, and each one does nothing when its
// element is not on the page. Most came from the single long page of Nov 2026; links now go to the treatment's own page.
import { FINE, lerp, onFrame, pointer, scroll, smoothstep, transition } from '../fx/core.js';
import { startDrop } from '../fx/drop.js';
import { startFilm } from '../fx/film.js';
import { startLayers } from '../fx/layers.js';
import { startLoupe } from '../fx/loupe.js';
import { startMirror } from '../fx/mirror.js';
import { startParticles } from '../fx/particles.js';
import { TEAM } from '../team-data.js';
import { track } from './track.js';
import {
  $,
  $$,
  BASE,
  L,
  REDUCED,
  S,
  activeCampaigns,
  arrow,
  bookLink,
  byId,
  carousel,
  clamp,
  data,
  esc,
  img,
  link,
  money,
  nameOf,
  onLang,
  photo,
  priceLine,
  root,
  splitWords,
  state,
  treatmentLink,
  treatments,
  untilLine,
  watch,
} from './core.js';

/* ---------- Brands and quality marks ---------- */

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
export function setMask(el, name) {
  el.style.setProperty('--m', `url("${img(`logos/${name}.png`)}")`);
  el.style.setProperty('--ratio', LOGOS[name]);
  if (LOGOS[name] > 5) el.style.height = '18px';
}
export function brands() {
  $$('[data-mask]').forEach((el) => setMask(el, el.dataset.mask));
  const track = $('#brand-track');
  if (!track) return;
  const items = Object.keys(LOGOS)
    .map((name) => `<li><i class="mask" data-brand="${name}"></i><span class="sr">${LOGO_NAMES[name]}</span></li>`)
    .join('');
  track.innerHTML = items + items.replaceAll('<li>', '<li aria-hidden="true">');
  $$('[data-brand]', track).forEach((el) => setMask(el, el.dataset.brand));
}

/* ---------- Ticker: drifts on its own, speeds up and leans with the scroll ---------- */

export function ticker() {
  const el = $('#ticker');
  if (!el) return;
  let x = 0;
  let dir = -1;
  const double = () => {
    $$('[aria-hidden="true"].dup', el).forEach((n) => n.remove());
    [...el.children].forEach((n) => {
      const c = n.cloneNode(true);
      c.classList.add('dup');
      c.setAttribute('aria-hidden', 'true');
      el.append(c);
    });
  };
  onLang(double);
  onFrame(() => {
    const v = scroll.velocity;
    if (Math.abs(v) > 0.4) dir = v > 0 ? -1 : 1;
    x += dir * (0.55 + Math.min(Math.abs(v) * 0.35, 14));
    const half = el.scrollWidth / 2;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    el.style.transform = `translate3d(${x}px,0,0) skewX(${clamp(-v * 0.25, -8, 8)}deg)`;
  });
}

/* ---------- The welcome statement lights up word by word ---------- */

export function statement() {
  const el = $('.statement');
  if (!el) return;
  let words = [];
  onLang(() => {
    splitWords(el, 'w');
    words = $$('.w', el);
  });
  onFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > innerHeight + 200) return;
    const p = clamp((innerHeight * 0.82 - r.top) / (r.height + innerHeight * 0.3));
    const n = words.length;
    words.forEach((w, i) => w.style.setProperty('--o', REDUCED ? 1 : clamp(p * (n + 2) - i, 0.16, 1)));
  });
}

/* ---------- Close-ups drift sideways with the scroll ---------- */

export function drift() {
  const box = $('#drift');
  const track = $('.drift-track');
  if (!box || !track) return;
  let now = 0;
  onFrame(() => {
    const r = box.getBoundingClientRect();
    const p = clamp((innerHeight - r.top) / (innerHeight + r.height));
    const target = -p * Math.max(0, track.scrollWidth - innerWidth);
    now += (target - now) * (REDUCED ? 1 : 0.08);
    track.style.setProperty('--drift', `${now.toFixed(1)}px`);
  });
}

/* ---------- Huidscan: tap what you recognise; the route lists the treatments named for most choices first ---------- */

export function scan() {
  const list = $('#concerns');
  if (!list) return;
  const picked = new Set();
  const concernName = (id) => S(`concern_${id}`);
  const draw = () => {
    list.innerHTML = data.concerns
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
    route();
  };
  const route = () => {
    const score = new Map();
    for (const c of data.concerns) {
      if (!picked.has(c.id)) continue;
      c.treatments.forEach((id, rank) => byId[id] && score.set(id, (score.get(id) ?? 0) + 10 - rank));
    }
    const chosen = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => byId[id]);
    $('#route-empty').hidden = chosen.length > 0;
    $('#route-full').hidden = chosen.length === 0;
    $('#route-count').textContent = S(picked.size === 1 ? 'routeOne' : 'routeMany', { n: picked.size });
    $('#route-list').innerHTML = chosen
      .map(
        (t, i) => `<li class="route-item" style="--i:${i}">
          <a href="${treatmentLink(t.id)}" aria-label="${esc(L(t.name))}">
            <img src="${photo(t.photo)}" alt="" loading="lazy" />
            <span><strong>${esc(L(t.name))}</strong><small>${S('minutes', { m: t.minutes })}</small><span class="price">${priceLine(t)}</span></span>
          </a>
        </li>`,
      )
      .join('');
    $('#route-cta').href = bookLink('consult');
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    on ? picked.add(b.dataset.id) : picked.delete(b.dataset.id);
    if (on) track('select_content', { content_type: 'concern', item_id: b.dataset.id });
    route();
  });
  onLang(draw);
  startParticles(list, new Proxy({}, { get: (_, id) => concernName(id) }));

  // The concern's photo follows the pointer and leans into the direction it moves.
  const float = $('#scan-float');
  if (FINE && float) {
    const fp = { x: 0, y: 0, vx: 0 };
    list.addEventListener('pointerover', (e) => {
      const b = e.target.closest('button[data-photo]');
      if (!b) return;
      float.firstElementChild.src = photo(b.dataset.photo);
      float.classList.add('on');
    });
    list.addEventListener('pointerleave', () => float.classList.remove('on'));
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
}

/* ---------- Behandelkamers: a row that moves sideways while the page scrolls, and leans with the scroll ---------- */

export function rooms() {
  const section = $('#kamers');
  const track = $('#rooms-track');
  if (!section || !track) return;
  const CATS = ['all', 'removal', 'conditions', 'skin', 'hair'];
  let cat = params().get('soort') && CATS.includes(params().get('soort')) ? params().get('soort') : 'all';
  let travel = 0;
  const size = () => {
    travel = Math.max(0, track.scrollWidth - innerWidth);
    section.style.setProperty('--rooms-h', `${innerHeight + travel}px`);
  };
  const draw = () => {
    track.innerHTML = treatments
      .filter((t) => t.id !== 'consult')
      .map(
        (t) => `<a class="room" href="${treatmentLink(t.id)}" data-cat="${t.category}"${cat !== 'all' && t.category !== cat ? ' hidden' : ''}>
          <div class="room-photo"><img src="${photo(t.photo)}" alt="" loading="lazy" /><span class="room-tag">${t.insurable ? S('insurable') : S('cat_' + t.category)}</span></div>
          <div class="room-meta"><span class="room-name">${esc(L(t.name))}</span><span class="room-price">${priceLine(t)}</span></div>
          <p class="room-desc">${esc(L(t.description))}</p>
        </a>`,
      )
      .join('');
    $('#rooms-filter').setAttribute('aria-label', S('roomsFilter'));
    $('#rooms-filter').innerHTML = CATS.map(
      (c) => `<button type="button" class="chip" role="tab" aria-selected="${c === cat}" data-f="${c}">${S(c === 'all' ? 'catAll' : 'cat_' + c)}</button>`,
    ).join('');
    size();
  };
  $('#rooms-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    cat = chip.dataset.f;
    $$('#rooms-filter .chip').forEach((c) => c.setAttribute('aria-selected', String(c === chip)));
    transition(() => {
      $$('.room', track).forEach((r) => (r.hidden = cat !== 'all' && r.dataset.cat !== cat));
      size();
    });
    scroll.to(section.offsetTop, true);
  });
  const title = $('#rooms-title');
  let lean = 0;
  let leanV = 0;
  onFrame((_, y) => {
    const top = section.offsetTop;
    const p = travel ? clamp((y - top) / travel, 0, 1) : 0;
    const inside = y > top - innerHeight && y < top + section.offsetHeight;
    const target = inside && !REDUCED ? clamp(-scroll.velocity * 0.35, -6, 6) : 0;
    leanV += (target - lean) * 0.09;
    leanV *= 0.78;
    lean += leanV;
    track.style.transform = `translate3d(${-p * travel * (root.dir === 'rtl' ? -1 : 1)}px, 0, 0) skewX(${lean.toFixed(2)}deg)`;
    if (title) title.style.transform = `skewX(${(lean * 0.6).toFixed(2)}deg)`;
    $('#rooms-bar').parentElement.style.setProperty('--p', p.toFixed(4));
    if (inside) {
      for (const im of track.querySelectorAll('.room:not([hidden]) img')) {
        const r = im.parentElement.getBoundingClientRect();
        im.style.setProperty('--px', `${((-(r.left + r.width / 2 - innerWidth / 2) / innerWidth) * 30).toFixed(1)}px`);
      }
    }
  });
  addEventListener('resize', size);
  addEventListener('load', size);
  onLang(draw);
}
const params = () => new URLSearchParams(location.search);

/* ---------- Every treatment as a short index (A–Z within each kind) ---------- */

export function treatmentIndex() {
  const box = $('#treat-index');
  if (!box) return;
  onLang(() => {
    box.innerHTML = ['consult', 'removal', 'conditions', 'skin', 'hair']
      .map((cat) => {
        const list = treatments.filter((t) => t.category === cat).sort((a, b) => L(a.name).localeCompare(L(b.name), state.lang));
        return `<div class="index-group rise"><h3>${S('cat_' + cat)}</h3><ul>${list
          .map((t) => `<li><a href="${treatmentLink(t.id)}"><span>${esc(L(t.name))}</span><small>${priceLine(t)}</small></a></li>`)
          .join('')}</ul></div>`;
      })
      .join('');
    watch(box);
  });
}

/* ---------- Prijskaart: every price on one card; a photo peeks out at the pointer ---------- */

export function menuCard() {
  const card = $('#menu-card');
  if (!card) return;
  onLang(() => {
    card.innerHTML = ['consult', 'removal', 'conditions', 'skin', 'hair']
      .map(
        (cat) => `<div class="menu-group"><h3>${S('cat_' + cat)}</h3>${treatments
          .filter((t) => t.category === cat)
          .map(
            (t) => `<a class="menu-row" href="${treatmentLink(t.id)}" data-photo="${t.photo}">
              <span class="n">${esc(L(t.name))}</span>${t.insurable ? `<span class="v">${S('insurable')}</span>` : ''}<span class="dots"></span><span class="p">${priceLine(t)}</span>
            </a>`,
          )
          .join('')}</div>`,
      )
      .join('');
  });
  peek(card, '.menu-row');
}

/** A photo that follows the pointer over a list of rows (each row has data-photo). */
export function peek(listEl, rowSel) {
  const el = $('#price-peek');
  if (!el || !FINE) return;
  const pk = { x: 0, y: 0 };
  listEl.addEventListener('pointerover', (e) => {
    const row = e.target.closest(rowSel);
    if (!row) return;
    el.firstElementChild.src = photo(row.dataset.photo);
    el.classList.add('on');
  });
  listEl.addEventListener('pointerleave', () => el.classList.remove('on'));
  onFrame(() => {
    pk.x = lerp(pk.x, pointer.x + 140, 0.14);
    pk.y = lerp(pk.y, pointer.y - 40, 0.14);
    el.style.transform = `translate3d(${pk.x}px, ${pk.y}px, 0) translate(-50%, -50%) scale(${el.classList.contains('on') ? 1 : 0.4})`;
  });
}

/* ---------- Laser packages: Pure's own package prices (women, men, students) ---------- */

export function laserPackages() {
  const box = $('#laser-packages');
  if (!box) return;
  const groups = ['women', 'men', 'students'];
  onLang(() => {
    box.innerHTML = groups
      .map(
        (g) => `<div class="menu-group"><h3>${S('laser_' + g)}</h3>${data.deals
          .filter((d) => d.group === g)
          .map(
            (d) => `<div class="menu-row is-static"><span class="n">${esc(L(d.zones))}</span><span class="dots"></span><span class="p">${d.was ? `<s>${money(d.was)}</s> ` : ''}${money(d.price)}</span></div>`,
          )
          .join('')}</div>`,
      )
      .join('');
  });
}

/* ---------- Before and after: drag the line, or let the words switch ---------- */

export function results({ ids, perTreatment = 2 } = {}) {
  const compare = $('#compare');
  if (!compare) return;
  const ORDER = ids ?? ['acne', 'pigment', 'couperose', 'prx', 'sylfirm', 'skinpen', 'ipl', 'xlhair', 'peel', 'legveins', 'tattoo'];
  const list = [];
  const seen = new Set();
  ORDER.forEach((id, n) => {
    for (const key of (byId[id]?.ba ?? []).slice(0, n < 4 ? perTreatment : 1)) if (!seen.has(key) && seen.add(key)) list.push({ key, id });
  });
  if (!list.length) {
    compare.closest('section')?.remove();
    return;
  }
  const handle = $('#compare-handle');
  let index = 0;
  let split = 0.5;
  let dragging = false;
  const show = (i) => {
    index = i;
    const r = list[i];
    $('#compare-na').src = img(`${r.key}-na.webp`);
    $('.compare-voor img').src = img(`${r.key}-voor.webp`);
    const cap = $('#compare-caption');
    if (cap) cap.innerHTML = ids?.length === 1 ? '' : `<a href="${treatmentLink(r.id)}">${esc(L(byId[r.id].name))} <span class="arr">${arrow()}</span></a>`;
    $$('#compare-pick button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.r === i)));
  };
  const setSplit = (v) => {
    v = clamp(v, 0.02, 0.98);
    compare.style.setProperty('--split', `${v * 100}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    split = v;
  };
  onLang(() => {
    const pick = $('#compare-pick');
    if (pick)
      pick.innerHTML =
        list.length > 1
          ? list
              .map((r, i) => `<button type="button" role="option" data-r="${i}" aria-selected="${i === index}" aria-label="${esc(L(byId[r.id].name))}"><img src="${img(`${r.key}-na.webp`)}" alt="" loading="lazy" /></button>`)
              .join('')
          : '';
    handle.setAttribute('aria-label', S('compareLabel'));
    show(index);
  });
  $('#compare-pick')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (b) show(+b.dataset.r);
  });
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
  setSplit(0.5);
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

  // The words in the sentence are the switch: "voor" shows the photo before, "na" the one after.
  const era = $('#era-switch');
  let glide = 0;
  era?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-side]');
    if (!b) return;
    $$('#era-switch button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    const from = split;
    const to = b.dataset.side === 'voor' ? 0.98 : 0.02;
    const start = performance.now();
    cancelAnimationFrame(glide);
    const step = (now) => {
      const t = Math.min((now - start) / (REDUCED ? 1 : 900), 1);
      setSplit(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  });
}

/* ---------- Google reviews ---------- */

// Real Google reviews of Pure Clinics Nijmegen, as shown on Google Maps on 14 November 2026 (texts cut where Google cuts them).
const REVIEWS = [
  { name: 'Tessa', months: 5, text: 'Super tevreden klant hier! Nu drie laserbehandelingen gehad voor een tatoeage, al een heel fijn resultaat tot dusver. Maar bovenal heel blij met de vriendelijkheid, kundigheid en goede uitleg en zorg van Loubna! Altijd vrolijk de deur uit :)' },
  { name: 'Lisa J.', months: 5, text: 'Ik word geholpen door Loubna voor mijn laserontharing en ik ben ontzettend tevreden! Inmiddels zit ik in de onderhoudsfase en het resultaat is echt fantastisch. Ik had veel eerder moeten beginnen.' },
  { name: 'Samantha F.', months: 4, text: 'Hele fijne kliniek! Super lieve meiden stuk voor stuk. Ik word altijd warm ontvangen en goed geïnformeerd over mijn behandeling. Qua prijs/kwaliteit verhouding, dikke prima!' },
  { name: 'D.', months: 4, text: 'Vandaag een Glow-behandeling gehad bij Nadila en ik ben ontzettend tevreden met het resultaat. Nadila is erg vriendelijk, professioneel en stelt je direct op je gemak. Ze nam de tijd om alles duidelijk uit te leggen en werkte zorgvuldig.' },
  { name: 'Julia S.', months: 5, text: 'Heel blij met mijn ervaringen hier. De behandeling wordt steeds goed afgestemd op mijn wensen en vragen. Voorafgaand aan de start van de behandeling wordt een intakegesprek ingepland, waardoor je goed geïnformeerd aan de behandelingen …' },
];
export function reviews() {
  const track = $('#review-track');
  if (!track) return;
  const c = carousel({ track, prev: $('#rev-prev'), next: $('#rev-next'), dots: $('#rev-dots'), perView: () => (innerWidth > 860 ? 2 : 1), auto: 6500 });
  onLang(() => {
    track.innerHTML = REVIEWS.map(
      (r) => `<article class="review">
        <header><span class="initial" aria-hidden="true">${r.name[0]}</span><span class="who">${esc(r.name)}<span class="when">${S('monthsAgo', { n: r.months })}</span></span><span class="g-logo" aria-hidden="true"></span></header>
        <span class="stars" aria-label="5/5">★★★★★</span>
        <blockquote lang="nl" dir="ltr">${esc(r.text)}</blockquote>
        ${state.lang === 'nl' ? '' : `<p class="orig">${S('originalDutch')}</p>`}
      </article>`,
    ).join('');
    $$('#rev-prev').forEach((b) => b.setAttribute('aria-label', S('prev')));
    $$('#rev-next').forEach((b) => b.setAttribute('aria-label', S('next')));
    c.refresh();
  });
}

/* ---------- Team: every member has their own page; a walk-in film plays on hover ---------- */

export function team() {
  const box = $('#people');
  if (!box) return;
  onLang(() => {
    box.innerHTML = TEAM.map(
      (p, i) =>
        `<li class="person rise" style="--d:${(i % 3) * 110}ms"><a href="${link(`team/${p.id}/`)}" aria-label="${esc(S('teamSee', { name: p.name }))}"><figure><img src="${img(`team/${p.id}.webp`)}" alt="${p.name}" loading="lazy" />${
          p.video ? `<video src="${BASE}video/team/${p.id}.mp4" muted playsinline preload="none" aria-hidden="true"></video>` : ''
        }</figure><h3>${p.name}</h3><p>${S(p.role)}</p></a></li>`,
    ).join('');
    watch(box);
  });
  box.addEventListener('pointerover', (e) => {
    const v = e.target.closest('.person')?.querySelector('video');
    if (v && v.paused) {
      v.currentTime = 0;
      v.play().catch(() => {});
      v.closest('figure').classList.add('playing');
    }
  });
  box.addEventListener('pointerout', (e) => {
    const li = e.target.closest('.person');
    if (!li || li.contains(e.relatedTarget)) return;
    const v = li.querySelector('video');
    if (v) {
      v.pause();
      v.closest('figure').classList.remove('playing');
    }
  });
}

/* ---------- FAQ: the clinic's own questions per treatment, grouped ---------- */

const FAQ_GROUPS = [
  { key: 'faqIntake', ids: ['consult'] },
  { key: 'faqLaser', ids: ['laser', 'epilation'] },
  { key: 'faqConditions', ids: ['acne', 'pigment', 'couperose', 'legveins', 'eyes', 'tattoo', 'ipl'] },
  { key: 'faqSkin', ids: ['skinpen', 'sylfirm', 'tixel', 'prx', 'skinbooster', 'exosomes', 'pdrn', 'tca', 'peel', 'deepclean', 'facial', 'massage'] },
  { key: 'faqHair', ids: ['xlhair', 'camouflage'] },
];
export function faq() {
  const listEl = $('#faq-list');
  if (!listEl) return;
  let group = new URLSearchParams(location.search).get('over') ?? 'faqAll';
  const entries = () => {
    const out = [];
    for (const g of FAQ_GROUPS)
      for (const id of g.ids) for (const f of byId[id]?.info?.faq ?? []) out.push({ group: g.key, id, q: L(f.q), a: L(f.a), tag: L(byId[id].name) });
    out.push({ group: 'faqGeneral', q: S('faqInsuranceQ'), a: S('q2Body'), tag: S('faqGeneral') });
    out.push({ group: 'faqGeneral', q: S('faqWhereQ'), a: S('faqWhereA'), tag: S('faqGeneral') });
    out.push({ group: 'faqGeneral', q: S('faqGiftQ'), a: S('faqGiftA'), tag: S('faqGeneral') });
    out.push({ group: 'faqGeneral', q: S('faqAccountQ'), a: S('faqAccountA'), tag: S('faqGeneral') });
    return out;
  };
  const draw = () => {
    const tabs = ['faqAll', ...FAQ_GROUPS.map((g) => g.key), 'faqGeneral'];
    $('#faq-filters').innerHTML = tabs.map((k) => `<button type="button" role="tab" data-g="${k}" aria-selected="${k === group}">${S(k)}</button>`).join('');
    const all = entries();
    const shown = group === 'faqAll' ? all : all.filter((f) => f.group === group);
    listEl.innerHTML = shown
      .map(
        (f) => `<details><summary><small>${esc(f.tag)}</small><span>${esc(f.q)}</span></summary><div class="faq-answer"><p>${esc(f.a)}</p>${
          f.id ? `<a class="btn btn-line" href="${treatmentLink(f.id)}">${S('faqMore', { t: esc(f.tag) })}</a>` : ''
        }</div></details>`,
      )
      .join('');
  };
  $('#faq-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    group = b.dataset.g;
    draw();
  });
  onLang(draw);
}

/* ---------- The booking button rises out of its rings ---------- */

export function ringCta() {
  const el = $('#ring-cta');
  if (!el) return;
  onFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) return;
    const p = smoothstep(innerHeight, innerHeight * 0.55, r.top);
    el.style.transform = `translate3d(0, ${((1 - p) * 60).toFixed(1)}px, 0) scale(${(0.9 + p * 0.1).toFixed(3)})`;
  });
}

/* ---------- Effects from the first site ---------- */

export function effects() {
  startDrop();
  if ($('#mirror')) startMirror();
  const relabel = [startLoupe(S, nameOf), startLayers(byId, S, nameOf), startFilm(S)];
  onLang(() => relabel.forEach((fn) => fn?.()));
}

/* ---------- Current campaigns: Pure's deals with their last day ---------- */

export function campaignList() {
  const box = $('#acties');
  if (!box) return;
  const list = activeCampaigns();
  if (!list.length) {
    box.remove();
    return;
  }
  onLang(() => {
    box.innerHTML = list
      .map(
        (c) => `<div class="deals-card rise">
          <p class="eyebrow">${esc(L(c.name))} · ${untilLine(c)}</p>
          <ul class="deals">${c.deals
            .map((d) => `<li><a href="${treatmentLink(d.treatment)}"><span>${esc(L(d.text))}</span><span class="arr">${arrow()}</span></a></li>`)
            .join('')}</ul>
        </div>`,
      )
      .join('');
    watch(box);
  });
}
