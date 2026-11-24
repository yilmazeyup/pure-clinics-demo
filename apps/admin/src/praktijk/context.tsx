import { startOfDay, dateKey, type LocationId, type SpecialistId, type TreatmentId } from '@pure-clinics/shared';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '../components/ui';
import { useI18n } from '../i18n';
import type { ScreenId } from './nav';

/** An appointment handed from one screen to another, e.g. from the agenda to a new invoice. */
export type ApptRef = {
  id: string;
  /** "Emma B.", as the agenda shows her; clientId opens her file. */
  client: string;
  clientId: string;
  treatment: TreatmentId;
  specialistId: SpecialistId;
  clinic: LocationId;
  start: Date;
  end: Date;
  price: number;
};

/** What the side panel shows: an appointment (by id, on its day), a client or an invoice. */
export type Detail =
  | { kind: 'appt'; id: string; day: Date }
  /** A client by id; `short` and `clinic` find one met in the diary who is not in the client list yet. */
  | { kind: 'client'; id: string; short?: string; clinic?: LocationId }
  | { kind: 'invoice'; id: string };

/** Where a jump should land: a feature to highlight, a client's file, or an appointment to invoice. */
export type Target = { feature?: string; clientId?: string; appt?: ApptRef; invoiceId?: string; at: number };

type Ctx = {
  now: Date;
  /** Midnight of the demo day; data that depends on the day follows this, not the ticking clock. */
  today: Date;
  screen: ScreenId;
  go: (screen: ScreenId, target?: Omit<Target, 'at'>) => void;
  /** The latest jump; screens react to it (open a tab, a client, a dialog) when `at` changes. */
  target: Target | null;
  /** The client whose file the Dossier shows. */
  clientId: string | null;
  setClientId: (id: string) => void;
  /** Says that, in the demo, nothing really leaves the building (or a message of the screen's own). */
  demo: (message?: string) => void;
  store: Record<string, unknown>;
  setStore: (update: (store: Record<string, unknown>) => Record<string, unknown>) => void;
  seed: <T>(key: string, init: () => T) => T;
  /** The side panel's trail: the last one is shown, the ones before it are where the back arrow leads. */
  details: Detail[];
  /** Opens the side panel on this; from inside the panel (`push`) it adds a step, so back returns to where it was. */
  openDetail: (detail: Detail, push?: boolean) => void;
  backDetail: () => void;
  closeDetail: () => void;
};

const PraktijkContext = createContext<Ctx | null>(null);

export function usePraktijk(): Ctx {
  return useContext(PraktijkContext)!;
}

/**
 * State that outlives a screen and is shared between screens, e.g. the invoices that both Facturen and Declaraties
 * show. Works like useState; `init` runs once per key for the whole module.
 */
export function useShared<T>(key: string, init: () => T): [T, (next: T | ((prev: T) => T)) => void] {
  const { store, setStore, seed } = usePraktijk();
  const value = (key in store ? store[key] : seed(key, init)) as T;
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setStore((s) => {
        const prev = (key in s ? s[key] : seed(key, init)) as T;
        return { ...s, [key]: typeof next === 'function' ? (next as (p: T) => T)(prev) : next };
      }),
    // `init` is only used for the first value, so it may change between renders.
    [key, setStore, seed],
  );
  return [value, set];
}

type ProviderProps = {
  now: Date;
  screen: ScreenId;
  initialFeature?: string;
  onScreen: (screen: ScreenId) => void;
  children: ReactNode;
};

export function PraktijkProvider({ now, screen, initialFeature, onScreen, children }: ProviderProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [target, setTarget] = useState<Target | null>(() => (initialFeature ? { feature: initialFeature, at: Date.now() } : null));
  const [clientId, setClientId] = useState<string | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [store, setStoreState] = useState<Record<string, unknown>>({});
  const seeds = useRef(new Map<string, unknown>());
  const dayKey = dateKey(now);
  const today = useMemo(() => startOfDay(now), [dayKey]);

  const seed = useCallback(<T,>(key: string, init: () => T): T => {
    if (!seeds.current.has(key)) seeds.current.set(key, init());
    return seeds.current.get(key) as T;
  }, []);

  const openDetail = useCallback((detail: Detail, push = false) => setDetails((list) => (push ? [...list, detail] : [detail])), []);
  const backDetail = useCallback(() => setDetails((list) => list.slice(0, -1)), []);
  const closeDetail = useCallback(() => setDetails([]), []);

  const go = useCallback(
    (next: ScreenId, to?: Omit<Target, 'at'>) => {
      // Going to another screen closes the side panel.
      setDetails([]);
      if (to?.clientId) setClientId(to.clientId);
      setTarget(to ? { ...to, at: Date.now() } : null);
      onScreen(next);
    },
    [onScreen],
  );

  const value = useMemo<Ctx>(
    () => ({
      now,
      today,
      screen,
      go,
      target,
      clientId,
      setClientId,
      demo: (message?: string) => toast(message ?? t('pk.common.demoSent')),
      store,
      setStore: setStoreState,
      seed,
      details,
      openDetail,
      backDetail,
      closeDetail,
    }),
    [now, today, screen, go, target, clientId, store, seed, t, toast, details, openDetail, backDetail, closeDetail],
  );
  return <PraktijkContext.Provider value={value}>{children}</PraktijkContext.Provider>;
}
