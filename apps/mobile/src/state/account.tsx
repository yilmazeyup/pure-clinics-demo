import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { api, onSignedOut, token, type Me } from '../api';
import { KEYS, onStorage, storage } from '../storage';

type AccountContext = {
  /** The signed-in client, or null. */
  me: Me | null;
  /** After the right code: keep the token and who it is. */
  signedIn: (token: string, me: Me) => void;
  update: (me: Partial<Me>) => void;
  signOut: () => Promise<void>;
  /** Ends the account with Pure (open requests are cancelled by Huidly). */
  deleteAccount: () => Promise<void>;
};

const Context = createContext<AccountContext | null>(null);

const read = (): Me | null => (token.get() ? storage.getJson<Me>(KEYS.me) : null);

/**
 * Who is signed in: a client of Pure, signed in through Huidly with a code by e-mail. The name and e-mail are kept
 * next to the token (as the website does), so screens can greet without waiting for a call.
 */
export function AccountProvider({ children }: PropsWithChildren) {
  const [me, setMe] = useState<Me | null>(read);

  const write = useCallback((next: Me | null) => {
    storage.setJson(KEYS.me, next);
    setMe(next);
  }, []);

  const signedIn = useCallback(
    (t: string, client: Me) => {
      token.set(t);
      write(client);
    },
    [write],
  );
  const update = useCallback((fields: Partial<Me>) => setMe((current) => {
    if (!current) return current;
    const next = { ...current, ...fields };
    storage.setJson(KEYS.me, next);
    return next;
  }), []);
  const signOut = useCallback(async () => {
    await api.logout();
    token.set(null);
    write(null);
  }, [write]);
  const deleteAccount = useCallback(async () => {
    await api.deleteMe();
    token.set(null);
    write(null);
  }, [write]);

  // Check the token once on start; a 401 signs out (through onSignedOut), other errors keep what we know.
  useEffect(() => {
    if (!token.get()) return;
    api
      .me()
      .then((r) => r?.me && write(r.me))
      .catch(() => {});
  }, [write]);
  useEffect(() => onSignedOut(() => write(null)), [write]);
  useEffect(() => onStorage((key) => (key === KEYS.token || key === KEYS.me) && setMe(read())), []);

  const value = useMemo(() => ({ me, signedIn, update, signOut, deleteAccount }), [me, signedIn, update, signOut, deleteAccount]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAccount(): AccountContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
