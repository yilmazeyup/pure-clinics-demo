import type { L10n } from '@pure-clinics/shared';
import { useCallback, useEffect, useState } from 'react';

import { jsonInit, teamCall, useHuidlyTeam } from '../../huidly/client';

// The real webshop of Pure's own site and app: its orders (marked site or app) and the stock the shop sells from. They
// come in at Huidly (the customer API) and are run from here, through the team's Huidly connection
// (../../huidly/client.ts). Huidly's own program does not show them: it is the clinic's program only.

export type Person = { name: string; email: string; phone: string };

export type OrderStatus = 'new' | 'ready' | 'shipped' | 'done' | 'cancelled';
export type LiveOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  channel: 'site' | 'app';
  items: { product: string; name: L10n | null; qty: number; price: number; total: number }[];
  giftCards: { id: string; name: L10n; qty: number; price: number; value: number; to: string; message: string }[];
  delivery: { method: 'pickup'; location: string } | { method: 'post'; address: { name: string; street: string; postcode: string; city: string; country: string } };
  subtotal: number;
  shipping: number;
  total: number;
  payment: { method: 'in-clinic' | 'payment-request'; status: 'open' | 'paid' };
  track: string | null;
  note: string;
  createdAt: string;
  client: Person;
};

/** A product of the webshop with the one stock: both clinics together and each apart (counted in Voorraad & inkoop). */
export type LiveStock = { product: string; brand: string | null; name: L10n; price: number; stock: number; byLocation?: Record<string, number>; hidden: boolean };

export const live = {
  orders: () => teamCall<{ orders: LiveOrder[] }>('/orders').then((r) => r.orders),
  updateOrder: (id: string, body: { status?: OrderStatus; paid?: boolean; track?: string; message?: string }) =>
    teamCall<{ order: LiveOrder }>(`/orders/${encodeURIComponent(id)}`, jsonInit('POST', body)).then((r) => r.order),
  stock: () => teamCall<{ stock: LiveStock[] }>('/stock').then((r) => r.stock),
  setStock: (body: { product: string; hidden?: boolean }) => teamCall<{ stock: LiveStock[] }>('/stock', jsonInit('POST', body)).then((r) => r.stock),
};

/**
 * Loads one of the lists above, every minute while the screen is open. `off` without the team's Huidly connection in
 * this browser (the screen then asks for it) or when Huidly cannot be reached.
 */
export function useLive<T>(load: () => Promise<T>) {
  const team = useHuidlyTeam();
  const [state, setState] = useState<{ status: 'loading' | 'off' | 'ready'; data: T | null }>({ status: 'loading', data: null });
  const reload = useCallback(() => {
    if (!team) return setState({ status: 'off', data: null });
    load()
      .then((data) => setState({ status: 'ready', data }))
      .catch(() => setState((s) => (s.status === 'ready' ? s : { status: 'off', data: null })));
  }, [team]);
  useEffect(() => {
    reload();
    const timer = window.setInterval(reload, 60000);
    return () => window.clearInterval(timer);
  }, [reload]);
  return { ...state, reload, set: (data: T) => setState({ status: 'ready', data }) };
}

/** "vr 4 dec · 14:30" in the clinic's own time zone, whatever the computer's zone. */
export function clinicWhen(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(iso));
}
