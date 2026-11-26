import { Platform } from 'react-native';

// Small values kept between visits. On the web they live in localStorage, under the same keys as Pure's website: the
// app is served from the same address, so a client signed in on the site is signed in here too, and the language and
// the cart follow along. On a phone nothing extra is installed, so they are kept in memory for as long as the app runs.

const memory = new Map<string, string>();
const web = Platform.OS === 'web' && typeof localStorage !== 'undefined';

export const KEYS = {
  token: 'pure-web-token',
  me: 'pure-web-me',
  lang: 'pure-web-lang',
  cart: 'pure-web-cart',
} as const;

export const storage = {
  get(key: string): string | null {
    if (!web) return memory.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string | null) {
    if (value === null) memory.delete(key);
    else memory.set(key, value);
    if (!web) return;
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode: memory only */
    }
  },
  getJson<T>(key: string): T | null {
    const raw = this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown) {
    this.set(key, value == null ? null : JSON.stringify(value));
  },
};

/** Calls fn when another tab of the site or app changes one of these keys (web only). */
export function onStorage(fn: (key: string) => void): () => void {
  if (!web || typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key) fn(e.key);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
