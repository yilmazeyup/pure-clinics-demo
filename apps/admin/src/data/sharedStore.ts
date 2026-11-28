import { useSyncExternalStore } from 'react';

// The business's own data, kept at Huidly (Huidly's api/src/functions/store.js), one piece per key: stock, invoices,
// client edits, settings, reminders, campaigns. Huidly's Kliniek and the business's own admin (Pure's /beheer) both read
// and write the pieces through this file, so what one changes the other shows, and nothing is lost on reload.
// A piece is only sent once someone changes it; until then every screen works it out from the built-in data, the same
// way on both sides. Without a connection (the demo accounts on this computer) the pieces stay in this browser.
// Keep this file the same in both places: huidly app/src/data/sharedStore.ts and pure-ivy apps/admin/src/data/sharedStore.ts.

export type Stored = { key: string; version: string; value: unknown };
/** How this program reaches Huidly: with the Huidly cookie (Kliniek) or a team token (the business's own admin). */
export type Transport = {
  list: () => Promise<{ key: string; version: string }[]>;
  values: (keys?: string[]) => Promise<Stored[]>;
  /** Saves a piece based on a version; when someone saved in between, what is there now. */
  put: (key: string, value: unknown, version: string | null) => Promise<{ version: string } | { conflict: { version: string | null; value: unknown } }>;
};
export type SharedStatus = 'local' | 'loading' | 'ready' | 'error';

/** Pieces that stay in this browser: the agenda has its own rows at Huidly, the rest are one person's own choices or caches. */
const LOCAL = new Set(['agenda', 'team.chosen', 'stockMovesSeed']);

/* ---------- Dates, maps and sets survive the trip ---------- */

function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (raw instanceof Date) return { $date: raw.getTime() };
  if (raw instanceof Map) return { $map: [...raw.entries()] };
  if (raw instanceof Set) return { $set: [...raw] };
  return value;
}
function reviver(_key: string, value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1) {
      if (keys[0] === '$date' && typeof o.$date === 'number') return new Date(o.$date);
      if (keys[0] === '$map' && Array.isArray(o.$map)) return new Map(o.$map as [unknown, unknown][]);
      if (keys[0] === '$set' && Array.isArray(o.$set)) return new Set(o.$set);
    }
  }
  return value;
}
export const encode = (value: unknown): unknown => JSON.parse(JSON.stringify(value, replacer) ?? 'null');
export const decode = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value), reviver) as T;

/* ---------- The store ---------- */

let owner = '';
let transport: Transport | null = null;
let status: SharedStatus = 'local';
const values = new Map<string, unknown>();
const versions = new Map<string, string | null>();
/** Pieces changed here and not saved yet, with their timers. */
const waiting = new Map<string, number>();
let saving = 0;
let onConflict: ((key: string) => void) | null = null;
const listeners = new Set<() => void>();
let poll: number | null = null;

const notify = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function take(items: Stored[]) {
  for (const item of items) {
    if (waiting.has(item.key) || LOCAL.has(item.key)) continue;
    values.set(item.key, decode(item.value));
    versions.set(item.key, item.version);
  }
}

async function loadAll(id: string) {
  try {
    const items = await transport!.values();
    if (owner !== id) return;
    take(items);
    status = 'ready';
  } catch {
    if (owner !== id) return;
    status = 'error';
  }
  notify();
}

/** Looks for pieces someone else saved since, and takes them in. */
async function refresh(id: string) {
  if (!transport || status !== 'ready' || saving || waiting.size) return;
  try {
    const now = await transport.list();
    if (owner !== id || saving || waiting.size) return;
    const changed = now.filter((i) => !LOCAL.has(i.key) && versions.get(i.key) !== i.version).map((i) => i.key);
    const there = new Set(now.map((i) => i.key));
    // A piece set back to the built-in data elsewhere.
    let gone = false;
    for (const key of [...versions.keys()]) {
      if (!there.has(key) && versions.get(key)) {
        values.delete(key);
        versions.delete(key);
        gone = true;
      }
    }
    if (changed.length) take(await transport.values(changed));
    if (owner === id && (changed.length || gone)) notify();
  } catch {
    // Next time.
  }
}

/**
 * Connects the store to Huidly for one business and person (`id`); null keeps it in this browser. A new id starts
 * empty, so nothing of one business or person shows for another.
 */
export function connectShared(id: string, next: Transport | null, conflict?: (key: string) => void) {
  onConflict = conflict ?? null;
  if (id === owner) return;
  owner = id;
  transport = next;
  values.clear();
  versions.clear();
  waiting.forEach((timer) => window.clearTimeout(timer));
  waiting.clear();
  if (poll !== null) window.clearInterval(poll);
  poll = null;
  status = next ? 'loading' : 'local';
  notify();
  if (next) {
    void loadAll(id);
    poll = window.setInterval(() => void refresh(id), 30000);
  }
}

export const retryShared = () => {
  if (!transport || status !== 'error') return;
  status = 'loading';
  notify();
  void loadAll(owner);
};

async function save(key: string) {
  waiting.delete(key);
  if (!transport) return;
  const id = owner;
  saving++;
  try {
    const res = await transport.put(key, encode(values.get(key)), versions.get(key) ?? null);
    if (owner !== id) return;
    if ('version' in res) versions.set(key, res.version);
    else {
      // Someone saved this piece in between: theirs stands, and this change has to be made again.
      if (res.conflict.value === null || res.conflict.version === null) values.delete(key);
      else values.set(key, decode(res.conflict.value));
      versions.set(key, res.conflict.version);
      notify();
      onConflict?.(key);
    }
  } catch {
    if (owner !== id) return;
    // Not saved: show what Huidly has again, so this screen does not hold on to a change nobody else will see.
    try {
      const [now] = await transport.values([key]);
      if (owner !== id) return;
      if (now) {
        values.set(key, decode(now.value));
        versions.set(key, now.version);
      } else if (versions.get(key)) {
        values.delete(key);
        versions.delete(key);
      } else values.delete(key);
      notify();
    } catch {
      // Huidly cannot be reached at all; the next look (refresh) puts it right.
    }
    onConflict?.(key);
  } finally {
    saving--;
  }
}

export const sharedHas = (key: string) => values.has(key);
export const sharedGet = <T,>(key: string): T | undefined => values.get(key) as T | undefined;

/** Sets a piece here at once and sends it to Huidly a moment later (a burst of changes goes as one). */
export function sharedSet(key: string, value: unknown) {
  values.set(key, value);
  notify();
  if (!transport || LOCAL.has(key)) return;
  const timer = waiting.get(key);
  if (timer !== undefined) window.clearTimeout(timer);
  waiting.set(key, window.setTimeout(() => void save(key), 600));
}

/** One piece as stored, or undefined while it is the built-in data. */
export const useSharedValue = <T,>(key: string): T | undefined => useSyncExternalStore(subscribe, () => values.get(key) as T | undefined);
export const useSharedStatus = (): SharedStatus => useSyncExternalStore(subscribe, () => status);

/** A transport over fetch, for a base address like "/api/programma/pure/store". */
export function fetchTransport(base: string, init: () => RequestInit): Transport {
  const call = async <T,>(path: string, more: RequestInit = {}): Promise<T> => {
    const first = init();
    const res = await fetch(base + path, { cache: 'no-store', ...first, ...more, headers: { ...(first.headers ?? {}), ...(more.headers ?? {}) } });
    if (res.status === 409) return (await res.json()) as T;
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  };
  return {
    list: () => call<{ items: { key: string; version: string }[] }>('').then((r) => r.items),
    values: (keys) => call<{ items: Stored[] }>(`?values=1${keys ? `&keys=${keys.map(encodeURIComponent).join(',')}` : ''}`).then((r) => r.items),
    put: async (key, value, version) => {
      const r = await call<{ version?: string; error?: string; value?: unknown }>(`/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, version }),
      });
      if (r.error === 'changed') return { conflict: { version: (r.version as string | null) ?? null, value: r.value ?? null } };
      return { version: r.version! };
    },
  };
}
