import { LOCATIONS, PRODUCTS, productById, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useCallback } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk, useShared } from '../../context';
import { SEED_SUPPLIERS, seedMoves, seedOrders, seedProductInfo, type Move, type ProductInfo, type StockOrder, type Supplier } from '../../data/stock';
import { seedStock, type StockLevels } from '../../data/shared';
import { Chip, isolate } from '../../kit';

/**
 * Everything the stock screen keeps, as shared module state: the levels (also changed by Facturen), product details,
 * suppliers, orders and the movements booked in the demo. Every part of the screen reads it through this hook.
 */
export function useStock() {
  const { today, now } = usePraktijk();
  const [stock, setStock] = useShared<StockLevels>('stock', seedStock);
  const [info, setInfo] = useShared<Record<ProductId, ProductInfo>>('stockInfo', seedProductInfo);
  const [suppliers, setSuppliers] = useShared<Supplier[]>('stockSuppliers', () => SEED_SUPPLIERS);
  const [orders, setOrders] = useShared<StockOrder[]>('stockOrders', () => seedOrders(today));
  const [booked, setBooked] = useShared<Move[]>('stockMoves', () => []);
  const [seeded] = useShared<Move[]>('stockMovesSeed', () => seedMoves(today));

  /** Books movements: the levels change and the log gets a line per movement. */
  const book = useCallback(
    (list: Omit<Move, 'id' | 'at'>[]) => {
      const at = new Date(now);
      setStock((s) => {
        const next = { ...s } as StockLevels;
        for (const m of list) next[m.locationId] = { ...next[m.locationId], [m.product]: Math.max(0, next[m.locationId][m.product] + m.qty) };
        return next;
      });
      setBooked((b) => [...list.map((m, i) => ({ ...m, at, id: `d-${at.getTime()}-${i}-${b.length}` })), ...b]);
    },
    [now, setStock, setBooked],
  );

  const products = PRODUCTS.filter((p) => !info[p.id].deleted);
  return { stock, setStock, info, setInfo, suppliers, setSuppliers, orders, setOrders, booked, seeded, book, products };
}

/** "ZO Skin Health Gentle Cleanser", or a set's own name in the reader's language. */
export function useProductName() {
  const { text } = useI18n();
  return useCallback(
    (id: ProductId) => {
      const p = productById(id);
      if (!p) return id;
      // Brand products have Latin names in every language: keep brand and name together as one run in Arabic.
      return p.brand ? isolate(`${p.brand} ${text(p.name)}`) : text(p.name);
    },
    [text],
  );
}

export type Level = 'ok' | 'low' | 'out' | 'unavailable';

export function levelOf(level: number, min: number, soldOut?: boolean): Level {
  if (soldOut) return 'unavailable';
  if (level <= 0) return 'out';
  if (level < min) return 'low';
  return 'ok';
}

const TONE = { ok: 'good', low: 'warn', out: 'bad', unavailable: 'outline' } as const;

export function LevelChip({ level }: { level: Level }) {
  const { t } = useI18n();
  return <Chip tone={TONE[level]}>{t(`pk.voorraad.status.${level}`)}</Chip>;
}

export const cityOf = (id: LocationId) => LOCATIONS.find((l) => l.id === id)?.city ?? '';

/** yyyy-mm-dd for a date input, in local time. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromIsoDay = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};
