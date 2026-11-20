import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '../components/ui';
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
  type Segment,
  type SegmentId,
} from './data';
import type { CpRoute, CpTab } from './nav';

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
let memory: Memory | null = null;

function initial(now: Date): Memory {
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
        { id: 'l1', at, key: 'cp.sync.logAuto', args: { n: 6742 } },
        { id: 'l2', at: new Date(at.getTime() - minutes(15)), key: 'cp.sync.logAuto', args: { n: 6741 } },
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
  const [state, setState] = useState<Memory>(() => (memory ??= initial(now)));
  const timer = useRef(0);

  useEffect(() => {
    memory = state;
  }, [state]);
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

  // A sync in five steps of about 0.7 s each; afterwards the numbers move a little, as they would after a real one.
  const runSync = () => {
    if (state.sync.running) return;
    const started = performance.now();
    // The panel's clock may run ahead (demo time or ?at=); the sync's time follows it.
    const offset = now.getTime() - Date.now();
    const total = SYNC_STEPS.length * 700;
    const tick = () => {
      const p = Math.min(1, (performance.now() - started) / total);
      if (p < 1) {
        setState((s) => ({ ...s, sync: { ...s.sync, running: { step: Math.min(SYNC_STEPS.length - 1, Math.floor(p * SYNC_STEPS.length)), progress: p } } }));
        timer.current = window.setTimeout(tick, 90);
        return;
      }
      setState((s) => {
        const run = s.sync.runs + 1;
        const fresh = [3, 2, 4, 1][run % 4];
        const back = run % 2;
        const audience = {
          ...s.sync.audience,
          subscribed: s.sync.audience.subscribed + fresh - 1 - back,
          pending: s.sync.audience.pending + 1,
          unsubscribed: s.sync.audience.unsubscribed + back,
          sms: s.sync.audience.sms + (run % 3 === 1 ? 1 : 0),
        };
        const contacts = audience.subscribed + audience.unsubscribed + audience.cleaned + audience.pending + audience.transactional;
        const at = new Date(Date.now() + offset);
        const segments = s.sync.segments.map((seg) => {
          const bump = seg.id === 'nijmegen' ? fresh - 1 : seg.id === 'uden' ? 1 : seg.id === 'sms' ? audience.sms - s.sync.audience.sms : 0;
          return { ...seg, count: seg.count + bump, email: seg.email + (seg.id === 'sms' ? 0 : Math.max(0, bump - back)), sms: seg.id === 'sms' ? audience.sms : seg.sms, lag: 0 };
        });
        return {
          ...s,
          campaigns: s.campaigns.map((c) => (c.results && c.channel === 'email' ? { ...c, results: { ...c.results, fetched: at } } : c)),
          sync: {
            at,
            running: null,
            runs: run,
            audience,
            segments,
            log: [{ id: `l-${run}`, at, key: 'cp.sync.logManual' as MessageKey, args: { n: contacts, fresh, back } }, ...s.sync.log].slice(0, 6),
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
      sync: state.sync,
      runSync,
      segment: (id: SegmentId) =>
        id === 'all'
          ? {
              id: 'all',
              tag: '',
              count: state.sync.audience.subscribed + state.sync.audience.unsubscribed + state.sync.audience.cleaned + state.sync.audience.pending + state.sync.audience.transactional,
              email: state.sync.audience.subscribed,
              sms: state.sync.audience.sms,
              rules: 0,
              source: 'file',
              lag: 0,
            }
          : (state.sync.segments.find((s) => s.id === id) ?? state.sync.segments[0]),
      prefs: state.prefs,
      setPrefs: (patch: Partial<Prefs>) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
      demo: toast,
    }),
    // create and runSync read the latest state through the closure of this render.
    [now, route, open, state, update, toast],
  );
  return <CpContext.Provider value={value}>{children}</CpContext.Provider>;
}

/** The segment's name in the reader's language; the tag in Mailchimp stays as it is. */
export const segmentKey = (id: SegmentId): MessageKey => `cp.seg.${id}.name` as MessageKey;
export const statusKey = (status: Campaign['status']): MessageKey => `cp.status.${status}` as MessageKey;
