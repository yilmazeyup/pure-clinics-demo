import { LOCATIONS, type LocationId, type SpecialistId } from '@pure-clinics/shared';

// Who can sign in to the demo, and what each of them sees. There is no server behind the demo, so signing in is picking
// one of these accounts; the choice is remembered in this browser. A real sign-in (own e-mail address and a code) needs
// a server and comes later.

export type Role = 'admin' | 'staff' | 'client';

export type AccountId = 'admin' | 'loubna' | 'husna' | 'client';

export type Account = {
  id: AccountId;
  role: Role;
  name: string;
  /** The clinic a team member works at. */
  locationId?: LocationId;
  /** A therapist sees her own agenda. */
  specialist?: SpecialistId;
  /** The front desk sees the whole day of its clinic. */
  desk?: boolean;
};

/** Neslihan (owner), Loubna (skin therapist) and Husna (front desk) are Pure's real first names; the client is invented. */
export const ACCOUNTS: Account[] = [
  { id: 'admin', role: 'admin', name: 'Neslihan' },
  { id: 'loubna', role: 'staff', name: 'Loubna', locationId: 'nijmegen', specialist: 'loubna' },
  { id: 'husna', role: 'staff', name: 'Husna', locationId: 'nijmegen', desk: true },
  { id: 'client', role: 'client', name: 'Sanne Willems' },
];

export const ROLES: Role[] = ['admin', 'staff', 'client'];

export const accountById = (id: string | null | undefined) => ACCOUNTS.find((a) => a.id === id) ?? null;

export const cityOf = (id?: LocationId) => LOCATIONS.find((l) => l.id === id)?.city ?? '';

/** "NE", "LO", "SW": the letters on the square avatar. */
export const initialsOf = (name: string) => {
  const parts = name.split(' ').filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
};

const KEY = 'pure-admin-account';

/** The account remembered in this browser; storage can be blocked, then nobody is signed in. */
export function storedAccount(): Account | null {
  try {
    // A shared link can choose the account: …/beheer/?als=client
    const asked = new URLSearchParams(window.location.search).get('als');
    if (asked && accountById(asked)) {
      window.localStorage.setItem(KEY, asked);
      const url = new URL(window.location.href);
      url.searchParams.delete('als');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      return accountById(asked);
    }
    return accountById(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function storeAccount(account: Account | null) {
  try {
    if (account) window.localStorage.setItem(KEY, account.id);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
}
