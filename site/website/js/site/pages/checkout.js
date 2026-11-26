// Afrekenen: the cart, pick up in Nijmegen or Uden (pay in the clinic) or have it sent (the clinic sends a payment
// request and ships once paid), and who you are. The order goes to Huidly: Kliniek › Webshop & voorraad.
import { $, L, S, cart, data, esc, lineBonus, link, money, onLang, productById } from '../core.js';
import { account } from '../account.js';
import { api } from '../api.js';
import { lineName, lineThumb } from '../shell.js';
import { errorText, signIn } from '../signin.js';
import { track } from '../track.js';

const order = { method: 'pickup', location: null };
let delivery = null; // { fee, countries } from Huidly's catalog; without it, only pickup

export function start() {
  const steps = $('#checkout');

  const drawWhere = () => {
    const places = data.locations
      .map(
        (l) =>
          `<label class="choice"><input type="radio" name="where" value="pickup:${l.id}"${order.method === 'pickup' && order.location === l.id ? ' checked' : ''} /><span><b>${S('pickupIn', { c: esc(l.city) })}</b><small>${esc(l.address)} · ${S('payInClinic')}</small></span></label>`,
      )
      .join('');
    const post = delivery
      ? `<label class="choice"><input type="radio" name="where" value="post"${order.method === 'post' ? ' checked' : ''} /><span><b>${S('sendHome')}</b><small>${money(delivery.fee)} · ${S('payRequest')}</small></span></label>`
      : '';
    $('#c-places').innerHTML = places + post;
    $('#c-address').hidden = order.method !== 'post';
  };

  const drawYou = () => {
    const me = account.current();
    if (me) {
      $('#c-you').innerHTML = `<div class="you"><p><b>${esc(me.name ?? '')}</b><br />${esc(me.email ?? '')}</p><button type="button" class="link-arrow" id="c-signout">${S('notYou')}</button></div>`;
      $('#c-signout').addEventListener('click', () => account.signOut());
      const f = $('#c-address');
      if (!f.elements.name.value) f.elements.name.value = me.name ?? '';
    } else signIn($('#c-you'), { intro: S('signInToOrder') });
  };

  const shipping = () => (order.method === 'post' && delivery ? delivery.fee : 0);
  const addressOk = () => {
    if (order.method !== 'post') return true;
    const f = $('#c-address').elements;
    return ['name', 'street', 'postcode', 'city'].every((k) => f[k].value.trim().length > 1);
  };

  const drawSummary = () => {
    const lines = cart.lines();
    const where = order.method === 'post' || order.location;
    const ready = lines.length && where && addressOk() && account.current();
    $('#c-summary').innerHTML = lines.length
      ? `<p class="eyebrow">${S('cart')}</p>
        <ul class="cart-lines">${lines
          .map((l) => {
            const bonus = lineBonus(l);
            return `<li class="cart-line"><img src="${lineThumb(l)}" alt="" /><div><p class="cart-name">${l.qty}× ${esc(lineName(l))}</p>${
              bonus ? `<p class="cart-bonus">${S('giftBonusLine', { b: money(bonus * l.qty) })}</p>` : ''
            }${l.to ? `<p class="fine">${S('giftTo')}: ${esc(l.to)}</p>` : ''}</div><p class="cart-price">${money(cart.price(l) * l.qty)}</p></li>`;
          })
          .join('')}</ul>
        ${shipping() ? `<p class="cart-total small"><span>${S('shipping')}</span><span>${money(shipping())}</span></p>` : ''}
        <p class="cart-total"><span>${S('total')}</span><b>${money(cart.total() + shipping())}</b></p>
        <button class="btn btn-solid" type="button" data-submit ${ready ? '' : 'disabled'}>${S('placeOrder')}</button>
        <p class="fine">${order.method === 'post' ? S('payRequestLong') : S('payAtPickup')}</p>`
      : `<p class="note">${S('cartEmpty')}</p><a class="btn btn-line" href="${link('shop/')}">${S('toShop')}</a>`;
  };

  steps.addEventListener('change', (e) => {
    if (e.target.name === 'where') {
      const [method, location] = e.target.value.split(':');
      order.method = method;
      order.location = location ?? null;
      $('#c-address').hidden = method !== 'post';
    }
    drawSummary();
  });
  $('#c-address').addEventListener('input', drawSummary);

  $('#c-summary').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-submit]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    $('#c-error').hidden = true;
    const lines = cart.lines();
    const f = $('#c-address').elements;
    const note = $('#c-note').value.trim();
    try {
      const res = await api.placeOrder({
        items: lines.filter((l) => l.kind === 'product').map((l) => ({ product: l.id, qty: l.qty })),
        giftCards: lines.filter((l) => l.kind === 'giftcard').map((l) => ({ id: l.id, qty: l.qty, ...(l.to ? { to: l.to } : {}), ...(l.message ? { message: l.message } : {}) })),
        delivery:
          order.method === 'post'
            ? { method: 'post', address: { name: f.name.value.trim(), street: f.street.value.trim(), postcode: f.postcode.value.trim(), city: f.city.value.trim(), country: f.country.value } }
            : { method: 'pickup', location: order.location },
        channel: 'site',
        ...(note ? { note } : {}),
      });
      track('purchase', {
        transaction_id: res?.order?.number ?? res?.order?.id ?? '',
        currency: 'EUR',
        value: res?.order?.total ?? cart.total() + shipping(),
        shipping: shipping(),
        delivery: order.method,
        items: lines.map((l) => ({ item_id: l.id, item_name: lineName(l), item_category: l.kind, price: cart.price(l), quantity: l.qty })),
      });
      cart.clear();
      const city = data.locations.find((l) => l.id === order.location)?.city ?? '';
      $('#main').innerHTML = `<section class="flow-done text-only"><div>
        <p class="eyebrow">${S('orderPlaced')}</p>
        <h1 class="title">${S('orderThanks')}</h1>
        <p class="lede">${order.method === 'post' ? S('orderDonePost', { n: esc(res?.order?.number ?? '') }) : S('orderDoneText', { n: esc(res?.order?.number ?? ''), c: esc(city) })}</p>
        <div class="hero-actions"><a class="btn btn-solid" href="${link('account/')}#bestellingen">${S('myPure')}</a><a class="btn btn-line" href="${link('')}">${S('backHome')}</a></div>
      </div></section>`;
      scrollTo({ top: 0 });
    } catch (err) {
      let text = errorText(err);
      if (err.code === 'out-of-stock' && err.body?.products?.length) text += ' ' + err.body.products.map((id) => (productById[id] ? L(productById[id].name) : id)).join(', ');
      $('#c-error').textContent = text;
      $('#c-error').hidden = false;
      btn.disabled = false;
    }
  });

  cart.onChange(drawSummary);
  account.onChange(() => {
    drawYou();
    drawSummary();
  });
  onLang(() => {
    drawWhere();
    drawYou();
    drawSummary();
  });
  api
    .catalog()
    .then((c) => {
      if (c?.delivery?.fee != null) {
        delivery = c.delivery;
        drawWhere();
      }
    })
    .catch(() => {});
  account.refresh();
  const start = cart.lines();
  if (start.length) track('begin_checkout', { currency: 'EUR', value: cart.total(), items: start.map((l) => ({ item_id: l.id, item_category: l.kind, price: cart.price(l), quantity: l.qty })) });
}
