// Pure's website talks to Huidly, the program Pure's team works in: client accounts (sign-in with a code by e-mail),
// appointment requests that land in the clinic's agenda, and webshop and gift card orders. The contract is
// docs/customer-api.md in the huidly repository; every address lives here.

export const API = {
  base: 'https://huidly.com/api/klant/pure',
};

const TOKEN_KEY = 'pure-web-token';
export const token = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode */
    }
  },
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `http-${status}`);
    this.status = status;
    this.code = body?.error || `http-${status}`;
    this.body = body;
  }
}

async function call(method, path, payload) {
  const headers = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  const t = token.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res;
  try {
    res = await fetch(`${API.base}/${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      mode: 'cors',
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, { error: 'offline' });
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty answer */
  }
  if (!res.ok) {
    if (res.status === 401) token.set(null);
    throw new ApiError(res.status, body);
  }
  return body;
}

const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

export const api = {
  // Signing up and in
  requestCode: (email, locale) => call('POST', 'auth/code', { email, locale }),
  signIn: (email, code, name) => call('POST', 'auth/token', { email, code, ...(name ? { name } : {}) }),
  logout: () => call('POST', 'auth/logout', {}).catch(() => null),
  me: () => call('GET', 'me'),
  updateMe: (fields) => call('PATCH', 'me', fields),
  deleteMe: () => call('DELETE', 'me'),
  // What Pure offers
  catalog: () => call('GET', 'catalog'),
  availability: (p) => call('GET', `availability?${q(p)}`),
  products: () => call('GET', 'products'),
  giftCards: () => call('GET', 'gift-cards'),
  // Appointments (requests the clinic confirms)
  appointments: () => call('GET', 'appointments'),
  requestAppointment: (a) => call('POST', 'appointments', a),
  cancelAppointment: (id) => call('POST', `appointments/${encodeURIComponent(id)}/cancel`, {}),
  // Orders
  orders: () => call('GET', 'orders'),
  placeOrder: (o) => call('POST', 'orders', o),
  cancelOrder: (id) => call('POST', `orders/${encodeURIComponent(id)}/cancel`, {}),
};

/** The parts of the day as Huidly names them, and as the site's texts name them. */
export const PART_KEY = { morning: 'ochtend', afternoon: 'middag', evening: 'avond' };
export const STATUS_KEY = { requested: 'aangevraagd', confirmed: 'bevestigd', cancelled: 'geannuleerd' };
export const ORDER_STATUS_KEY = { new: 'nieuw', ready: 'klaar', shipped: 'verzonden', done: 'opgehaald', cancelled: 'geannuleerd' };
