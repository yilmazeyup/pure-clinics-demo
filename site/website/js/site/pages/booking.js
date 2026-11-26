// Afspraak maken: treatment, clinic, day and part of the day, who you are, a note. The request goes to Huidly, where
// Pure's team sees it in Kliniek › Agenda › Aanvragen and confirms the exact time (Pure's agenda still runs in
// SkinAdmin, so the site never promises a slot). Days and parts come from Huidly's /availability.
import { $, L, LOCALE, S, byId, data, esc, img, link, onLang, params, photo, priceLine, state, treatments } from '../core.js';
import { account } from '../account.js';
import { PART_KEY, api } from '../api.js';
import { errorText, signIn } from '../signin.js';

const choice = {
  treatment: byId[params.get('behandeling')] ? params.get('behandeling') : 'consult',
  location: data.locations.some((l) => l.id === params.get('locatie')) ? params.get('locatie') : null,
  date: null,
  part: null,
};
const DAYS = 28;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const loc = () => data.locations.find((l) => l.id === choice.location);
const partText = (p) => S('part_' + (PART_KEY[p] ?? p));

/** The days that can be asked for: from Huidly, or (when it cannot be reached) from the opening hours. */
const cache = new Map();
async function availability() {
  const key = `${choice.treatment}|${choice.location}`;
  if (cache.has(key)) return cache.get(key);
  const from = new Date();
  from.setDate(from.getDate() + 1);
  const to = new Date(from);
  to.setDate(from.getDate() + DAYS - 1);
  let days;
  try {
    days = (await api.availability({ treatment: choice.treatment, location: choice.location, from: iso(from), to: iso(to) })).days;
  } catch {
    days = byHours(from);
  }
  const map = new Map(days.map((d) => [d.date, d.parts]));
  cache.set(key, map);
  return map;
}
function byHours(from) {
  const PARTS = [
    ['morning', 0, 12],
    ['afternoon', 12, 17],
    ['evening', 17, 24],
  ];
  const out = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const h = loc()?.hours[d.getDay()];
    if (!h) continue;
    out.push({ date: iso(d), parts: PARTS.filter(([, a, b]) => h.open < b && h.close > a + 0.5).map(([id]) => id) });
  }
  return out;
}

export function start() {
  const box = $('#booking');

  const drawTreatments = () => {
    $('#b-treat').innerHTML = ['consult', 'removal', 'conditions', 'skin', 'hair']
      .map(
        (g) => `<optgroup label="${esc(S('cat_' + g))}">${treatments
          .filter((t) => t.category === g)
          .map((t) => `<option value="${t.id}"${t.id === choice.treatment ? ' selected' : ''}>${esc(L(t.name))} · ${esc(priceLine(t))}</option>`)
          .join('')}</optgroup>`,
      )
      .join('');
    $('#b-treat-note').textContent = choice.treatment === 'consult' ? S('intakeNote') : S('notSureNote');
  };

  const drawPlaces = () => {
    $('#b-places').innerHTML = data.locations
      .map(
        (l) => `<label class="choice"><input type="radio" name="location" value="${l.id}"${l.id === choice.location ? ' checked' : ''} /><span><b>${esc(l.city)}</b><small>${esc(l.address)}</small></span></label>`,
      )
      .join('');
  };

  let drawing = 0;
  const drawDays = async () => {
    const daysBox = $('#b-days');
    if (!choice.location) {
      daysBox.innerHTML = `<p class="fine">${S('pickPlaceFirst')}</p>`;
      $('#b-parts').innerHTML = '';
      return;
    }
    const run = ++drawing;
    if (!cache.has(`${choice.treatment}|${choice.location}`)) daysBox.innerHTML = `<p class="fine">${S('loading')}</p>`;
    const open = await availability();
    if (run !== drawing) return;
    const fmtDay = new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'short' });
    const fmtDate = new Intl.DateTimeFormat(LOCALE[state.lang], { day: 'numeric', month: 'short' });
    const out = [];
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    for (let i = 1; i <= DAYS; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      const id = iso(day);
      const ok = (open.get(id) ?? []).length > 0;
      out.push(
        `<label class="day${ok ? '' : ' closed'}"><input type="radio" name="date" value="${id}"${ok ? '' : ' disabled'}${id === choice.date ? ' checked' : ''} /><span><small>${fmtDay.format(day)}</small><b>${fmtDate.format(day)}</b></span></label>`,
      );
    }
    daysBox.innerHTML = out.join('');
    if (choice.date && !open.get(choice.date)?.length) choice.date = null;
    if (choice.date) {
      const parts = open.get(choice.date);
      if (!parts.includes(choice.part)) choice.part = null;
      $('#b-parts').innerHTML = parts
        .map((p) => `<label class="choice small"><input type="radio" name="part" value="${p}"${p === choice.part ? ' checked' : ''} /><span><b>${partText(p)}</b></span></label>`)
        .join('');
    } else $('#b-parts').innerHTML = `<p class="fine">${S('pickDayFirst')}</p>`;
    drawSummary();
  };

  const drawYou = () => {
    const me = account.current();
    const you = $('#b-you');
    if (me) {
      you.innerHTML = `<div class="you"><p><b>${esc(me.name ?? '')}</b><br />${esc(me.email ?? '')}${me.phone ? ` · ${esc(me.phone)}` : ''}</p><button type="button" class="link-arrow" id="b-signout">${S('notYou')}</button></div>`;
      $('#b-signout').addEventListener('click', () => account.signOut());
    } else {
      signIn(you, { intro: S('signInToBook') });
    }
  };

  const drawSummary = () => {
    const t = byId[choice.treatment];
    const l = loc();
    const date = choice.date ? new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(choice.date + 'T12:00')) : null;
    const ready = t && l && choice.date && choice.part && account.current();
    $('#b-summary').innerHTML = `
      <figure><img src="${photo(t.photo)}" alt="" /></figure>
      <p class="eyebrow">${S('yourRequest')}</p>
      <h2 class="card-title">${esc(L(t.name))}</h2>
      <dl class="facts">
        <div><dt>${S('stepPlace')}</dt><dd>${l ? esc(l.city) : '—'}</dd></div>
        <div><dt>${S('stepDay')}</dt><dd>${date ? `${esc(date)}${choice.part ? `, ${partText(choice.part).toLowerCase()}` : ''}` : '—'}</dd></div>
        <div><dt>${S('duration')}</dt><dd>${S('minutes', { m: t.minutes })}</dd></div>
        <div><dt>${S('price')}</dt><dd>${priceLine(t)}</dd></div>
      </dl>
      <button class="btn btn-solid" type="button" data-submit ${ready ? '' : 'disabled'}>${S('requestBooking')}</button>
      <p class="fine">${ready ? S('confirmLater') : S('fillAll')}</p>`;
  };

  box.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (e.target.id === 'b-treat') {
      choice.treatment = value;
      $('#b-treat-note').textContent = value === 'consult' ? S('intakeNote') : S('notSureNote');
      drawDays();
    }
    if (name === 'location') {
      choice.location = value;
      drawDays();
    }
    if (name === 'date') {
      choice.date = value;
      drawDays();
    }
    if (name === 'part') choice.part = value;
    drawSummary();
  });

  $('#b-summary').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-submit]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    $('#b-error').hidden = true;
    try {
      const note = $('#b-note').value.trim();
      await api.requestAppointment({ treatment: choice.treatment, location: choice.location, date: choice.date, part: choice.part, ...(note ? { note } : {}) });
      done();
    } catch (err) {
      $('#b-error').textContent = errorText(err);
      $('#b-error').hidden = false;
      btn.disabled = false;
      if (err.code === 'date-invalid') {
        cache.clear();
        drawDays();
      }
    }
  });

  const done = () => {
    const t = byId[choice.treatment];
    $('#main').innerHTML = `
      <section class="flow-done">
        <figure class="unveil in"><img src="${img(`${t.photo}.webp`)}" alt="" /></figure>
        <div>
          <p class="eyebrow">${S('requestSent')}</p>
          <h1 class="title">${S('thanksBooking', { n: esc(account.current()?.name?.split(' ')[0] ?? '') })}</h1>
          <p class="lede">${S('bookingDoneText', { t: esc(L(t.name)), c: esc(loc().city) })}</p>
          <div class="hero-actions"><a class="btn btn-solid" href="${link('account/')}">${S('myPure')}</a><a class="btn btn-line" href="${link('')}">${S('backHome')}</a></div>
        </div>
      </section>`;
    scrollTo({ top: 0 });
  };

  onLang(() => {
    drawTreatments();
    drawPlaces();
    drawDays();
    drawYou();
    drawSummary();
  });
  account.onChange(() => {
    drawYou();
    drawSummary();
  });
  account.refresh();
}
