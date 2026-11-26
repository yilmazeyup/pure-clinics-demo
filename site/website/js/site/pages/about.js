// Over ons: the philosophy, the film of a treatment trajectory, the team, why Pure, and both clinics with directions.
import { $, LOCALE, S, bookLink, data, esc, onLang, state, watch } from '../core.js';
import { effects, team } from '../parts.js';

export function start() {
  effects();
  team();
  onLang(() => {
    const fmt = new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'long' });
    const dayName = (d) => fmt.format(new Date(2026, 10, 15 + d));
    const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    $('#places').innerHTML = data.locations
      .map(
        (l) => `<article class="place rise">
          <h3 class="card-title">${esc(l.city)}</h3>
          <p>${esc(l.address)}<br /><a href="tel:${l.phone.replace(/\s/g, '')}">${l.phone}</a></p>
          <table aria-label="${S('hours')}">${[1, 2, 3, 4, 5, 6, 0]
            .map((d) => `<tr><td>${dayName(d)}</td><td>${l.hours[d] ? `${hh(l.hours[d].open)} – ${hh(l.hours[d].close)}` : S('closed')}</td></tr>`)
            .join('')}</table>
          <p class="place-actions"><a class="btn btn-line" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Pure Clinics ' + l.address)}" target="_blank" rel="noopener">${S('route')}</a>
          <a class="btn btn-solid" href="${bookLink('consult')}&locatie=${l.id}">${S('bookHere')}</a></p>
        </article>`,
      )
      .join('');
    watch($('#places'));
  });
}
