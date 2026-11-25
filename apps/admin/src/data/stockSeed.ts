import { LOCATIONS, PRODUCTS, type LocationId, type ProductId } from '@pure-clinics/shared';

import { between, rng } from './random';

// What stands on the shelves at the start of today, per clinic. One seed for the whole panel: the stock screen in
// Kliniek starts from it, and the overview's webshop shelf shows the two clinics together, because a webshop order is
// sent from the clinic nearest to the customer. Today's webshop orders come off it in both places.

export type StockLevels = Record<LocationId, Record<ProductId, number>>;

/** Units on the shelf per location; a few run low so the order list has something to show. */
export function seedStock(): StockLevels {
  const r = rng('pk-stock');
  const levels = {} as StockLevels;
  for (const l of LOCATIONS) {
    levels[l.id] = {} as Record<ProductId, number>;
    for (const p of PRODUCTS) levels[l.id][p.id] = p.soldOut ? 0 : between(r, 1, l.id === 'nijmegen' ? 24 : 14);
  }
  return levels;
}
