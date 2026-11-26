import { PHOTO_KEYS, type L10n, type PhotoKey } from '@pure-clinics/shared';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import snapshot from './data/acties.json';

// Pure's current offers come from the website's own file (site/website/data/acties.json), word for word as Pure wrote
// them. The app is served from the same address as the site, so it reads that file when it opens: a new campaign on
// the site shows in the app without a new build. The copy next to this file is only a fallback (no connection, or a
// phone build); it is filtered by the same end dates, so an old copy never shows an offer that has ended.

export type Deal = { treatment: string; text: L10n };
export type Campaign = { id: string; name: L10n; from?: string; until?: string; photo?: string; deals: Deal[] };
export type GiftOffer = { active: boolean; amount: number; bonus: number; cards: { id: string; price: number; value: number }[] };
type Acties = { giftcard: GiftOffer; campaigns: Campaign[] };

const SITE = 'https://pureclinics.savastana.com';
const URL_ = Platform.OS === 'web' ? '/website/data/acties.json' : `${SITE}/website/data/acties.json`;

let current: Acties = snapshot as Acties;
let loading: Promise<void> | null = null;
const hooks = new Set<() => void>();

function load() {
  loading ??= fetch(URL_, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((data: Acties) => {
      if (data && Array.isArray(data.campaigns) && data.giftcard) {
        current = data;
        hooks.forEach((fn) => fn());
      }
    })
    .catch(() => {
      /* keep the copy that came with the app */
    });
  return loading;
}

/** Today's date in Amsterdam, as YYYY-MM-DD. */
function amsterdamDay(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** A campaign runs from `from` to `until`; a bare date counts as the whole day in Amsterdam. */
export function isRunning(c: { from?: string; until?: string }, now = new Date()): boolean {
  const day = amsterdamDay(now);
  const started = !c.from || (c.from.length === 10 ? day >= c.from : now.getTime() >= new Date(c.from).getTime());
  const ended = !!c.until && (c.until.length === 10 ? day > c.until : now.getTime() > new Date(c.until).getTime());
  return started && !ended;
}

export const campaignPhoto = (c: Campaign): PhotoKey => ((PHOTO_KEYS as readonly string[]).includes(c.photo ?? '') ? (c.photo as PhotoKey) : 'pc-facial');

/** The offers that run right now. Checks the clock every minute, so an offer disappears at its end without a restart. */
export function useCampaigns() {
  const [, setVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    hooks.add(bump);
    load();
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => {
      hooks.delete(bump);
      clearInterval(timer);
    };
  }, []);
  const data = current;
  return useMemo(() => {
    const campaigns = data.campaigns.filter((c) => c.deals?.length && isRunning(c, now));
    return {
      campaigns,
      gift: data.giftcard?.active ? data.giftcard : null,
      dealsFor: (treatmentId: string) => campaigns.flatMap((c) => c.deals.filter((d) => d.treatment === treatmentId).map((deal) => ({ campaign: c, deal }))),
    };
  }, [data, now]);
}
