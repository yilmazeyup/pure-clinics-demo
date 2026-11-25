import { addDays, startOfDay, type LocationId } from '@pure-clinics/shared';

import { clinicOfOrder, ordersUntil, shopDay, type Order } from '../../data/shop';

// The webshop on Pure's own site and in the app, as orders: which of the two it came through, which clinic sends it and
// how far it is. The orders themselves are the overview's (data/shop.ts), so both show the same ones. A status follows
// the clock: packed within the hour, picked up by the parcel service at 17:00 on a working day, delivered the next
// working day around noon. Sunday has no pickup and no delivery.

export type Channel = 'site' | 'app';
export type OrderStatus = 'new' | 'packed' | 'shipped' | 'delivered';
export const STATUSES: OrderStatus[] = ['new', 'packed', 'shipped', 'delivered'];

export type WebOrder = Order & {
  channel: Channel;
  /** The clinic nearest to the customer, which sends it. */
  clinic: LocationId;
  status: OrderStatus;
  packed: Date | null;
  shipped: Date | null;
  delivered: Date | null;
  track: string;
};

const PICKUP_HOUR = 17;

/** A small stable number from a text, so an order gets its channel without changing the seeded orders. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000;
}

/** A little more than half of the orders come through the app. */
export const channelOf = (order: Order): Channel => (hash(`channel-${order.number}`) < 580 ? 'app' : 'site');

const working = (day: Date) => day.getDay() !== 0;

/** The first pickup at 17:00 on a working day, at least an hour after the order (time to pack it). */
export function pickupFor(at: Date): Date {
  const ready = at.getTime() + 3600000;
  let day = startOfDay(new Date(ready));
  for (let i = 0; i < 8; i++) {
    const pickup = new Date(day);
    pickup.setHours(PICKUP_HOUR, 0, 0, 0);
    if (working(day) && pickup.getTime() >= ready) return pickup;
    day = addDays(day, 1);
  }
  return day;
}

/** Delivered the next working day, around noon. */
function deliveryAfter(pickup: Date): Date {
  let day = addDays(startOfDay(pickup), 1);
  while (!working(day)) day = addDays(day, 1);
  const at = new Date(day);
  at.setHours(12, 30, 0, 0);
  return at;
}

/** Where an order is at `now`, by the clock alone. */
export function statusOf(order: Order, now: Date): Pick<WebOrder, 'status' | 'packed' | 'shipped' | 'delivered'> {
  const pickup = pickupFor(order.at);
  const delivery = deliveryAfter(pickup);
  const packed = new Date(order.at.getTime() + 40 * 60000);
  const t = now.getTime();
  if (t >= delivery.getTime()) return { status: 'delivered', packed, shipped: pickup, delivered: delivery };
  if (t >= pickup.getTime()) return { status: 'shipped', packed, shipped: pickup, delivered: null };
  if (t >= packed.getTime()) return { status: 'packed', packed, shipped: null, delivered: null };
  return { status: 'new', packed: null, shipped: null, delivered: null };
}

/** The webshop's orders of the last `days` days, the newest first; today's only up to `now`. */
export function webOrders(now: Date, days: number): WebOrder[] {
  const out: WebOrder[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(startOfDay(now), -i);
    const orders = i === 0 ? ordersUntil(shopDay(day), now) : shopDay(day);
    for (const order of orders)
      out.push({
        ...order,
        channel: channelOf(order),
        clinic: clinicOfOrder(order),
        ...statusOf(order, now),
        track: `3SPURE${String(order.number).padStart(7, '0')}`,
      });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The later of two statuses: a status set by hand never goes back when the clock has not caught up yet. */
export const laterStatus = (a: OrderStatus, b: OrderStatus | undefined) => (b && STATUSES.indexOf(b) > STATUSES.indexOf(a) ? b : a);
