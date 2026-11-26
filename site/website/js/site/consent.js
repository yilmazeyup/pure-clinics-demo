// Cookie consent (AVG / Telecommunicatiewet): a visitor first chooses, and only then are statistics or marketing tools
// switched on. "Alles accepteren" and "Alleen noodzakelijk" are equally easy; "Instellen" lets them pick per kind, and
// "Cookie-instellingen" in the footer reopens it. The choice stays in this browser (that storage itself is necessary).
import { $, S, link, store } from './core.js';

const KEY = 'pure-consent';
const VERSION = 1;

export function consent() {
  try {
    const c = JSON.parse(store.get(KEY) ?? 'null');
    return c?.v === VERSION ? c : null;
  } catch {
    return null;
  }
}
export const consentPending = () => !consent();

function save(stats, marketing) {
  const c = { v: VERSION, stats: !!stats, marketing: !!marketing, at: new Date().toISOString() };
  store.set(KEY, JSON.stringify(c));
  document.dispatchEvent(new CustomEvent('pure:consent', { detail: c }));
  close();
}

let box = null;
function close() {
  if (!box) return;
  box.classList.remove('show');
  const b = box;
  box = null;
  setTimeout(() => b.remove(), 400);
}

/** Shows the banner; `detailed` opens it on the per-kind choices (from the footer link). */
export function openConsent(detailed = false) {
  if (box) box.remove();
  const now = consent();
  box = document.createElement('section');
  box.className = 'consent';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-labelledby', 'consent-title');
  box.innerHTML = `
    <h2 id="consent-title" class="consent-title">${S('cookieTitle')}</h2>
    <p class="consent-text">${S('cookieText')} <a href="${link('privacy/')}#cookies">${S('privacyTitle')}</a></p>
    <div class="consent-kinds" ${detailed ? '' : 'hidden'}>
      <label class="consent-kind"><input type="checkbox" checked disabled /><span><b>${S('cookieNecessary')}</b><small>${S('cookieNecessaryText')}</small></span></label>
      <label class="consent-kind"><input type="checkbox" name="stats" ${now?.stats ? 'checked' : ''} /><span><b>${S('cookieStats')}</b><small>${S('cookieStatsText')}</small></span></label>
      <label class="consent-kind"><input type="checkbox" name="marketing" ${now?.marketing ? 'checked' : ''} /><span><b>${S('cookieMarketing')}</b><small>${S('cookieMarketingText')}</small></span></label>
    </div>
    <div class="consent-actions">
      <button type="button" class="btn btn-solid" data-c="all">${S('cookieAll')}</button>
      <button type="button" class="btn btn-line" data-c="none">${S('cookieNone')}</button>
      <button type="button" class="linklike" data-c="${detailed ? 'save' : 'more'}">${detailed ? S('cookieSave') : S('cookieMore')}</button>
    </div>`;
  document.body.append(box);
  requestAnimationFrame(() => requestAnimationFrame(() => box?.classList.add('show')));
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const kind = b.dataset.c;
    if (kind === 'all') save(true, true);
    if (kind === 'none') save(false, false);
    if (kind === 'more') {
      box.querySelector('.consent-kinds').hidden = false;
      b.dataset.c = 'save';
      b.textContent = S('cookieSave');
    } else if (kind === 'save') save(box.querySelector('[name=stats]').checked, box.querySelector('[name=marketing]').checked);
  });
  (detailed ? box.querySelector('[name=stats]') : box.querySelector('[data-c=all]'))?.focus({ preventScroll: true });
}

export function startConsent() {
  if (consentPending()) setTimeout(() => openConsent(false), 600);
}

export { $ };
