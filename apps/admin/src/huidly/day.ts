import { productById, startOfDay, LOCATIONS, type Product } from '@pure-clinics/shared';
import { useEffect, useSyncExternalStore } from 'react';

import type { DayChanges } from '../data/live';
import type { Order } from '../data/shop';
import { agendaFromData, type AgendaData } from '../praktijk/data/agendaSync';
import type { LiveOrder, LiveStock } from '../praktijk/live/api';
import { teamCall, useHuidlyTeam } from './client';

// The day as Huidly has it, for the overview: the agenda as the team changed it in Kliniek (huidly.com/app), the real
// webshop orders of the site and the app, the stock and the clients who joined the app. Loaded through the team's Huidly
// connection (./client.ts) and again every minute while a screen shows it; every screen of this admin reads this one
// copy, and Kliniek reads the same agenda with the same code (praktijk/data/agendaSync.ts), so nothing shows a day of
// its own.

export type HuidlyDay = {
  status: 'off' | 'loading' | 'ready' | 'error';
  changes: DayChanges | null;
  stock: LiveStock[];
};

let snapshot: HuidlyDay = { status: 'off', changes: null, stock: [] };
let lastText = '';
let loading: Promise<void> | null = null;
let forToken: string | null = null;
const listeners = new Set<() => void>();
const set = (next: HuidlyDay) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

/** A webshop order of Pure's site or app as the overview counts it; gift cards have no product, only their price. */
function asOrder(o: LiveOrder): Order {
  const lines = o.items.flatMap((i) => {
    const product = productById(i.product) as Product | undefined;
    return product ? [{ product, qty: i.qty }] : [];
  });
  const city = o.delivery.method === 'post' ? o.delivery.address.city : (LOCATIONS.find((l) => l.id === (o.delivery as { location: string }).location)?.city ?? '');
  return {
    id: o.id,
    number: Number(String(o.number).replace(/\D/g, '')) || 0,
    at: new Date(o.createdAt),
    customer: o.client.name.trim().split(/\s+/)[0] ?? '',
    city,
    lines,
    total: o.total,
    afterTreatment: null,
  };
}

async function load(token: string) {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [agenda, orders, stock, joined] = await Promise.all([
        teamCall<AgendaData>('/agenda'),
        teamCall<{ orders: LiveOrder[] }>('/orders'),
        teamCall<{ stock: LiveStock[] }>('/stock'),
        teamCall<{ joined: { name: string; at: string }[] }>('/joined'),
      ]);
      if (forToken !== token) return;
      const text = JSON.stringify([agenda, orders, stock, joined]);
      // Nothing new: the screens keep the very same day, so nothing is worked out again.
      if (text === lastText && snapshot.status === 'ready') return;
      lastText = text;
      const changes: DayChanges = {
        agenda: agendaFromData(agenda, startOfDay(new Date())),
        orders: orders.orders.filter((o) => o.status !== 'cancelled').map(asOrder),
        joined: joined.joined.map((j) => ({ name: j.name, at: new Date(j.at) })),
      };
      set({ status: 'ready', changes, stock: stock.stock });
    } catch {
      // Keep showing the last day Huidly gave; without one, say Huidly cannot be reached.
      if (forToken === token && snapshot.status !== 'ready') set({ status: 'error', changes: null, stock: [] });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** The day as Huidly has it, loaded once for every screen and refreshed every minute while one is open. */
export function useHuidlyDay(): HuidlyDay & { retry: () => void } {
  const team = useHuidlyTeam();
  const token = team ? team.email : null;
  const day = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
  useEffect(() => {
    if (!token) {
      forToken = null;
      lastText = '';
      if (snapshot.status !== 'off') set({ status: 'off', changes: null, stock: [] });
      return;
    }
    if (forToken !== token) {
      forToken = token;
      lastText = '';
      set({ status: 'loading', changes: null, stock: [] });
    }
    void load(token);
    const timer = window.setInterval(() => void load(token), 60000);
    return () => window.clearInterval(timer);
  }, [token]);
  return { ...day, retry: () => token && void load(token) };
}
