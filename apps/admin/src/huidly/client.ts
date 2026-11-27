import { useSyncExternalStore } from 'react';

// Pure's own admin and Huidly. Huidly (huidly.com) is the clinic's program; what is Pure's own (the webshop's real
// orders and stock, and the social planning) is run from this admin, but its data lives in Huidly. Pure's team
// connects this admin to Huidly once per browser with an e-mail code, which gives a team token for 14 days. The routes
// are huidly.com/api/klant/pure/beheer/… (huidly repo, docs/customer-api.md); nothing else of the admin needs it.

/** huidly.com, or the local API while working on both (VITE_HUIDLY_API=http://localhost:7071). */
export const HUIDLY = ((import.meta.env.VITE_HUIDLY_API as string | undefined) ?? 'https://huidly.com').replace(/\/$/, '');
export const ZAAK = 'pure';
/** Huidly's program, where Pure's Kliniek is (agenda, dossiers, kassa…): this admin links there instead of holding it. */
export const HUIDLY_APP = ((import.meta.env.VITE_HUIDLY_APP as string | undefined) ?? 'https://huidly.com/app/').replace(/\/?$/, '/');
/** A screen of Kliniek in Huidly's program, e.g. kliniekUrl('agenda'). */
export const kliniekUrl = (screen?: string) => (screen && screen !== 'overzicht' ? `${HUIDLY_APP}#praktijk/${screen}` : HUIDLY_APP);
const BASE = `${HUIDLY}/api/klant/${ZAAK}`;
const KEY = 'pure-huidly-team';

export type Team = { name: string; email: string; role: 'admin' | 'staff' };
type Stored = { token: string; expiresAt: string; team: Team };

/** What Huidly answered when it said no: the status and its short code (signin-needed, not-team, code-wrong…). */
export class HuidlyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

// ── The connection, kept in this browser ─────────────────────────────────

const listeners = new Set<() => void>();
let current: Stored | null = read();

function read(): Stored | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Stored | null;
    return stored && Date.parse(stored.expiresAt) > Date.now() ? stored : null;
  } catch {
    return null;
  }
}

function keep(next: Stored | null) {
  current = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the connection lasts until the page is reloaded.
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Who of Pure's team is connected to Huidly in this browser, or null. */
export const useHuidlyTeam = () => useSyncExternalStore(subscribe, () => current?.team ?? null);

// ── Calls ─────────────────────────────────────────────────────────────────

async function send<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new HuidlyError(0, 'offline');
  }
  if (!res.ok) {
    const code = await res
      .json()
      .then((b: { error?: string }) => b.error ?? '')
      .catch(() => '');
    throw new HuidlyError(res.status, code || `http-${res.status}`);
  }
  return (await res.json()) as T;
}

/** A call for the team. When Huidly no longer knows the token, the connection is dropped and the screens ask again. */
export async function teamCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!current) throw new HuidlyError(401, 'signin-needed');
  try {
    return await send<T>(`/beheer${path}`, init, current.token);
  } catch (error) {
    if (error instanceof HuidlyError && error.status === 401) keep(null);
    throw error;
  }
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** A file link from Huidly (signed, so it works in an <img>) as a full address. */
export const fileUrl = (path: string) => (/^https?:/.test(path) ? path : `${HUIDLY}${path}`);

/** Step one: Huidly mails a six-digit code to the address. */
export const askCode = (email: string, locale: string) => send<{ ok: true; devCode?: string }>('/auth/code', jsonInit('POST', { email, locale }));

/** Step two: the code gives team access, if the address belongs to Pure's team on Huidly. */
export async function connect(email: string, code: string) {
  const got = await send<Stored>('/auth/token', jsonInit('POST', { email, code, team: true }));
  keep({ token: got.token, expiresAt: got.expiresAt, team: got.team });
  return got.team;
}

/** Ends the team token on Huidly too, then forgets it here. */
export async function disconnect() {
  const token = current?.token;
  keep(null);
  if (token) await send('/auth/logout', jsonInit('POST', {}), token).catch(() => undefined);
}
