// Cadeaubon: Pure's gift cards as Huidly sells them (/gift-cards: what you pay and what it is worth in the clinic),
// for whom and a short message, then into the cart. Without Huidly the site falls back on Pure's own offer.
import { $, S, acties, cart, esc, money, onLang, params } from '../core.js';
import { api } from '../api.js';

let cards = acties.giftcard.cards;
let pick = cards[0]?.id;
let qty = 1;

export function start() {
  const drawCards = () => {
    $('#amounts').innerHTML = cards
      .map(
        (c) =>
          `<label class="amount"><input type="radio" name="card" value="${esc(c.id)}"${c.id === pick ? ' checked' : ''} /><span>${money(c.price)}${c.value > c.price ? `<small>+ ${money(c.value - c.price)}</small>` : ''}</span></label>`,
      )
      .join('');
    const c = cards.find((x) => x.id === pick);
    const bonus = c ? c.value - c.price : 0;
    $('#gift-bonus').hidden = !bonus;
    $('#gift-bonus').textContent = bonus ? S('giftWorth', { v: money(c.value) }) : '';
  };
  onLang(() => {
    const best = cards.find((c) => c.value > c.price);
    $('#gift-offer').textContent = best ? S('giftOffer', { a: money(best.price), b: money(best.value - best.price) }) : '';
    drawCards();
  });
  $('#amounts').addEventListener('change', (e) => {
    pick = e.target.value;
    drawCards();
  });
  const setQty = (n) => {
    qty = Math.max(1, Math.min(10, n));
    $('#g-qty').textContent = String(qty);
  };
  $('#g-minus').addEventListener('click', () => setQty(qty - 1));
  $('#g-plus').addEventListener('click', () => setQty(qty + 1));
  $('#gift-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = cards.find((x) => x.id === pick);
    if (!c) return;
    const f = e.target.elements;
    cart.add({ kind: 'giftcard', id: c.id, amount: c.price, value: c.value, to: f.to.value.trim(), message: f.message.value.trim(), qty });
    f.to.value = '';
    f.message.value = '';
    document.getElementById('cart-button')?.click();
  });

  // The cards Huidly sells right now (price and value can change there without a new site).
  api
    .giftCards()
    .then((r) => {
      if (!r?.giftCards?.length) return;
      cards = r.giftCards.map((g) => ({ id: g.id, price: g.price, value: g.value }));
      if (!cards.some((c) => c.id === pick)) pick = cards.find((c) => c.id === params.get('bon'))?.id ?? cards[0].id;
      drawCards();
    })
    .catch(() => {});
}
