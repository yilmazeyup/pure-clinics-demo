import type { ReactNode } from 'react';

import { useI18n, type Arg } from '../i18n';
import { PkIcon } from '../praktijk/icons';
import { Chip, type Tone } from '../praktijk/kit';
import type { Campaign, Channel, Results, Status } from './data';
import { statusKey } from './state';

// Small pieces every tab of Campagnes shares. Markers are squares with a small radius, like the rest of the panel.

const STATUS_TONE: Record<Status, Tone> = { concept: 'outline', review: 'warn', scheduled: 'brand', sent: 'good' };
const STATUS_ICON = { concept: 'edit', review: 'eye', scheduled: 'clock', sent: 'check' } as const;

export function StatusChip({ status }: { status: Status }) {
  const { t } = useI18n();
  return (
    <Chip tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
      {t(statusKey(status))}
    </Chip>
  );
}

/** The channel as a small square: filled for e-mail, outlined for SMS. */
export function ChannelMark({ channel, size = 26 }: { channel: Channel; size?: number }) {
  const { t } = useI18n();
  return (
    <span className={`cp-mark cp-mark--${channel}`} style={{ width: size, height: size }} title={t(channel === 'email' ? 'cp.channel.email' : 'cp.channel.sms')}>
      <PkIcon name={channel === 'email' ? 'mail' : 'sms'} size={Math.round(size * 0.58)} />
    </span>
  );
}

const INTL = { nl: 'nl-NL', en: 'en-GB', ar: 'ar-u-nu-latn', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES' } as const;

/** A share as a percentage, with one decimal below 10% (0,4% rather than 0%). */
export function usePct() {
  const { locale } = useI18n();
  const whole = new Intl.NumberFormat(INTL[locale], { style: 'percent', maximumFractionDigits: 0 });
  const fine = new Intl.NumberFormat(INTL[locale], { style: 'percent', maximumFractionDigits: 1 });
  return (value: number) => (value > 0 && value < 0.1 ? fine : whole).format(value);
}

/** Numbers in a sentence's arguments get the reader's thousands separator. */
export function useArgs() {
  const { num } = useI18n();
  return (args?: Record<string, Arg>) => (args ? Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'number' && Math.abs(v) >= 1000 ? num(v) : v])) : undefined);
}

/** "vr 20 nov · 10:00". */
export function useWhen() {
  const { dateShort, clock } = useI18n();
  return (date: Date) => `${dateShort(date)} · ${clock(date)}`;
}

/** "zojuist", "12 min geleden", "3 uur geleden", "gisteren", "4 dagen geleden". */
export function useSince() {
  const { t } = useI18n();
  return (then: Date, now: Date) => {
    const m = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
    if (m < 1) return t('cp.time.justNow');
    if (m < 60) return t('cp.time.minAgo', { n: m });
    if (m < 60 * 24) return t('cp.time.hourAgo', { n: Math.round(m / 60) });
    const d = Math.round(m / 1440);
    return d === 1 ? t('cp.time.yesterday') : t('cp.time.daysAgo', { n: d });
  };
}

/** Bookings and orders the panel tied to a campaign, with their revenue. */
export function attributed(results: Results | null) {
  const lines = results?.lines ?? [];
  const bookings = lines.filter((l) => l.kind === 'booking');
  const orders = lines.filter((l) => l.kind === 'order');
  return {
    bookings: bookings.reduce((n, l) => n + l.count, 0),
    orders: orders.reduce((n, l) => n + l.count, 0),
    revenue: lines.reduce((n, l) => n + l.revenue, 0),
  };
}

/** Delivered, opened, clicked as bars against the recipients. */
export function Funnel({ campaign }: { campaign: Campaign }) {
  const { t, num } = useI18n();
  const pct = usePct();
  const r = campaign.results;
  if (!r) return null;
  const rows: [string, number, number][] = [
    [t('cp.res.delivered'), r.delivered, r.recipients],
    ...(r.opens !== null ? ([[t('cp.res.opens'), r.opens, r.delivered]] as [string, number, number][]) : []),
    [t('cp.res.clicks'), r.clicks, r.delivered],
  ];
  return (
    <div className="cp-funnel">
      {rows.map(([label, value, of]) => (
        <div key={label} className="cp-funnel-row">
          <span>{label}</span>
          <span className="cp-funnel-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(2, (value / r.recipients) * 100)}%` }} />
          </span>
          <strong className="pk-num">{num(value)}</strong>
          <small className="pk-num">{pct(value / of)}</small>
        </div>
      ))}
    </div>
  );
}

/** A labelled line in a key figure row: a small eyebrow over a serif number. */
export function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="cp-figure">
      <span className="eyebrow">{label}</span>
      <strong className="pk-num">{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

/** An arrow that points forward in the reading direction. */
export function Forward({ size = 14 }: { size?: number }) {
  return (
    <span className="cp-forward" aria-hidden="true">
      <PkIcon name="arrow" size={size} />
    </span>
  );
}

/** A tag as Mailchimp shows it. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="cp-tag pk-mono">{children}</span>;
}
