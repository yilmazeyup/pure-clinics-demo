import { LOCATIONS, PRODUCTS, type LocationId, type ProductId } from '@pure-clinics/shared';

import { between, rng } from './random';

// What stands on the shelves at the start, per clinic: the one stock of the business. Kliniek starts from it, and so
// does the webshop at Huidly (the catalogue carries it, api/src/catalog/pure.json "stock"). Once anything changes, the
// stock is the piece "stock" kept at Huidly: Kliniek's counts and the webshop's sales both change that one piece.

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
