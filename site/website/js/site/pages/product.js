// One product: what it is, its price, the treatments it goes with, and add to the cart.
import { $, L, S, byId, cart, data, dealsForProduct, esc, link, money, onLang, params, productById, treatmentLink, untilLine, watch } from '../core.js';
import { productImage } from '../shell.js';
import { bindAdd, loadStock, productTile, soldOut } from './shop.js';
import { track } from '../track.js';

const p = productById[params.get('id')];
let qty = 1;

export function start() {
  if (!p) {
    location.replace(link('shop/'));
    return;
  }
  track('view_item', { item_category: 'product', item_id: p.id, item_name: p.name.nl, item_brand: p.brand ?? 'Pure Clinics', price: p.price, currency: 'EUR', value: p.price });
  $('#p-photo').src = productImage(p);
  const setQty = (n) => {
    qty = Math.max(1, Math.min(9, n));
    $('#p-qty').textContent = String(qty);
  };
  $('#p-minus').addEventListener('click', () => setQty(qty - 1));
  $('#p-plus').addEventListener('click', () => setQty(qty + 1));
  $('#p-add').addEventListener('click', () => {
    cart.add({ kind: 'product', id: p.id, qty });
    const b = $('#p-add');
    b.textContent = S('added');
    setTimeout(() => (b.textContent = S('addToCart')), 1600);
    document.getElementById('cart-button')?.click();
  });
  bindAdd($('#p-more'));
  loadStock(() => {
    if (!soldOut.has(p.id)) return;
    $('#p-add').disabled = true;
    $('#p-add').textContent = S('soldOut');
  });
  onLang(() => {
    document.title = `${L(p.name)} · Pure Clinics`;
    $('#p-crumb').textContent = L(p.name);
    $('#p-brand').textContent = p.brand ?? 'Pure Clinics';
    $('#p-name').textContent = L(p.name);
    $('#p-price').textContent = money(p.price);
    $('#p-desc').textContent = L(p.description);
    $('#p-photo').src = productImage(p);
    $('#p-deal').innerHTML = dealsForProduct(p.id)
      .map(({ campaign, deal }) => `<p class="deal-note"><b>${esc(L(campaign.name))}</b> ${esc(L(deal.text))} <small>${untilLine(campaign)}</small></p>`)
      .join('');
    const fits = (p.after ?? []).filter((id) => byId[id]);
    $('#p-fits').innerHTML = fits.length
      ? `<p class="eyebrow">${S('fitsAfter')}</p><ul class="chips">${fits.map((id) => `<li><a class="chip" href="${treatmentLink(id)}">${esc(L(byId[id].name))}</a></li>`).join('')}</ul>`
      : '';
    const more = data.products.filter((x) => x.id !== p.id && (x.category === p.category || x.brand === p.brand)).slice(0, 4);
    $('#p-more').innerHTML = more.map(productTile).join('');
    watch($('#p-more'));
  });
}
