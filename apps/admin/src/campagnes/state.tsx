import { dateKey, startOfDay } from '@pure-clinics/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '../components/ui';
import { retryShared, sharedGet, sharedSet, useSharedStatus, useSharedValue } from '../data/sharedStore';
import { HuidlyConnect } from '../huidly/Connect';
import { useHuidlyTeam } from '../huidly/client';
import { Card } from '../praktijk/kit';
import { useI18n, type Arg, type MessageKey } from '../i18n';
import {
  AUDIENCE,
  copyBlocks,
  newBlock,
  SEGMENTS,
  SETTINGS,
  seedCampaigns,
  slug,
  type Campaign,
  type Channel,
  contactsOf,
  type BackFlow,
  type Contact,
  type Segment,
  type SegmentId,
} from './data';
import type { CpRoute, CpTab } from './nav';
import { campaignData, useInvoices, useRegister } from './register';

// The module's state: campaigns, the (simulated) sync with Mailchimp and a few settings. It lives outside the
// component, so a visit to another part of the panel and back keeps what was written. Nothing leaves the browser.

export type SyncLine = { id: string; at: Date; key: MessageKey; args?: Record<string, Arg> };

export type SyncState = {
  at: Date;
  /** The step of a running sync (0–4) and its progress inside the run, 0–1. */
  running: { step: number; progress: number } | null;
  runs: number;
  audience: typeof AUDIENCE;
  segments: Segment[];
  log: SyncLine[];
};

export type Prefs = { senderId: string; fromName: string; replyTo: string; window: number; quietFrom: string; quietTo: string; noSunday: boolean; emailNight: boolean };

type Memory = { campaigns: Campaign[]; sync: SyncState; prefs: Prefs; created: number };

const minutes = (m: number) => m * 60000;
/**
 * The campaigns, the Mailchimp sync and the preferences are kept at Huidly as one piece ("campagnes" in
 * data/sharedStore.ts): everyone in the team sees the same campaigns, also after a reload. Until someone changes
 * something, they are the built-in ones below.
 */
const KEY = 'campagnes';
let memory: Memory | null = null;

function initial(now: Date, contacts: number): Memory {
  const at = new Date(now.getTime() - minutes(12));
  return {
    campaigns: seedCampaigns(at),
    sync: {
      at,
      running: null,
      runs: 0,
      audience: { ...AUDIENCE },
      segments: SEGMENTS.map((s) => ({ ...s })),
      log: [
        { id: 'l1', at, key: 'cp.sync.logAuto', args: { n: contacts } },
        { id: 'l2', at: new Date(at.getTime() - minutes(15)), key: 'cp.sync.logAuto', args: { n: contacts } },
        { id: 'l3', at: new Date(now.getTime() - minutes(280)), key: 'cp.sync.logWebhook', args: { name: 'Bram T.' } },
      ],
    },
    prefs: {
      senderId: SETTINGS.senderId,
      fromName: SETTINGS.fromName,
      replyTo: SETTINGS.replyTo,
      window: 7,
      quietFrom: '21:00',
      quietTo: '09:00',
      noSunday: true,
      emailNight: true,
    },
    created: 0,
  };
}

export const SYNC_STEPS = ['contacts', 'consent', 'tags', 'back', 'reports'] as const;

type Ctx = {
  now: Date;
  route: CpRoute;
  open: (tab: CpTab, campaign?: string) => void;
  campaigns: Campaign[];
  byId: (id: string) => Campaign | undefined;
  update: (id: string, patch: Partial<Campaign> | ((c: Campaign) => Partial<Campaign>)) => void;
  create: (channel: Channel, options?: { segment?: SegmentId; date?: Date }) => void;
  sync: SyncState;
  runSync: () => void;
  segment: (id: SegmentId) => Segment;
  /** The register at Huidly as Mailchimp contacts, newest first, and what came back from them. */
  contacts: Contact[];
  backflow: BackFlow[];
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  /** A toast; in the demo every "send" says that nothing really went out. */
  demo: (message: string) => void;
};

const CpContext = createContext<Ctx | null>(null);
export const useCp = () => useContext(CpContext)!;

type Props = { now: Date; route: CpRoute; onRoute: (route: CpRoute, scroll?: boolean) => void; children: ReactNode };

export function CpProvider({ now, route, onRoute, children }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  // The audience, the segments and the contacts come from the client register and the invoices at Huidly
  // (register.ts); the campaigns, the sync's log and the preferences are this module's own piece.
  const dayKey = dateKey(now);
  const register = useRegister(now);
  const invoices = useInvoices(now);
  const data = useMemo(() => campaignData(register, invoices, startOfDay(now)), [register, invoices, dayKey]);
  const contactCount = contactsOf(data.audience);
  const stored = useSharedValue<Memory>(KEY);
  const state = stored ?? (memory ??= initial(now, contactCount));
  const setState = useCallback((next: (m: Memory) => Memory) => {
    sharedSet(KEY, next(sharedGet<Memory>(KEY) ?? (memory ??= initial(now, contactCount))));
    // `now` and the count only matter for the very first, built-in campaigns.
  }, []);
  // A running sync only lives on this screen: its progress is not something to keep.
  const [running, setRunning] = useState<SyncState['running']>(null);
  const sync = useMemo<SyncState>(() => ({ ...state.sync, running, audience: data.audience, segments: data.segments }), [state.sync, running, data]);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const open = useCallback((tab: CpTab, campaign?: string) => onRoute({ tab, campaign }), [onRoute]);

  const update = useCallback((id: string, patch: Partial<Campaign> | ((c: Campaign) => Partial<Campaign>)) => {
    setState((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) }));
  }, []);

  const create = (channel: Channel, options: { segment?: SegmentId; date?: Date } = {}) => {
    const number = state.created + 1;
    const id = `nieuw-${channel}-${number}`;
    const date = options.date ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, channel === 'email' ? 10 : 11);
    const name = t(channel === 'email' ? 'cp.new.emailName' : 'cp.new.smsName', { n: number });
    const welcome = newBlock('text');
    welcome.text = 'Hoi *|FNAME|*,\n\n';
    const campaign: Campaign = {
      id,
      channel,
      name,
      status: 'concept',
      segment: options.segment ?? (channel === 'sms' ? 'sms' : 'all'),
      sendAt: date,
      author: 'husna',
      utm: `${slug(name)}-${date.getFullYear()}`,
      subject: '',
      preview: '',
      fromName: state.prefs.fromName,
      replyTo: state.prefs.replyTo,
      blocks: channel === 'email' ? copyBlocks([{ ...newBlock('heading') }, welcome, newBlock('button')]) : [],
      text: '',
      senderId: state.prefs.senderId,
      comments: [],
      results: null,
      mailchimpId: null,
    };
    setState((s) => ({ ...s, created: number, campaigns: [...s.campaigns, campaign] }));
    onRoute({ tab: route.tab === 'kalender' ? 'kalender' : 'campagnes', campaign: id });
  };

  // A sync in five steps of about 0.7 s each. The numbers are the register's: a sync only says how many contacts went
  // over and how many joined since the last one.
  const runSync = () => {
    if (running) return;
    const started = performance.now();
    // The panel's clock may run ahead (demo time or ?at=); the sync's time follows it.
    const offset = now.getTime() - Date.now();
    const total = SYNC_STEPS.length * 700;
    const tick = () => {
      const p = Math.min(1, (performance.now() - started) / total);
      if (p < 1) {
        setRunning({ step: Math.min(SYNC_STEPS.length - 1, Math.floor(p * SYNC_STEPS.length)), progress: p });
        timer.current = window.setTimeout(tick, 90);
        return;
      }
      setRunning(null);
      setState((s) => {
        const run = s.sync.runs + 1;
        const at = new Date(Date.now() + offset);
        const fresh = register.filter((c) => c.since.getTime() > s.sync.at.getTime()).length;
        return {
          ...s,
          campaigns: s.campaigns.map((c) => (c.results && c.channel === 'email' ? { ...c, results: { ...c.results, fetched: at } } : c)),
          sync: {
            ...s.sync,
            at,
            running: null,
            runs: run,
            log: [{ id: `l-${run}`, at, key: 'cp.sync.logManual' as MessageKey, args: { n: contactCount, fresh, back: 0 } }, ...s.sync.log].slice(0, 6),
          },
        };
      });
      toast(t('cp.sync.doneToast'));
    };
    tick();
  };

  const value = useMemo<Ctx>(
    () => ({
      now,
      route,
      open,
      campaigns: state.campaigns,
      byId: (id: string) => state.campaigns.find((c) => c.id === id),
      update,
      create,
      sync,
      runSync,
      segment: (id: SegmentId) =>
        id === 'all'
          ? {
              id: 'all',
              tag: '',
              count: contactCount,
              email: data.audience.subscribed,
              sms: data.audience.sms,
              rules: 0,
              source: 'file',
              lag: 0,
            }
          : (data.segments.find((s) => s.id === id) ?? data.segments[0]),
      contacts: data.contacts,
      backflow: data.backflow,
      prefs: state.prefs,
      setPrefs: (patch: Partial<Prefs>) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
      demo: toast,
    }),
    // create and runSync read the latest state through the closure of this render.
    [now, route, open, state, sync, data, contactCount, update, toast],
  );
  return <CpContext.Provider value={value}>{children}</CpContext.Provider>;
}

/** Campagnes shows the team's campaigns as Huidly keeps them: without the team's connection it asks for one first. */
export function CpGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const team = useHuidlyTeam();
  const shared = useSharedStatus();
  if (!team) return <HuidlyConnect what={t('hy.why.campaigns')} />;
  if (shared !== 'ready') {
    return (
      <Card eyebrow={t('hy.eyebrow')} title={t(shared === 'error' ? 'hy.day.failed' : 'hy.day.loading')} className="hy-connect">
        {shared === 'error' ? (
          <button className="btn btn-ghost" type="button" onClick={retryShared}>
            {t('hy.day.retry')}
          </button>
        ) : null}
      </Card>
    );
  }
  return <>{children}</>;
}

/** The segment's name in the reader's language; the tag in Mailchimp stays as it is. */
export const segmentKey = (id: SegmentId): MessageKey => `cp.seg.${id}.name` as MessageKey;
export const statusKey = (status: Campaign['status']): MessageKey => `cp.status.${status}` as MessageKey;
