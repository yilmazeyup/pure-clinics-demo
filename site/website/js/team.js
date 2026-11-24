// One page per team member: the walk-in film (or the portrait), name and role, a booking button and the rest of the
// team. Same palettes and seven languages as the website; the person comes from the folder (window.PERSON).
import { LANGS, LANG_NAMES, STRINGS } from './i18n.js';
import { logoSvg } from './logo.js';
import { TEAM } from './team-data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
const STUDIES = ['creme', 'karamel', 'walnoot'];
const pick = (list, ...v) => v.find((x) => list.includes(x)) ?? list[0];
const renamed = (v) => (v === 'bordeaux' ? 'walnoot' : v);
const study = pick(STUDIES, renamed(params.get('studie')), renamed(store.get('pure-web-study')));
let lang = pick(LANGS, params.get('lang'), store.get('pure-web-lang'));
const S = (key, vars = {}) => {
  let s = STRINGS[lang]?.[key] ?? STRINGS.nl[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
};
const person = TEAM.find((p) => p.id === window.PERSON) ?? TEAM[0];
const BASE = '../../';
root.dataset.study = study;

$$('[data-logo]').forEach((el) => (el.innerHTML = logoSvg()));
const sel = $('#lang');
sel.innerHTML = LANGS.map((l) => `<option value="${l}">${LANG_NAMES[l]}</option>`).join('');

// The walk-in plays once and rests on its last frame, the pose; without a film (or with reduced motion) the portrait.
const film = $('#film');
const portrait = `${BASE}img/team/${person.id}.webp`;
if (person.video && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  film.innerHTML = `<video src="${BASE}video/team/${person.id}.mp4" poster="${portrait}" autoplay muted playsinline preload="auto"></video>`;
} else {
  film.innerHTML = `<img src="${portrait}" alt="" />`;
}

function render() {
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = `${person.name} · Pure Clinics`;
  sel.value = lang;
  sel.setAttribute('aria-label', S('language'));
  $('#role').textContent = S(person.role);
  $('#name').textContent = person.name;
  $('#intro').textContent = S(person.role === 'roleTherapist' ? 'teamNote' : 'teamNoteOther');
  $('#book').textContent = S('ctaIntakePlan');
  $('#book').href = `${BASE}../app/afspraak/consult?lang=${lang}`;
  $('#back').textContent = S('teamBack');
  $('#back').href = `${BASE}?lang=${lang}#team`;
  $('#more-title').textContent = S('teamMore');
  $('#more').innerHTML = TEAM.filter((p) => p.id !== person.id)
    .map(
      (p) => `<li><a href="../${p.id}/?lang=${lang}"><figure><img src="${BASE}img/team/${p.id}-s.webp" alt="" loading="lazy" /></figure><strong>${p.name}</strong><small>${S(p.role)}</small></a></li>`,
    )
    .join('');
}
sel.addEventListener('change', () => {
  lang = sel.value;
  store.set('pure-web-lang', lang);
  const u = new URL(location.href);
  u.searchParams.set('lang', lang);
  history.replaceState(null, '', u);
  render();
});
render();
requestAnimationFrame(() => document.body.classList.add('in'));
