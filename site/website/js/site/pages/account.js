// Mijn Pure: sign in or sign up with a code by e-mail; then your appointment requests, your orders and your details.
// Everything comes from Huidly's customer API (docs/customer-api.md in the huidly repository).
import { $, $$, L, LOCALE, S, bookLink, byId, data, esc, link, money, onLang, productById, state } from '../core.js';
import { account } from '../account.js';
import { ORDER_STATUS_KEY, PART_KEY, STATUS_KEY, api } from '../api.js';
import { errorText, signIn } from '../signin.js';

const box = $('#account');
let tab = location.hash.slice(1) || 'afspraken';

export function start() {
  onLang(draw);
  account.onChange(draw);
  account.refresh();
}

function draw() {
  const me = account.current();
  if (!me) {
    box.innerHTML = `
      <p class="crumbs"><a href="${link('')}">Pure Clinics</a><span aria-hidden="true">/</span><span>${S('myPure')}</span></p>
      <h1 class="title">${S('signInTitle')}</h1>
      <p class="note">${S('signInNote')}</p>
      <div id="signin"></div>`;
    signIn($('#signin'));
    return;
  }
  const TABS = ['afspraken', 'bestellingen', 'gegevens'];
  box.innerHTML = `
    <p class="crumbs"><a href="${link('')}">Pure Clinics</a><span aria-hidden="true">/</span><span>${S('myPure')}</span></p>
    <h1 class="title">${S('hello', { n: esc(me.name?.split(' ')[0] ?? '') })}</h1>
    <div class="filters" role="tablist">${TABS.map((t) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tab}">${S('tab_' + t)}</button>`).join('')}</div>
    <div class="account-panel" id="panel" aria-live="polite"><p class="fine">${S('loading')}</p></div>
    <button class="link-arrow" type="button" id="signout">${S('signOut')}</button>`;
  $$('[data-tab]', box).forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      history.replaceState(null, '', '#' + tab);
      draw();
    }),
  );
  $('#signout').addEventListener('click', () => account.signOut());
  ({ afspraken: bookings, bestellingen: orders, gegevens: details })[tab]?.(me);
}

const dateFmt = (d) => new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d.length === 10 ? d + 'T12:00' : d));
const city = (id) => data.locations.find((l) => l.id === id)?.city ?? id ?? '';
const fail = (err) => ($('#panel').innerHTML = `<p class="form-error">${errorText(err)}</p>`);

async function bookings() {
  try {
    const { appointments: list = [] } = (await api.appointments()) ?? {};
    const time = new Intl.DateTimeFormat(LOCALE[state.lang], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
    $('#panel').innerHTML = list.length
      ? `<ul class="rows">${list
          .map((a) => {
            const when = a.start ? time.format(new Date(a.start)) : `${dateFmt(a.date)}${a.part ? ', ' + S('part_' + (PART_KEY[a.part] ?? a.part)).toLowerCase() : ''}`;
            const name = a.treatmentName ? L(a.treatmentName) : byId[a.treatment] ? L(byId[a.treatment].name) : a.treatment;
            const open = ['requested', 'confirmed'].includes(a.status) && (!a.start || new Date(a.start) > new Date());
            return `<li class="row">
              <div><p class="row-title">${esc(name)}</p>
              <p class="fine">${esc(when)} · ${esc(city(a.location))}</p>${a.message ? `<p class="row-msg">“${esc(a.message)}”</p>` : ''}</div>
              <span class="status status-${esc(a.status)}">${S('status_' + (STATUS_KEY[a.status] ?? a.status))}</span>
              ${open ? `<button type="button" class="link-arrow" data-cancel="${esc(a.id)}">${S('cancel')}</button>` : ''}
            </li>`;
          })
          .join('')}</ul><a class="btn btn-solid" href="${bookLink()}">${S('ctaBook')}</a>`
      : `<p class="note">${S('noBookings')}</p><a class="btn btn-solid" href="${bookLink()}">${S('ctaBook')}</a>`;
    $$('[data-cancel]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(S('cancelSure'))) return;
        b.disabled = true;
        try {
          await api.cancelAppointment(b.dataset.cancel);
          bookings();
        } catch (err) {
          fail(err);
        }
      }),
    );
  } catch (err) {
    fail(err);
  }
}

async function orders() {
  try {
    const { orders: list = [] } = (await api.orders()) ?? {};
    const itemName = (i) => (i.name ? L(i.name) : productById[i.product] ? L(productById[i.product].name) : i.product);
    $('#panel').innerHTML = list.length
      ? `<ul class="rows">${list
          .map((o) => {
            const what = [
              ...(o.items ?? []).map((i) => `${i.qty}× ${itemName(i)}`),
              ...(o.giftCards ?? []).map((g) => `${g.qty}× ${S('giftLine', { a: money(g.price) })}`),
            ].join(', ');
            const where = o.delivery?.method === 'post' ? S('sendHome') : S('pickupIn', { c: city(o.delivery?.location) });
            return `<li class="row">
              <div><p class="row-title">${S('orderNo', { n: esc(o.number ?? o.id) })}</p>
              <p class="fine">${esc(dateFmt(o.createdAt))} · ${esc(where)}</p><p class="fine">${esc(what)}</p>${o.track ? `<p class="fine">Track &amp; trace: ${esc(o.track)}</p>` : ''}</div>
              <span class="status status-${esc(o.status)}">${S('ostatus_' + (ORDER_STATUS_KEY[o.status] ?? o.status))}</span>
              <b>${money(o.total ?? 0)}</b>
              ${o.status === 'new' ? `<button type="button" class="link-arrow" data-cancel-order="${esc(o.id)}">${S('cancel')}</button>` : ''}
            </li>`;
          })
          .join('')}</ul>`
      : `<p class="note">${S('noOrders')}</p><a class="btn btn-line" href="${link('shop/')}">${S('toShop')}</a>`;
    $$('[data-cancel-order]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(S('cancelOrderSure'))) return;
        b.disabled = true;
        try {
          await api.cancelOrder(b.dataset.cancelOrder);
          orders();
        } catch (err) {
          fail(err);
        }
      }),
    );
  } catch (err) {
    fail(err);
  }
}

function details(me) {
  $('#panel').innerHTML = `<form class="form" id="details" novalidate>
    <label class="field"><span>${S('name')}</span><input name="name" autocomplete="name" value="${esc(me.name ?? '')}" required /></label>
    <label class="field"><span>${S('email')}</span><input value="${esc(me.email ?? '')}" disabled /></label>
    <label class="field"><span>${S('phone')} <small>${S('optional')}</small></span><input name="phone" type="tel" autocomplete="tel" value="${esc(me.phone ?? '')}" /></label>
    <p class="form-error" role="alert" hidden></p>
    <button class="btn btn-solid" type="submit">${S('save')}</button>
  </form>
  <div class="danger-zone"><p class="fine">${S('deleteAccountText')}</p><button type="button" class="linklike" id="delete-account">${S('deleteAccount')}</button></div>`;
  $('#delete-account').addEventListener('click', async () => {
    if (!confirm(S('deleteAccountSure'))) return;
    try {
      await account.remove();
    } catch (x) {
      fail(x);
    }
  });
  const form = $('#details');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('.form-error');
    msg.hidden = true;
    msg.classList.remove('ok');
    try {
      const res = await api.updateMe({ name: form.name.value.trim(), phone: form.phone.value.trim(), locale: state.lang });
      account.update(res?.me ?? { name: form.name.value.trim(), phone: form.phone.value.trim() });
    } catch (x) {
      msg.textContent = errorText(x);
      msg.hidden = false;
    }
  });
}
