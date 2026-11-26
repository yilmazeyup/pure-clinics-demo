import { DEFAULT_LOCALE, LOCALES, type Locale } from '@pure-clinics/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { sameLine, type CartLine } from '../cart';
import { KEYS, onStorage, storage } from '../storage';

type AppContext = {
  /** When the app opened, for the greeting and the light on the home photo. */
  now: Date;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  cart: CartLine[];
  addToCart: (line: CartLine) => void;
  setLineQty: (index: number, qty: number) => void;
  clearCart: () => void;
};

const Context = createContext<AppContext | null>(null);

const readLocale = (): Locale => {
  const saved = storage.get(KEYS.lang);
  return saved && (LOCALES as readonly string[]).includes(saved) ? (saved as Locale) : DEFAULT_LOCALE;
};
const readCart = (): CartLine[] => {
  const lines = storage.getJson<CartLine[]>(KEYS.cart);
  return Array.isArray(lines) ? lines.filter((l) => l && (l.kind === 'product' || l.kind === 'giftcard') && l.qty > 0) : [];
};

/** The language and the cart. Both are kept like the website keeps them, so they follow a client from site to app. */
export function AppProvider({ children }: PropsWithChildren) {
  const [now] = useState(() => new Date());
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const [cart, setCart] = useState<CartLine[]>(readCart);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storage.set(KEYS.lang, next);
  }, []);

  const save = useCallback((update: (lines: CartLine[]) => CartLine[]) => {
    setCart((lines) => {
      const next = update(lines);
      storage.setJson(KEYS.cart, next);
      return next;
    });
  }, []);

  const addToCart = useCallback(
    (line: CartLine) =>
      save((lines) => {
        const at = lines.findIndex((l) => sameLine(l, line));
        if (at === -1) return [...lines, line];
        return lines.map((l, i) => (i === at ? { ...l, qty: Math.min(10, l.qty + line.qty) } : l));
      }),
    [save],
  );
  const setLineQty = useCallback(
    (index: number, qty: number) => save((lines) => (qty <= 0 ? lines.filter((_, i) => i !== index) : lines.map((l, i) => (i === index ? { ...l, qty } : l)))),
    [save],
  );
  const clearCart = useCallback(() => save(() => []), [save]);

  // The website open in another tab changes the same cart and language.
  useEffect(
    () =>
      onStorage((key) => {
        if (key === KEYS.cart) setCart(readCart());
        if (key === KEYS.lang) setLocaleState(readLocale());
      }),
    [],
  );

  const value = useMemo<AppContext>(
    () => ({ now, locale, setLocale, cart, addToCart, setLineQty, clearCart }),
    [now, locale, setLocale, cart, addToCart, setLineQty, clearCart],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp(): AppContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
