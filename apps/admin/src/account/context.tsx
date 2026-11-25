import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { storeAccount, storedAccount, type Account } from './accounts';

type AccountState = { account: Account | null; signIn: (account: Account) => void; signOut: () => void };

const AccountContext = createContext<AccountState>({ account: null, signIn: () => {}, signOut: () => {} });

/** Who is signed in; the panel, the menu and the top bar follow it. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(storedAccount);
  const value = useMemo<AccountState>(
    () => ({
      account,
      signIn: (next) => {
        storeAccount(next);
        setAccount(next);
        window.scrollTo({ top: 0 });
      },
      signOut: () => {
        storeAccount(null);
        setAccount(null);
        // Back to a clean address, so the next person starts on their own first page.
        history.replaceState(null, '', window.location.pathname);
        window.scrollTo({ top: 0 });
      },
    }),
    [account],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export const useAccount = () => useContext(AccountContext);
