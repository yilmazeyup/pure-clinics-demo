import type { L10n, LocationId } from '@pure-clinics/shared';

import { KEYS, storage } from './storage';

// The app talks to Huidly, the program Pure's team works in: client accounts (sign-in with a code by e-mail),
// appointment requests that land in the clinic's agenda, and webshop and gift card orders. The contract is
// docs/customer-api.md in the huidly repository; Pure's website uses the same calls (site/website/js/site/api.js).

export const API_BASE = 'https://huidly.com/api/klant/pure';

/** Pure's main number, for every "this doesn't work right now" moment. */
export const CLINIC_PHONE = '024 679 22 36';

export type Me = { id: string; email: string; name: string; phone: string; birthDate: string | null; locale: string };

export type DayPart = 'morning' | 'afternoon' | 'evening';

export type Catalog = {
  business: { slug: string; name: string; phone: string; email: string };
  locations: { id: LocationId; city: string; address: string; phone: string; hours: Record<string, { open: string; close: string } | null> }[];
  treatments: { id: string; category: string; minutes: number; priceFrom: number; insurable: boolean; locations: LocationId[] }[];
  dayParts: { id: DayPart; from: string; to: string }[];
  delivery: { fee: number; days: number; countries: string[] };
};

export type ShopProduct = { id: string; price: number; stock: number; available: boolean; afterTreatments?: string[] };
export type GiftCard = { id: string; price: number; value: number; name?: Partial<L10n> };

export type AppointmentStatus = 'requested' | 'confirmed' | 'cancelled';
export type RemoteAppointment = {
  id: string;
  status: AppointmentStatus;
  treatment: string;
  treatmentName?: Partial<L10n>;
  location: LocationId;
  specialist?: string | null;
  date: string;
  part: DayPart;
  note?: string;
  start?: string | null;
  minutes?: number | null;
  message?: string | null;
  cancelledBy?: string | null;
  createdAt?: string;
};

export type OrderStatus = 'new' | 'ready' | 'shipped' | 'done' | 'cancelled';
export type Address = { name: string; street: string; postcode: string; city: string; country: string };
export type RemoteOrder = {
  id: string;
  number?: string;
  status: OrderStatus;
  items?: { product: string; name?: Partial<L10n>; qty: number; price: number; total: number }[];
  giftCards?: { id: string; qty: number; price: number; value: number; to?: string; message?: string }[];
  delivery?: { method: 'pickup'; location: LocationId } | { method: 'post'; address?: Address };
  subtotal?: number;
  shipping?: number;
  total?: number;
  payment?: { method: 'in-clinic' | 'payment-request'; status: 'open' | 'paid' };
  track?: string | null;
  createdAt?: string;
};

export type OrderRequest = {
  items: { product: string; qty: number }[];
  giftCards: { id: string; qty: number; to?: string; message?: string }[];
  delivery: { method: 'pickup'; location: LocationId } | { method: 'post'; address: Address };
  channel: 'app';
  note?: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  body: { error?: string; products?: string[] } | null;
  constructor(status: number, body: { error?: string } | null) {
    const code = body?.error || (status === 0 ? 'offline' : status === 404 ? 'offline' : `http-${status}`);
    super(code);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export const token = {
  get: () => storage.get(KEYS.token),
  set: (value: string | null) => storage.set(KEYS.token, value),
};

const signedOutHooks = new Set<() => void>();
/** Runs fn when Huidly says the token is no longer valid, so the app forgets who was signed in. */
export function onSignedOut(fn: () => void) {
  signedOutHooks.add(fn);
  return () => {
    signedOutHooks.delete(fn);
  };
}

async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, payload?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, { error: 'offline' });
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* an empty answer */
  }
  if (!res.ok) {
    const err = new ApiError(res.status, (body as { error?: string } | null) ?? null);
    // A missing business or a missing API (not deployed yet) reads as "not reachable right now".
    if (res.status === 404 && err.code === 'business-unknown') err.code = 'offline';
    if (res.status >= 500 && err.code.startsWith('http-')) err.code = 'offline';
    if (res.status === 401 && t) {
      token.set(null);
      signedOutHooks.forEach((fn) => fn());
    }
    throw err;
  }
  return body as T;
}

const query = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');

export const api = {
  // Signing up and in: one flow for both.
  requestCode: (email: string, locale: string) => call<{ ok: true }>('POST', 'auth/code', { email, locale }),
  signIn: (email: string, code: string) => call<{ token: string; expiresAt: string; isNew: boolean; me: Me }>('POST', 'auth/token', { email, code }),
  logout: () => call<{ ok: true }>('POST', 'auth/logout', {}).catch(() => null),
  me: () => call<{ me: Me }>('GET', 'me'),
  updateMe: (fields: Partial<Pick<Me, 'name' | 'phone' | 'birthDate' | 'locale'>>) => call<{ me: Me }>('PATCH', 'me', fields),
  deleteMe: () => call<{ ok: true }>('DELETE', 'me'),
  // What Pure offers.
  catalog: () => call<Catalog>('GET', 'catalog'),
  availability: (p: { treatment: string; location: string; from: string; to: string }) =>
    call<{ days: { date: string; parts: DayPart[] }[] }>('GET', `availability?${query(p)}`),
  products: () => call<{ products: ShopProduct[] }>('GET', 'products'),
  giftCards: () => call<{ giftCards: GiftCard[] }>('GET', 'gift-cards'),
  // Appointments: requests the clinic confirms with an exact time.
  appointments: () => call<{ appointments: RemoteAppointment[] }>('GET', 'appointments'),
  requestAppointment: (a: { treatment: string; location: string; date: string; part: DayPart; note?: string }) =>
    call<{ appointment: RemoteAppointment }>('POST', 'appointments', a),
  cancelAppointment: (id: string) => call<{ appointment: RemoteAppointment }>('POST', `appointments/${encodeURIComponent(id)}/cancel`, {}),
  // Orders: picked up and paid in the clinic, or sent after a payment request.
  orders: () => call<{ orders: RemoteOrder[] }>('GET', 'orders'),
  placeOrder: (o: OrderRequest) => call<{ order: RemoteOrder }>('POST', 'orders', o),
  cancelOrder: (id: string) => call<{ order: RemoteOrder }>('POST', `orders/${encodeURIComponent(id)}/cancel`, {}),
};

/** The parts of the day as the texts name them. */
export const PART_KEY = { morning: 'part_ochtend', afternoon: 'part_middag', evening: 'part_avond' } as const;
export const STATUS_KEY = { requested: 'status_aangevraagd', confirmed: 'status_bevestigd', cancelled: 'status_geannuleerd' } as const;
export const ORDER_STATUS_KEY = {
  new: 'ostatus_nieuw',
  ready: 'ostatus_klaar',
  shipped: 'ostatus_verzonden',
  done: 'ostatus_opgehaald',
  cancelled: 'ostatus_geannuleerd',
} as const;

/** The text for an error, as on the website: a calm sentence, with the phone number where it helps. */
export const ERROR_KEY: Record<string, 'errEmail' | 'errCode' | 'errCodeExpired' | 'errTooMany' | 'errName' | 'errPhone' | 'errDate' | 'errStock' | 'errTooLate' | 'errOffline'> = {
  'email-invalid': 'errEmail',
  'code-wrong': 'errCode',
  'code-expired': 'errCodeExpired',
  'too-many': 'errTooMany',
  'name-invalid': 'errName',
  'phone-invalid': 'errPhone',
  'date-invalid': 'errDate',
  'out-of-stock': 'errStock',
  'too-late': 'errTooLate',
  offline: 'errOffline',
};

/** YYYY-MM-DD in the device's own calendar. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
