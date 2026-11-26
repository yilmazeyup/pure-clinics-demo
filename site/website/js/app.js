// Every page of the website loads this file. The page says what it is (<body data-page>); the frame comes from
// site/shell.js and the page's own parts from site/pages/<page>.js.
import { refreshFromHuidly, runLang, watch } from './site/core.js';
import { drawGiftOffer, showGiftNote, startShell } from './site/shell.js';
import { startTracking } from './site/track.js';

const PAGES = {
  home: () => import('./site/pages/home.js'),
  treatments: () => import('./site/pages/treatments.js'),
  treatment: () => import('./site/pages/treatment.js'),
  results: () => import('./site/pages/results.js'),
  prices: () => import('./site/pages/prices.js'),
  shop: () => import('./site/pages/shop.js'),
  product: () => import('./site/pages/product.js'),
  giftcard: () => import('./site/pages/giftcard.js'),
  about: () => import('./site/pages/about.js'),
  faq: () => import('./site/pages/faq.js'),
  booking: () => import('./site/pages/booking.js'),
  account: () => import('./site/pages/account.js'),
  checkout: () => import('./site/pages/checkout.js'),
  privacy: () => import('./site/pages/privacy.js'),
};

const page = document.body.dataset.page;
startShell();
const mod = await (PAGES[page] ?? PAGES.home)();
mod.start?.();
runLang();
watch();
startTracking(page);
// Campaigns and the gift card offer as Pure keeps them in Huidly; the page redraws if they differ from the site's copy.
refreshFromHuidly().then((changed) => {
  if (!changed) return;
  runLang();
  drawGiftOffer();
});
// The home page opens with its loader and shows the gift card note itself, once the loader is gone.
if (page !== 'home') {
  requestAnimationFrame(() => document.body.classList.add('loaded'));
  showGiftNote(1400);
}
await mod.after?.();
