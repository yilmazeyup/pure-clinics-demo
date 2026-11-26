// Home: a short page that makes an impression and sends people on. The photo, the clinic in short, the brands we work
// with, "where do you want to work on", the pages of the site as an index, the gift card, close-ups, reviews, booking.
import { pointer, onFrame } from '../../fx/core.js';
import { startHeroGL } from '../../fx/gl.js';
import { buildLogoFromSquares } from '../../fx/loader.js';
import { $, HERO, L, REDUCED, S, activeCampaigns, img, link, money, onLang, state, untilLine } from '../core.js';
import { brands, drift, effects, peek, reviews, ringCta, scan, statement, ticker } from '../parts.js';
import { showGiftNote } from '../shell.js';

let heroGL = null;
const heroImg = $('#hero-img');

export function start() {
  ticker();
  brands();
  statement();
  scan();
  drift();
  reviews();
  effects();
  ringCta();
  peek($('#discover'), '.disc-row');

  // The photo of the palette; it changes with the palette.
  heroImg.src = img(`close/${HERO[state.study]}.webp`);
  document.addEventListener('pure:study', (e) => {
    const src = img(`close/${HERO[e.detail]}.webp`);
    if (heroImg.src.endsWith(src)) return;
    heroImg.style.opacity = '0';
    setTimeout(() => {
      heroImg.src = src;
      heroImg.onload = () => {
        heroImg.style.opacity = '1';
        heroGL?.setImage(heroImg);
      };
    }, 300);
  });

  // A campaign that runs now gets a small chip in the hero, next to the Google score.
  const c = activeCampaigns()[0];
  const chip = $('#hero-deal');
  if (c && chip) {
    chip.hidden = false;
    chip.href = link('prijzen/', {}) + '#acties';
    onLang(() => (chip.innerHTML = `<b>${L(c.name)}</b><span>${untilLine(c)}</span><span class="arr">${state.lang === 'ar' ? '←' : '→'}</span>`));
  }
  onLang(() => ($('#gift-band-offer').textContent = S('giftOffer', { a: money(100), b: money(15) })));
}

// The loader counts while the fonts and the first photo arrive; the wordmark builds itself out of squares, then the
// photo appears as dots that sharpen (after Lama Lama) and takes the light of the hour in Nijmegen (after Bruno Simon).
export async function after() {
  const loader = $('#loader');
  const count = $('#loader-count');
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
      count.textContent = String(n);
      if (n >= 100) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  await squares;
  heroGL = await startHeroGL($('#hero-gl'), heroImg, pointer, onFrame).catch(() => null);
  loader.classList.add('done');
  heroGL?.reveal();
  requestAnimationFrame(() => document.body.classList.add('loaded'));
  setTimeout(() => loader.remove(), 1400);
  showGiftNote(2200);
}
