// Shop: every product the clinic sells, filtered by kind; add to the cart here or open the product. Stock comes from
// Huidly (Webshop & voorraad in Pure's program): a product that is gone or taken off the shop shows "sold out".
import { $, $$, L, S, cart, data, dealsForProduct, esc, money, onLang, params, productById, productLink, watch } from '../core.js';
import { api } from '../api.js';
import { productImage } from '../shell.js';

const KINDS = ['all', 'face', 'aftercare', 'body', 'kits'];
let kind = KINDS.includes(params.get('soort')) ? params.get('soort') : 'all';
export const soldOut = new Set();
const stockHooks = [];
/** Asks Huidly once which products can be ordered; redraws whoever listens. */
export function loadStock(onDone) {
  if (onDone) stockHooks.push(onDone);
  if (loadStock.started) return;
  loadStock.started = true;
  api
    .products()
    .then((r) => {
      for (const p of r?.products ?? []) {
        if (!p.available) soldOut.add(p.id);
        // Huidly is where Pure keeps price and photo; the site's own copy is only the starting point.
        const mine = productById[p.id];
        if (!mine) continue;
        if (typeof p.price === 'number') mine.price = p.price;
        if (p.image) mine.image = p.image;
      }
      stockHooks.forEach((fn) => fn());
    })
    .catch(() => {});
}

export function productTile(p) {
  const gone = soldOut.has(p.id);
  return `<li class="shop-item card" data-kind="${p.category}">
    <a class="shop-link" href="${productLink(p.id)}">
      <figure><img src="${esc(productImage(p))}" alt="" loading="lazy" />${dealsForProduct(p.id).length ? `<span class="deal-badge">${esc(L(dealsForProduct(p.id)[0].campaign.name))}</span>` : ''}</figure>
      <p class="brand-name">${esc(p.brand ?? 'Pure Clinics')}</p>
      <h3>${esc(L(p.name))}</h3>
      ${dealsForProduct(p.id).map(({ deal }) => `<p class="deal-line">${esc(L(deal.text))}</p>`).join('')}
    </a>
    <div class="shop-buy"><span class="price">${money(p.price)}</span>${
      gone ? `<span class="sold-out">${S('soldOut')}</span>` : `<button type="button" class="btn btn-line btn-small" data-add="${p.id}">${S('addToCart')}</button>`
    }</div>
  </li>`;
}

export function bindAdd(scope) {
  scope.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    cart.add({ kind: 'product', id: b.dataset.add });
    b.textContent = S('added');
    b.classList.add('done');
    setTimeout(() => {
      b.textContent = S('addToCart');
      b.classList.remove('done');
    }, 1600);
  });
}

export function start() {
  const grid = $('#shop-grid');
  const draw = () => {
    $('#shop-filters').innerHTML = KINDS.map((k) => `<button type="button" role="tab" data-k="${k}" aria-selected="${k === kind}">${S('kind_' + k)}</button>`).join('');
    const list = data.products.filter((p) => kind === 'all' || p.category === kind);
    grid.innerHTML = list.map(productTile).join('');
    $('#shop-count').textContent = S('productCount', { n: list.length });
    watch(grid);
  };
  $('#shop-filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    kind = b.dataset.k;
    draw();
    $$('.shop-item', grid).forEach((el) => el.classList.add('in'));
  });
  bindAdd(grid);
  onLang(draw);
  loadStock(() => {
    draw();
    $$('.shop-item', grid).forEach((el) => el.classList.add('in'));
  });
}
