// One treatment, on its own page: what it is, how it works, sessions and price, the clinic's own before-and-after
// photos, aftercare, questions, products that fit and the treatments next to it. ?id=<treatment id> picks it.
import {
  $,
  L,
  S,
  bookLink,
  byId,
  data,
  dealsFor,
  esc,
  img,
  link,
  money,
  onLang,
  params,
  photo,
  priceLine,
  productLink,
  treatmentLink,
  treatments,
  untilLine,
  watch,
} from '../core.js';
import { laserPackages, results } from '../parts.js';
import { PRODUCT_RENDER } from '../shell.js';

const t = byId[params.get('id')];

export function start() {
  if (!t) {
    location.replace(link('behandelingen/'));
    return;
  }
  document.body.dataset.title = '';
  onLang(draw);
  results({ ids: [t.id], perTreatment: 3 });
  if (t.id === 'laser') laserPackages();
  else $('#t-laser')?.remove();
}

function draw() {
  const i = t.info ?? {};
  document.title = `${L(t.name)} · Pure Clinics`;
  $('#t-crumb').textContent = L(t.name);
  $('#t-cat').textContent = t.category === 'consult' ? S('cat_consult') : S('cat_' + t.category);
  $('#t-name').textContent = L(t.name);
  $('#t-intro').textContent = L(i.intro) || L(t.description);
  $('#t-photo').src = photo(t.photo, false);

  const facts = [
    i.sessions && [S('sessions'), L(i.sessions)],
    i.interval && [S('interval'), L(i.interval)],
    i.downtime && [S('downtime'), L(i.downtime)],
    [S('duration'), S('minutes', { m: t.minutes })],
    [S('price'), priceLine(t)],
  ].filter(Boolean);
  $('#t-facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');

  const deals = dealsFor(t.id);
  $('#t-deal').innerHTML = deals
    .map(({ campaign, deal }) => `<p class="deal-note"><b>${esc(L(campaign.name))}</b> ${esc(L(deal.text))} <small>${untilLine(campaign)}</small></p>`)
    .join('');

  $('#t-book').href = bookLink(t.id);
  $('#t-book').textContent = t.id === 'consult' ? S('ctaIntakePlan') : S('bookThis');
  const intake = $('#t-intake');
  intake.hidden = t.id === 'consult';
  intake.href = bookLink('consult');
  intake.textContent = S('ctaIntake');

  $('#t-text').innerHTML = [
    i.how && `<h2 class="card-title">${S('howH')}</h2><p>${esc(L(i.how))}</p>`,
    i.results && `<h2 class="card-title">${S('resultH')}</h2><p>${esc(L(i.results))}</p>`,
    i.aftercare?.length && `<h2 class="card-title">${S('aftercareH')}</h2><ul class="ticks">${i.aftercare.map((a) => `<li>${esc(L(a))}</li>`).join('')}</ul>`,
  ]
    .filter(Boolean)
    .join('');
  $('#t-aside').innerHTML = `
    <div class="aside-card">
      <p class="eyebrow">${S('price')}</p>
      <p class="aside-price">${priceLine(t)}</p>
      ${t.insurable ? `<p class="insured">${S('insurable')}</p><p class="fine">${S('q2Body')}</p>` : ''}
      <a class="btn btn-solid" href="${bookLink(t.id)}">${t.id === 'consult' ? S('ctaIntakePlan') : S('bookThis')}</a>
      <p class="fine">${S('orCall')} <a href="tel:+31246792236">${data.clinic.phone}</a></p>
    </div>`;

  // Questions the clinic answers about this treatment
  const faq = i.faq ?? [];
  $('#t-faq').hidden = !faq.length;
  $('#t-faq-list').innerHTML = faq.map((f) => `<details><summary><span>${esc(L(f.q))}</span></summary><div class="faq-answer"><p>${esc(L(f.a))}</p></div></details>`).join('');

  // Products that go with it (the clinic's own "after" list)
  const products = data.products.filter((p) => p.after?.includes(t.id));
  $('#t-products').hidden = !products.length;
  $('#t-product-list').innerHTML = products
    .map(
      (p) => `<a class="product-tile" href="${productLink(p.id)}">
        <figure><img src="${img(`products/${PRODUCT_RENDER[p.id] ?? 'jar'}.webp`)}" alt="" loading="lazy" /></figure>
        <p class="brand-name">${esc(p.brand ?? 'Pure Clinics')}</p><h3>${esc(L(p.name))}</h3><p class="price">${money(p.price)}</p>
      </a>`,
    )
    .join('');

  // The treatments next to it
  const more = treatments.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 4);
  $('#t-more').hidden = !more.length;
  $('#t-more-list').innerHTML = more
    .map(
      (x) => `<a class="more-tile" href="${treatmentLink(x.id)}"><figure><img src="${photo(x.photo)}" alt="" loading="lazy" /></figure><h3>${esc(L(x.name))}</h3><p>${priceLine(x)}</p></a>`,
    )
    .join('');
  watch();
}
