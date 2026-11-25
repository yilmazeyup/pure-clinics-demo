import { LOCATIONS, PRODUCTS, productById, type LocationId, type ProductId } from '@pure-clinics/shared';
import { createContext, useCallback, useContext, useMemo } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk, useShared } from '../../context';
import {
  forecastAll,
  SEED_SUPPLIERS,
  seedMoves,
  seedOrders,
  seedProductInfo,
  seedReviews,
  stockAt,
  webshopToday,
  type Forecast,
  type Move,
  type ProductInfo,
  type Review,
  type RunOut,
  type StockOrder,
  type StockRequest,
  type Supplier,
} from '../../data/stock';
import { type StockLevels } from '../../data/shared';
import { Chip, isolate, type Tone } from '../../kit';

/**
 * Everything the stock screen keeps, as shared module state: the levels (also changed by Facturen), product details,
 * suppliers, orders and the movements booked in the demo. Every part of the screen reads it through this hook.
 */
export function useStock() {
  const { today, now } = usePraktijk();
  const [stock, setStock] = useShared<StockLevels>('stock', () => stockAt(now));
  const [info, setInfo] = useShared<Record<ProductId, ProductInfo>>('stockInfo', seedProductInfo);
  const [suppliers, setSuppliers] = useShared<Supplier[]>('stockSuppliers', () => SEED_SUPPLIERS);
  const [orders, setOrders] = useShared<StockOrder[]>('stockOrders', () => seedOrders(today));
  // Today's webshop orders so far are already in the log, like the overview's webshop shelf counts them.
  const [booked, setBooked] = useShared<Move[]>('stockMoves', () => webshopToday(now));
  const [seeded] = useShared<Move[]>('stockMovesSeed', () => seedMoves(today));
  const [requests, setRequests] = useShared<StockRequest[]>('stockRequests', () => []);
  const [reviews] = useShared<Review[]>('stockReviews', () => seedReviews(today));
  const moves = useMemo(() => [...booked, ...seeded], [booked, seeded]);
  const forecast = useMemo(() => forecastAll({ moves, today, stock, info, suppliers, orders }), [moves, today, stock, info, suppliers, orders]);

  /** Puts a product on the request list for a clinic; without a clinic, the one where it runs out first. Returns that clinic. */
  const request = useCallback(
    (product: ProductId, locationId?: LocationId): LocationId => {
      const where = locationId ?? forecast.find((f) => f.product === product)?.locationId ?? 'nijmegen';
      setRequests((list) => (list.some((x) => x.product === product && x.locationId === where) ? list : [...list, { product, locationId: where, at: new Date(now) }]));
      return where;
    },
    [forecast, now, setRequests],
  );

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
  return {
    stock,
    setStock,
    info,
    setInfo,
    suppliers,
    setSuppliers,
    orders,
    setOrders,
    booked,
    seeded,
    moves,
    book,
    products,
    requests,
    setRequests,
    request,
    reviews,
    forecast,
  };
}

/** What every part of the screen can ask of the screen itself: open a product's side panel, or put it on the request list. */
export type StockUi = { openProduct: (id: ProductId) => void; ask: (product: ProductId, locationId?: LocationId) => void };

export const StockUiContext = createContext<StockUi>({ openProduct: () => undefined, ask: () => undefined });

export const useStockUi = () => useContext(StockUiContext);

const RUN_TONE: Record<RunOut, Tone> = { out: 'bad', week: 'warn', month: 'neutral', later: 'good', none: 'outline' };

/** "Op binnen een week", "Op binnen een maand"…, for a forecast. */
export function RunOutChip({ bucket }: { bucket: RunOut }) {
  const { t } = useI18n();
  return <Chip tone={RUN_TONE[bucket]}>{t(`pk.voorraad.run.${bucket}`)}</Chip>;
}

/** "about 9 days" or "–" when nothing went out lately. */
export function useDaysLeft() {
  const { t } = useI18n();
  return useCallback((f: Forecast) => (f.daysLeft === null ? '–' : f.daysLeft < 1 ? t('pk.voorraad.run.today') : t('pk.voorraad.run.days', { n: Math.floor(f.daysLeft) })), [t]);
}

/** Five stars as text, the given number filled. */
export function Stars({ rating, label }: { rating: number; label?: string }) {
  const full = Math.round(rating);
  return (
    <span className="pk-st-stars" role="img" aria-label={label ?? String(rating)}>
      <span aria-hidden="true">{'★'.repeat(full)}</span>
      <span aria-hidden="true" className="pk-st-stars-off">
        {'★'.repeat(5 - full)}
      </span>
    </span>
  );
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
