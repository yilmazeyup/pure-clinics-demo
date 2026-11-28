import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, ApiError, isoDay, type Catalog, type GiftCard, type RemoteAppointment, type RemoteOrder, type ShopProduct } from '../api';
import type { PriceList } from '../cart';
import { useAccount } from './account';

type Remote<T> = { data: T | undefined; error: ApiError | null; loading: boolean; reload: () => void };

// What Pure offers changes rarely, so one answer serves every screen until the app restarts (or a screen reloads it).
const shared = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  return sharedLoad(key, load, fresh);
}

/** One answer per key for every screen, and for the start-up load from Huidly (state/huidlyData.ts). */
export function sharedLoad<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
  if (fresh || !shared.has(key)) {
    const p = load();
    shared.set(key, p);
    p.catch(() => shared.delete(key));
  }
  return shared.get(key) as Promise<T>;
}

function useLoad<T>(key: string | null, load: () => Promise<T>, cache: boolean): Remote<T> {
  const [state, setState] = useState<{ data?: T; error: ApiError | null; loading: boolean }>({ error: null, loading: key !== null });
  const [round, setRound] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (key === null) {
      setState({ error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    const p = cache ? once(key, () => loader.current(), round > 0) : loader.current();
    p.then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e: unknown) => live && setState({ error: e instanceof ApiError ? e : new ApiError(0, { error: 'offline' }), loading: false }),
    );
    return () => {
      live = false;
    };
  }, [key, cache, round]);
  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export const useCatalog = () => useLoad<Catalog>('catalog', api.catalog, true);

/** Stock and prices from Huidly's shop; `available` is false when a product is sold out or taken off the shop. */
export function useStock() {
  const remote = useLoad<{ products: ShopProduct[] }>('products', api.products, true);
  return useMemo(() => {
    const byId = new Map((remote.data?.products ?? []).map((p) => [p.id, p]));
    const prices: PriceList = Object.fromEntries([...byId.values()].map((p) => [p.id, p.price]));
    return {
      ...remote,
      byId,
      prices,
      /** Sold out only when Huidly says so; without an answer, products stay orderable and checkout will tell. */
      soldOut: (id: string) => byId.get(id)?.available === false,
    };
  }, [remote]);
}

export const useGiftCards = () => useLoad<{ giftCards: GiftCard[] }>('gift-cards', api.giftCards, true);

/** The signed-in client's appointment requests, newest first. */
export function useMyAppointments() {
  const { me } = useAccount();
  return useLoad<RemoteAppointment[]>(me ? `appointments:${me.id}` : null, () => api.appointments().then((r) => r?.appointments ?? []), false);
}

export function useMyOrders() {
  const { me } = useAccount();
  return useLoad<RemoteOrder[]>(me ? `orders:${me.id}` : null, () => api.orders().then((r) => r?.orders ?? []), false);
}

/** Days and parts of the day that can be asked for, from tomorrow on, for four weeks. */
export function useAvailability(treatment: string, location: string, days = 28) {
  const from = new Date();
  from.setDate(from.getDate() + 1);
  const to = new Date(from);
  to.setDate(from.getDate() + days - 1);
  const range = { treatment, location, from: isoDay(from), to: isoDay(to) };
  return useLoad(`availability:${treatment}:${location}:${range.from}`, () => api.availability(range).then((r) => r?.days ?? []), true);
}
