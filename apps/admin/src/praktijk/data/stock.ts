import { addDays, LOCATIONS, PRODUCTS, startOfDay, type LocationId, type ProductId } from '@pure-clinics/shared';

import { between, pick, rng } from '../../data/random';
import type { StaffId } from './core';
import { seedStock, type StockLevels } from './shared';

// Stock of the products Pure sells at the desk and in the webshop. The levels themselves are shared state
// (useShared('stock', seedStock)); this file adds what only the stock screen needs: suppliers, purchase prices and
// minimums, the movements that led to today's levels, and orders. Supplier names and contacts are invented.

export type SupplierId = 'huidhuis' | 'atelier' | 'haarlijn' | 'verpakking';

export type Supplier = {
  id: SupplierId;
  name: string;
  contact: string;
  email: string;
  phone: string;
  /** Working days between ordering and delivery. */
  leadDays: number;
};

export const SEED_SUPPLIERS: Supplier[] = [
  { id: 'huidhuis', name: 'Huidhuis Distributie', contact: 'Ingrid Vermeer', email: 'bestellen@huidhuis.example', phone: '088 000 1201', leadDays: 2 },
  { id: 'atelier', name: 'Atelier Cosmetica Oost', contact: 'Bram Lindeman', email: 'orders@atelier-oost.example', phone: '088 000 1202', leadDays: 3 },
  { id: 'haarlijn', name: 'Haarlijn Groothandel', contact: 'Sanne Kortekaas', email: 'info@haarlijn.example', phone: '088 000 1203', leadDays: 4 },
  { id: 'verpakking', name: 'Verpakkingshuis Gelderland', contact: 'Joost Ravensberg', email: 'sets@verpakkingshuis.example', phone: '088 000 1204', leadDays: 5 },
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

export type Move = {
  id: string;
  at: Date;
  locationId: LocationId;
  product: ProductId;
  /** Positive comes in, negative goes out. */
  qty: number;
  reason: MoveReason;
  by: StaffId;
};

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
        moves.push({ id: `m-${l.id}-${p.id}-${back}`, at, locationId: l.id, product: p.id, qty, reason, by: pick(r, BY[l.id]) });
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
