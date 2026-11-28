import { DEALS, LASER_ZONES, LOCALES, LOCATIONS, PRODUCTS, PURE_CLINICS, TREATMENTS, type L10n } from '@pure-clinics/shared';
import { AppState } from 'react-native';

import { api, type Catalog, type ShopProduct } from '../api';
import { sharedLoad } from './remote';

// Huidly is where Pure's offer lives: the treatments with their prices and durations, the two clinics with their
// addresses, phone numbers and opening hours, the business's phone and e-mail, and the webshop's products. The app
// ships with a copy of it (packages/shared, the same data Huidly's catalogue was made from) only so it has something to
// start from; every time it starts, while the splash screen still shows, it asks Huidly (GET catalog and products,
// no sign-in needed) and writes the answer onto that same copy, which is what every screen reads. Nothing is kept
// apart, so a price or an opening hour changed in Huidly is what the app shows from then on. Again when the app comes
// back to the foreground, at most every five minutes. Appointments, orders, gift cards, stock and the client's
// account were already Huidly's (api.ts, state/remote.ts).

type Product = (typeof PRODUCTS)[number];
type Hours = (typeof LOCATIONS)[number]['hours'];

/** When Huidly last answered, or null while the app still shows its built-in copy. */
export let huidlyAt: Date | null = null;

/** Huidly's texts carry more languages than the app; only the app's own are taken, and only when filled in. */
function texts(own: L10n, from: Partial<Record<string, string>> | undefined): L10n {
  if (!from) return own;
  const next = { ...own };
  for (const l of LOCALES) if (typeof from[l] === 'string' && from[l]!.trim()) next[l] = from[l]!;
  return next;
}

/** "09:30" -> 9.5, as the app's opening hours count. */
const hour = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m || 0) / 60;
};

type HuidlyCatalog = Catalog & {
  treatments: (Catalog['treatments'][number] & { name?: Partial<L10n>; description?: Partial<L10n> })[];
  /** Laser hair removal per zone, and the laser packages; read as soon as Huidly's catalogue carries them. */
  laserZones?: { id: string; price: number; name?: Partial<L10n> }[];
  deals?: { id: string; price: number; was?: number | null; zones?: Partial<L10n> }[];
};

export function applyCatalog(c: HuidlyCatalog) {
  if (c.business) {
    if (c.business.phone) PURE_CLINICS.phone = c.business.phone;
    if (c.business.email) PURE_CLINICS.email = c.business.email;
  }
  for (const l of c.locations ?? []) {
    const own = LOCATIONS.find((x) => x.id === l.id);
    if (!own) continue;
    own.city = l.city || own.city;
    own.address = l.address || own.address;
    own.phone = l.phone || own.phone;
    const hours: Hours = { ...own.hours };
    for (let day = 0; day < 7; day++) {
      const h = l.hours?.[String(day)];
      if (h === undefined) continue;
      hours[day] = h ? { open: hour(h.open), close: hour(h.close) } : null;
    }
    own.hours = hours;
  }
  for (const t of c.treatments ?? []) {
    const own = TREATMENTS.find((x) => x.id === t.id);
    if (!own) continue;
    if (Number.isFinite(t.priceFrom)) own.priceFrom = t.priceFrom;
    if (Number.isFinite(t.minutes) && t.minutes > 0) own.minutes = t.minutes;
    own.insurable = t.insurable ? true : undefined;
    own.name = texts(own.name, t.name);
    own.description = texts(own.description, t.description);
  }
  for (const z of c.laserZones ?? []) {
    const own = LASER_ZONES.find((x) => x.id === z.id);
    if (!own) continue;
    if (Number.isFinite(z.price)) own.price = z.price;
    own.name = texts(own.name, z.name);
  }
  for (const d of c.deals ?? []) {
    const own = DEALS.find((x) => x.id === d.id);
    if (!own) continue;
    if (Number.isFinite(d.price)) own.price = d.price;
    if (d.was !== undefined) own.was = d.was;
    own.zones = texts(own.zones, d.zones);
  }
}

export function applyProducts(products: (ShopProduct & { brand?: string | null; name?: Partial<L10n>; description?: Partial<L10n>; category?: string })[]) {
  for (const p of products) {
    const own = PRODUCTS.find((x) => x.id === p.id) as Product | undefined;
    if (!own) continue;
    if (Number.isFinite(p.price)) own.price = p.price;
    if (p.brand !== undefined) own.brand = p.brand;
    own.name = texts(own.name, p.name);
    own.description = texts(own.description, p.description);
    own.soldOut = p.available === false ? true : undefined;
  }
}

let last = 0;
let running: Promise<boolean> | null = null;

/** Asks Huidly for the offer and writes it onto the app's copy. Resolves true when Huidly answered, false when it did
 * not within `timeoutMs` (the app then starts from its copy, and the answer is still applied when it comes). */
export function loadFromHuidly(timeoutMs = 4000, fresh = false): Promise<boolean> {
  if (!running) {
    running = Promise.all([
      sharedLoad('catalog', api.catalog, fresh).then((c) => applyCatalog(c as HuidlyCatalog)),
      sharedLoad('products', api.products, fresh).then((r) => applyProducts(r.products ?? [])),
    ]).then(
      () => {
        huidlyAt = new Date();
        last = Date.now();
        return true;
      },
      () => false,
    );
    running.finally(() => {
      running = null;
    });
  }
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs));
  return Promise.race([running, timeout]);
}

let watching = false;
/** Loads again when the app comes back to the foreground, at most every five minutes. */
export function keepFromHuidly() {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - last > 5 * 60 * 1000) void loadFromHuidly(10000, true);
  });
}
