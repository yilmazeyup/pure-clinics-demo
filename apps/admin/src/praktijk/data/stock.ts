import { addDays, LOCATIONS, PRODUCTS, productById, startOfDay, type LocationId, type ProductId } from '@pure-clinics/shared';

import { between, personName, pick, rng } from '../../data/random';
import { clinicOfOrder, ordersUntil, shopDay } from '../../data/shop';
import type { StaffId } from './core';
import { seedStock, type StockLevels } from './shared';

// Stock of the products Pure sells at the desk and in the webshop. There is one stock per clinic: a webshop order goes
// out of the stock of the clinic nearest to the customer, so webshop sales are counted in. The levels themselves are
// shared state (useShared('stock', seedStock)); this file adds what only the stock screen needs: suppliers, purchase
// prices and minimums, the movements that led to today's levels, orders, what is sold, when a product will run out, and
// customer reviews. Supplier names, contacts and reviews are invented.

/** The four seeded suppliers have a word as id; one added in the demo gets its own. */
export type SupplierId = string;

export type Supplier = {
  id: SupplierId;
  name: string;
  contact: string;
  email: string;
  phone: string;
  /** Working days between ordering and delivery. */
  leadDays: number;
  /** Sends the request e-mail by itself once something drops below its minimum; otherwise it waits for approval. */
  auto: boolean;
};

export const SEED_SUPPLIERS: Supplier[] = [
  { id: 'huidhuis', name: 'Huidhuis Distributie', contact: 'Ingrid Vermeer', email: 'bestellen@huidhuis.example', phone: '088 000 1201', leadDays: 2, auto: true },
  { id: 'atelier', name: 'Atelier Cosmetica Oost', contact: 'Bram Lindeman', email: 'orders@atelier-oost.example', phone: '088 000 1202', leadDays: 3, auto: false },
  { id: 'haarlijn', name: 'Haarlijn Groothandel', contact: 'Sanne Kortekaas', email: 'info@haarlijn.example', phone: '088 000 1203', leadDays: 4, auto: false },
  { id: 'verpakking', name: 'Verpakkingshuis Gelderland', contact: 'Joost Ravensberg', email: 'sets@verpakkingshuis.example', phone: '088 000 1204', leadDays: 5, auto: false },
];

export type ProductInfo = {
  /** Sale price incl. VAT; starts at the webshop price. */
  price: number;
  purchase: number;
  vat: 0 | 9 | 21;
  /** Below this the product goes on the order list. */
  min: Record<LocationId, number>;
  supplier: SupplierId;
  /** An in-store EAN-13 (prefix 20), so the barcode scanner has something to read. */
  barcode: string;
  deleted: boolean;
};

const SUPPLIER_OF: Record<ProductId, SupplierId> = {
  'zo-cleanser': 'huidhuis',
  'zo-defense': 'huidhuis',
  'zo-spf': 'huidhuis',
  'lycogel-camouflage': 'atelier',
  'wiqo-cream': 'atelier',
  'xlhair-revitalix': 'haarlijn',
  'xlhair-scalpfit': 'haarlijn',
  'xlhair-spray': 'haarlijn',
  'camouflage-set': 'verpakking',
  'laser-aftercare-set': 'verpakking',
};

/** EAN-13 with its check digit. */
function ean(base12: string): string {
  const sum = base12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

export function seedProductInfo(): Record<ProductId, ProductInfo> {
  const r = rng('pk-stock-info');
  const out = {} as Record<ProductId, ProductInfo>;
  PRODUCTS.forEach((p, i) => {
    out[p.id] = {
      price: p.price,
      purchase: Math.round(p.price * (0.46 + r() * 0.1) * 100) / 100,
      vat: 21,
      min: { nijmegen: between(r, 4, 8), uden: between(r, 2, 5) },
      supplier: SUPPLIER_OF[p.id],
      barcode: ean(`20${String(4100 + i * 37).padStart(4, '0')}${String(between(r, 100000, 999999))}`),
      deleted: false,
    };
  });
  return out;
}

export type MoveReason = 'sale' | 'treatment' | 'correction' | 'return' | 'received' | 'credit';

/** Where a sale was made: at the desk of the clinic, or in the webshop (sent from the nearest clinic). */
export type SaleChannel = 'desk' | 'webshop';

export type Move = {
  id: string;
  at: Date;
  locationId: LocationId;
  product: ProductId;
  /** Positive comes in, negative goes out. */
  qty: number;
  reason: MoveReason;
  by: StaffId;
  /** For a sale; left out means the desk. */
  channel?: SaleChannel;
};

/** A small stable number from a text, so a seeded move can get its channel without changing the seeded history. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  // Mix the bits once more, so ids that differ only in their last characters still land far apart.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Roughly four in ten sales in Nijmegen and three in ten in Uden are webshop orders sent from that clinic. */
const WEBSHOP_SHARE: Record<LocationId, number> = { nijmegen: 0.42, uden: 0.3 };

const HISTORY_DAYS = 70;
export const HISTORY_START = (today: Date) => addDays(startOfDay(today), -HISTORY_DAYS);

const BY: Record<LocationId, StaffId[]> = { nijmegen: ['husna', 'loubna', 'maud', 'margot'], uden: ['nadila', 'sam'] };

/**
 * The movements of the last ten weeks, worked out backwards from today's levels so that they add up: sales and use in
 * treatments take stock out, deliveries bring it in, and the level never drops below zero on any day.
 */
export function seedMoves(today: Date): Move[] {
  const r = rng(`pk-moves-${startOfDay(today).getTime()}`);
  const levels = seedStock();
  const moves: Move[] = [];
  const aftercare = new Set<ProductId>(['zo-spf', 'lycogel-camouflage', 'wiqo-cream', 'laser-aftercare-set']);
  for (const l of LOCATIONS) {
    for (const p of PRODUCTS) {
      if (p.soldOut) continue;
      let level = levels[l.id][p.id];
      // From yesterday back: today's movements are the ones booked in the demo, at the demo's own time.
      for (let back = 1; back < HISTORY_DAYS; back++) {
        const day = addDays(startOfDay(today), -back);
        if (day.getDay() === 0) continue;
        const at = new Date(day);
        at.setHours(between(r, 10, 17), pick(r, [0, 10, 20, 30, 40, 50]), 0, 0);
        const roll = r();
        let qty = 0;
        let reason: MoveReason = 'sale';
        if (roll < (l.id === 'nijmegen' ? 0.2 : 0.12)) {
          qty = -between(r, 1, 2);
          reason = 'sale';
        } else if (aftercare.has(p.id) && roll < 0.28) {
          qty = -1;
          reason = 'treatment';
        } else if (roll > 0.955 && level > 8) {
          // Going back past a delivery: the shelf held fewer before it came.
          qty = between(r, 6, Math.min(12, level));
          reason = 'received';
        } else if (roll > 0.948) {
          qty = pick(r, [-1, 1]);
          reason = 'correction';
        }
        if (!qty) continue;
        // Walking back in time: before an outgoing move there was more, before an incoming one less.
        if (level - qty < 0) continue;
        level -= qty;
        const id = `m-${l.id}-${p.id}-${back}`;
        const channel: SaleChannel | undefined = reason === 'sale' ? (hash(id) < WEBSHOP_SHARE[l.id] ? 'webshop' : 'desk') : undefined;
        moves.push({ id, at, locationId: l.id, product: p.id, qty, reason, by: pick(r, BY[l.id]), channel });
      }
    }
  }
  return moves.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * The levels at the end of a day in the past: the seeded levels with every seeded move after that day undone. Moves
 * made in the demo all happen today, so they never change a day before today.
 */
export function levelsOn(day: Date, seeded: Move[]): StockLevels {
  const levels = seedStock();
  const end = addDays(startOfDay(day), 1).getTime();
  for (const m of seeded) if (m.at.getTime() >= end) levels[m.locationId][m.product] -= m.qty;
  return levels;
}

export type OrderLine = { product: ProductId; locationId: LocationId; qty: number; received?: number };

export type StockOrder = {
  id: string;
  number: string;
  supplier: SupplierId;
  lines: OrderLine[];
  placed: Date;
  expected: Date;
  receivedAt: Date | null;
  /** Sent as a request e-mail from the request list; `auto` when it went by itself. */
  mail?: { to: string; subject: string; auto: boolean };
};

/** Working days after a date: Sunday and Saturday do not count for a delivery. */
export function addWorkdays(day: Date, n: number): Date {
  let d = startOfDay(day);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** Working days before a date: the last day to order so a delivery still arrives in time. */
export function minusWorkdays(day: Date, n: number): Date {
  let d = startOfDay(day);
  let left = n;
  while (left > 0) {
    d = addDays(d, -1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

/** One order on its way and two delivered, so both lists have something to show. */
export function seedOrders(today: Date): StockOrder[] {
  const day = startOfDay(today);
  return [
    {
      id: 'o-3',
      number: 'B-2026-118',
      supplier: 'haarlijn',
      lines: [
        { product: 'xlhair-revitalix', locationId: 'nijmegen', qty: 8 },
        { product: 'xlhair-scalpfit', locationId: 'uden', qty: 6 },
      ],
      placed: addDays(day, -2),
      expected: addWorkdays(addDays(day, -2), 4),
      receivedAt: null,
    },
    {
      id: 'o-2',
      number: 'B-2026-112',
      supplier: 'huidhuis',
      lines: [
        { product: 'zo-spf', locationId: 'nijmegen', qty: 12, received: 12 },
        { product: 'zo-cleanser', locationId: 'uden', qty: 6, received: 6 },
      ],
      placed: addDays(day, -9),
      expected: addWorkdays(addDays(day, -9), 2),
      receivedAt: addWorkdays(addDays(day, -9), 2),
    },
    {
      id: 'o-1',
      number: 'B-2026-104',
      supplier: 'atelier',
      lines: [{ product: 'lycogel-camouflage', locationId: 'nijmegen', qty: 6, received: 5 }],
      placed: addDays(day, -20),
      expected: addWorkdays(addDays(day, -20), 3),
      receivedAt: addWorkdays(addDays(day, -20), 4),
    },
  ];
}

/* ---------- What is sold ---------- */

export type Sold = { desk: number; webshop: number; treatment: number };

/** Units sold (desk and webshop) and used in treatments in the last `days` days, today included, per product. */
export function soldIn(moves: Move[], today: Date, days: number, where: LocationId | 'all'): Record<ProductId, Sold> {
  const from = addDays(startOfDay(today), -(days - 1)).getTime();
  const out = Object.fromEntries(PRODUCTS.map((p) => [p.id, { desk: 0, webshop: 0, treatment: 0 }])) as Record<ProductId, Sold>;
  for (const m of moves) {
    if (m.qty >= 0 || m.at.getTime() < from || (where !== 'all' && m.locationId !== where)) continue;
    const row = out[m.product];
    if (!row) continue;
    if (m.reason === 'sale') row[m.channel ?? 'desk'] += -m.qty;
    else if (m.reason === 'treatment') row.treatment += -m.qty;
  }
  return out;
}

/* ---------- When it runs out ---------- */

/** The average use is taken over the last four weeks. */
export const USE_DAYS = 28;

/** `week`: gone within seven days; `month`: within thirty; `later`: further off; `none`: nothing went out lately. */
export type RunOut = 'out' | 'week' | 'month' | 'later' | 'none';

export type Forecast = {
  product: ProductId;
  locationId: LocationId;
  level: number;
  onWay: number;
  /** Units out (sold and used) per day, on average over the last four weeks. */
  perDay: number;
  /** Days until the shelf is empty, counting what is on its way; null when nothing went out lately. */
  daysLeft: number | null;
  runOut: Date | null;
  /** The last working day to order so the delivery arrives before the shelf is empty. */
  orderBy: Date | null;
  leadDays: number;
  bucket: RunOut;
};

/**
 * For every product at every clinic: how fast it goes, and when it will be gone. What is already on its way counts as
 * stock; a product the supplier cannot deliver is left out.
 */
export function forecastAll(input: {
  moves: Move[];
  today: Date;
  stock: StockLevels;
  info: Record<ProductId, ProductInfo>;
  suppliers: Supplier[];
  orders: StockOrder[];
}): Forecast[] {
  const { moves, today, stock, info, suppliers, orders } = input;
  const from = addDays(startOfDay(today), -USE_DAYS).getTime();
  const used = new Map<string, number>();
  for (const m of moves) {
    if (m.qty >= 0 || m.at.getTime() < from || (m.reason !== 'sale' && m.reason !== 'treatment')) continue;
    const k = `${m.product}@${m.locationId}`;
    used.set(k, (used.get(k) ?? 0) - m.qty);
  }
  const onWay = new Map<string, number>();
  for (const o of orders) {
    if (o.receivedAt) continue;
    for (const l of o.lines) onWay.set(`${l.product}@${l.locationId}`, (onWay.get(`${l.product}@${l.locationId}`) ?? 0) + l.qty);
  }
  const out: Forecast[] = [];
  for (const p of PRODUCTS) {
    const d = info[p.id];
    if (p.soldOut || d.deleted) continue;
    const leadDays = suppliers.find((s) => s.id === d.supplier)?.leadDays ?? 3;
    for (const l of LOCATIONS) {
      const k = `${p.id}@${l.id}`;
      const level = stock[l.id][p.id];
      const coming = onWay.get(k) ?? 0;
      const perDay = (used.get(k) ?? 0) / USE_DAYS;
      const daysLeft = perDay > 0 ? (level + coming) / perDay : null;
      const runOut = daysLeft === null ? null : addDays(startOfDay(today), Math.floor(daysLeft));
      const orderBy = runOut ? minusWorkdays(runOut, leadDays) : null;
      const bucket: RunOut =
        level + coming <= 0 ? 'out' : daysLeft === null ? 'none' : daysLeft <= 7 ? 'week' : daysLeft <= 30 ? 'month' : 'later';
      out.push({ product: p.id, locationId: l.id, level, onWay: coming, perDay, daysLeft, runOut, orderBy, leadDays, bucket });
    }
  }
  const rank = (f: Forecast) => (f.bucket === 'out' ? -1 : (f.daysLeft ?? 1e6));
  return out.sort((a, b) => rank(a) - rank(b));
}

/** How many to ask for: up to twice the minimum, at least one, minus what is there and on its way. */
export const suggestedQty = (level: number, onWay: number, min: number) => Math.max(1, min * 2 - level - onWay);

/* ---------- Request list ---------- */

/** A product put on the request list by hand, next to the ones below their minimum that come on by themselves. */
export type StockRequest = { product: ProductId; locationId: LocationId; at: Date };

/** The request e-mail to a supplier. It always goes in Dutch: the suppliers are Dutch, whatever language the panel is in. */
export function requestMail(supplier: Supplier, lines: { product: ProductId; locationId: LocationId; qty: number }[]): { to: string; subject: string; body: string } {
  const nameOf = (id: ProductId) => {
    const p = productById(id);
    return p ? `${p.brand ? `${p.brand} ` : ''}${p.name.nl}` : id;
  };
  const cities = LOCATIONS.filter((l) => lines.some((x) => x.locationId === l.id));
  const body = [
    `Beste ${supplier.contact || supplier.name},`,
    '',
    'Graag bestellen wij het volgende:',
    '',
    ...lines.map((l) => `– ${l.qty}× ${nameOf(l.product)} · voor ${LOCATIONS.find((x) => x.id === l.locationId)?.city ?? ''}`),
    '',
    cities.length > 1 ? 'Afleveradressen:' : 'Afleveradres:',
    ...cities.map((l) => `Pure Clinics ${l.city}, ${l.address} ${l.city}`),
    '',
    'Wilt u de bestelling bevestigen, met de verwachte leverdatum?',
    '',
    'Met vriendelijke groet,',
    'Team Pure Clinics',
  ].join('\n');
  return { to: supplier.email, subject: `Bestelling Pure Clinics · ${lines.reduce((n, l) => n + l.qty, 0)} stuks`, body };
}

/* ---------- Reviews ---------- */

export type Review = {
  id: string;
  product: ProductId;
  /** "Emma B.": first name and initial only. */
  name: string;
  rating: 3 | 4 | 5;
  /** The text: `pk.voorraad.rev.t.<category>.<n>`; n 1–4 for four and five stars, 5 for three. */
  text: number;
  at: Date;
  /** Bought in the webshop or at the desk. */
  channel: SaleChannel;
};

/** Three to seven fictional reviews per product from the last few months, the same on every load. */
export function seedReviews(today: Date): Review[] {
  const r = rng('pk-reviews');
  const out: Review[] = [];
  for (const p of PRODUCTS) {
    const n = p.soldOut ? 3 : between(r, 3, 7);
    for (let i = 0; i < n; i++) {
      const roll = r();
      const rating: Review['rating'] = roll < 0.62 ? 5 : roll < 0.9 ? 4 : 3;
      out.push({
        id: `rev-${p.id}-${i}`,
        product: p.id,
        name: personName(r),
        rating,
        // The hairspray only gets the lines that fit a spray (fuller hair, together with the treatment).
        text: rating === 3 ? 5 : p.id === 'xlhair-spray' ? pick(r, [2, 4]) : between(r, 1, 4),
        at: addDays(startOfDay(today), -between(r, 1, 120)),
        channel: r() < 0.7 ? 'webshop' : 'desk',
      });
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Today's webshop orders so far, as stock movements: each order goes out of the clinic nearest to the customer. These are
 * the same orders the overview's webshop shelf takes off, so the two show the same stock.
 */
export function webshopToday(now: Date): Move[] {
  return ordersUntil(shopDay(now), now).flatMap((order) =>
    order.lines.map((line, i) => ({
      id: `w-${order.number}-${i}`,
      at: order.at,
      locationId: clinicOfOrder(order),
      product: line.product.id,
      qty: -line.qty,
      reason: 'sale' as const,
      // Nobody at the desk booked it; the log shows WEB for webshop sales.
      by: 'husna' as StaffId,
      channel: 'webshop' as const,
    })),
  );
}

/** The shelves as they stand now: the start of today with today's webshop orders so far taken off. */
export function stockAt(now: Date): StockLevels {
  const levels = seedStock();
  for (const m of webshopToday(now)) levels[m.locationId][m.product] = Math.max(0, levels[m.locationId][m.product] + m.qty);
  return levels;
}
