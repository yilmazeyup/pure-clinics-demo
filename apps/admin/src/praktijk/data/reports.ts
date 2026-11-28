import {
  addDays,
  dateKey,
  LOCATIONS,
  openingHours,
  SPECIALISTS,
  startOfDay,
  type LocationId,
  type Specialist,
  type SpecialistId,
  type TreatmentCategory,
  type TreatmentId,
} from '@pure-clinics/shared';

import { agendaNow, diaryOn } from '../../data/live';
import type { AgendaState } from './agenda';
import { works, type Appt } from '../../data/clinics';
import { rng } from '../../data/random';

// Figures for the reports, worked out from the agenda itself, with every change kept at Huidly (diaryOn), so the numbers
// of the last weeks agree everywhere. Days up to today count as realised; later days are what is booked so
// far, and what is still likely to be booked fills the forecast. A diary day takes a while to generate, so days far
// from today (a whole year, a forecast) are estimated from a weekday profile of the real diary days around today,
// with a gentle seasonal curve: laser season in winter, quieter in summer.

const dayCache = new Map<string, Appt[]>();

/**
 * The window of real diary days: the last two weeks and today. Days ahead are what is booked so far, which the reports
 * model anyway (a near day is nearly full, a far one barely), so they follow the profile too.
 */
const EXACT_BACK = 14;
const EXACT_AHEAD = 0;

/** Revenue per month relative to the year, from busy winter (laser season) to a quiet summer. */
const SEASON = [1.04, 1.02, 0.98, 0.95, 0.9, 0.86, 0.8, 0.84, 0.94, 1.02, 1.06, 0.97];

/**
 * The appointments of a day as the agenda has them (moves, deletions and new ones included), remembered: a year of
 * reports asks for every day more than once. A change in the agenda starts the reports afresh.
 */
let cachedFor: AgendaState | null = null;
export function apptsOn(day: Date): Appt[] {
  const agenda = agendaNow();
  if (agenda !== cachedFor) {
    cachedFor = agenda;
    dayCache.clear();
    profileCache.clear();
  }
  const key = dateKey(day);
  let list = dayCache.get(key);
  if (!list) {
    list = diaryOn(day, agenda);
    dayCache.set(key, list);
  }
  return list;
}

const inWindow = (day: Date, today: Date) => {
  const ahead = daysAhead(day, today);
  return ahead >= -EXACT_BACK && ahead <= EXACT_AHEAD;
};

type DayRevenue = Record<LocationId, number>;
const profileCache = new Map<string, DayRevenue[]>();

/** Average revenue per weekday and location over the last two weeks of the real diary. */
function profile(today: Date): DayRevenue[] {
  const key = dateKey(today);
  const known = profileCache.get(key);
  if (known) return known;
  const sums = Array.from({ length: 7 }, () => ({ nijmegen: 0, uden: 0 }) as DayRevenue);
  const counts = Array(7).fill(0);
  for (let back = 1; back <= 14; back++) {
    const day = addDays(startOfDay(today), -back);
    counts[day.getDay()]++;
    for (const a of apptsOn(day)) sums[day.getDay()][a.clinic] += a.price;
  }
  const out = sums.map((s, i) => ({ nijmegen: s.nijmegen / Math.max(1, counts[i]), uden: s.uden / Math.max(1, counts[i]) }));
  profileCache.set(key, out);
  return out;
}

/**
 * A full diary's revenue per location on a day: the real diary near today, an estimate further away (closed days and
 * locations stay at zero, and a small day-to-day variation keeps the curve natural).
 */
export function dayRevenue(day: Date, today: Date): DayRevenue {
  if (inWindow(day, today)) {
    const out = { nijmegen: 0, uden: 0 } as DayRevenue;
    for (const a of apptsOn(day)) out[a.clinic] += a.price;
    return out;
  }
  const base = profile(today)[day.getDay()];
  const season = SEASON[day.getMonth()] / SEASON[today.getMonth()];
  const jitter = 0.9 + rng(`pk-day-${dateKey(day)}`)() * 0.2;
  return {
    nijmegen: openingHours(day, 'nijmegen') ? base.nijmegen * season * jitter : 0,
    uden: openingHours(day, 'uden') ? base.uden * season * jitter : 0,
  };
}

export type Period = 'month' | 'quarter' | 'year';
export type Bucket = { start: Date; end: Date; kind: 'week' | 'month' };
export type Range = { start: Date; end: Date; buckets: Bucket[] };

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const monday = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

/** ISO week number, as Dutch diaries count weeks. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function weeks(start: Date, end: Date): Bucket[] {
  const out: Bucket[] = [];
  for (let w = monday(start); w < end; w = addDays(w, 7)) {
    const bucket: Bucket = { start: w < start ? start : w, end: addDays(w, 7) > end ? end : addDays(w, 7), kind: 'week' };
    // A month that starts on a Sunday would get a week of one closed day; leave it out.
    if (days(bucket.start, bucket.end).some((d) => openingHours(d))) out.push(bucket);
  }
  return out;
}

/** This month by week, this quarter by week, or this year by month; `back` steps whole periods into the past. */
export function periodRange(period: Period, today: Date, back = 0): Range {
  if (period === 'year') {
    const start = new Date(today.getFullYear() - back, 0, 1);
    const end = new Date(today.getFullYear() - back + 1, 0, 1);
    return { start, end, buckets: Array.from({ length: 12 }, (_, m) => ({ start: addMonths(start, m), end: addMonths(start, m + 1), kind: 'month' as const })) };
  }
  if (period === 'quarter') {
    const start = addMonths(new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1), -3 * back);
    const end = addMonths(start, 3);
    return { start, end, buckets: weeks(start, end) };
  }
  const start = addMonths(monthStart(today), -back);
  const end = addMonths(start, 1);
  return { start, end, buckets: weeks(start, end) };
}

/** How much of a day's diary is already booked, by how far ahead it is: the next days are nearly full, in six weeks little is. */
export const bookedShare = (daysAhead: number) => (daysAhead <= 0 ? 1 : Math.max(0.12, 1 - daysAhead / 45));
/** Of what is not booked yet, the part that usually still is. */
const LATE_FILL = 0.82;

const days = (start: Date, end: Date) => {
  const out: Date[] = [];
  for (let d = startOfDay(start); d < end; d = addDays(d, 1)) out.push(d);
  return out;
};

const daysAhead = (day: Date, today: Date) => Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86400000);

export type BucketRevenue = {
  bucket: Bucket;
  /** Realised revenue per location. */
  actual: Record<LocationId, number>;
  /** Booked in the diary, not yet given. */
  booked: number;
  /** Likely still to be booked. */
  expected: number;
  current: boolean;
};

export function revenueByBucket(range: Range, today: Date): BucketRevenue[] {
  const t0 = startOfDay(today).getTime();
  return range.buckets.map((bucket) => {
    const actual = { nijmegen: 0, uden: 0 } as Record<LocationId, number>;
    let booked = 0;
    let expected = 0;
    for (const day of days(bucket.start, bucket.end)) {
      const revenue = dayRevenue(day, today);
      if (day.getTime() <= t0) {
        actual.nijmegen += revenue.nijmegen;
        actual.uden += revenue.uden;
      } else {
        const full = revenue.nijmegen + revenue.uden;
        const share = bookedShare(daysAhead(day, today));
        booked += full * share;
        expected += full * (1 - share) * LATE_FILL;
      }
    }
    return { bucket, actual, booked, expected, current: bucket.start.getTime() <= t0 && t0 < bucket.end.getTime() };
  });
}

/** Realised revenue between two days up to and including today, both locations. */
export function realisedTotal(start: Date, end: Date, today: Date): number {
  const stop = Math.min(end.getTime(), addDays(startOfDay(today), 1).getTime());
  return days(start, new Date(stop)).reduce((s, d) => {
    const r = dayRevenue(d, today);
    return s + r.nijmegen + r.uden;
  }, 0);
}

/**
 * The real appointments given in a period, up to today and at most two weeks back: the sample that shares by
 * treatment, specialist and client are read from. `scale` turns sample amounts into amounts for the whole period.
 */
export function realisedSample(start: Date, end: Date, today: Date): { list: Appt[]; scale: number } {
  const from = new Date(Math.max(start.getTime(), addDays(startOfDay(today), -EXACT_BACK).getTime()));
  const stop = new Date(Math.min(end.getTime(), addDays(startOfDay(today), 1).getTime()));
  const list = days(from, stop).flatMap(apptsOn);
  const sample = sumPrice(list);
  return { list, scale: sample ? realisedTotal(start, end, today) / sample : 1 };
}

export const sumPrice = (list: Appt[]) => list.reduce((s, a) => s + a.price, 0);

export function byCategory(list: Appt[]): { category: TreatmentCategory; revenue: number; count: number }[] {
  const map = new Map<TreatmentCategory, { revenue: number; count: number }>();
  for (const a of list) {
    const row = map.get(a.treatment.category) ?? { revenue: 0, count: 0 };
    row.revenue += a.price;
    row.count++;
    map.set(a.treatment.category, row);
  }
  return [...map.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.revenue - a.revenue);
}

/** The coming weeks as the diary has them now: booked, and what will likely still be booked. */
export function comingWeeks(today: Date, count = 6): { start: Date; booked: number; expected: number }[] {
  const first = addDays(startOfDay(today), 1);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(first, i * 7);
    let booked = 0;
    let expected = 0;
    for (const day of days(start, addDays(start, 7))) {
      const revenue = dayRevenue(day, today);
      const full = revenue.nijmegen + revenue.uden;
      const share = bookedShare(daysAhead(day, today));
      booked += full * share;
      expected += full * (1 - share) * LATE_FILL;
    }
    return { start, booked, expected };
  });
}

export type MonthPoint = { month: Date; value: number; low?: number; high?: number; forecast: boolean };

/**
 * Twelve months back and three ahead. The months behind are realised (this month: realised, booked and likely), the
 * months ahead a forecast from the diary with a band that widens the further it looks.
 */
export function forecast(today: Date): MonthPoint[] {
  const current = monthStart(today);
  const out: MonthPoint[] = [];
  for (let i = -11; i <= 3; i++) {
    const month = addMonths(current, i);
    const range: Range = { start: month, end: addMonths(month, 1), buckets: [{ start: month, end: addMonths(month, 1), kind: 'month' }] };
    const [r] = revenueByBucket(range, today);
    if (i <= 0) {
      const value = r.actual.nijmegen + r.actual.uden + (i === 0 ? r.booked + r.expected : 0);
      out.push({ month, value, forecast: i === 0, low: i === 0 ? value * 0.97 : undefined, high: i === 0 ? value * 1.03 : undefined });
    } else {
      const value = r.booked + r.expected;
      const full = days(month, addMonths(month, 1)).reduce((s, d) => {
        const r = dayRevenue(d, today);
        return s + r.nijmegen + r.uden;
      }, 0);
      // Far ahead little is booked yet: lean on how full the diary usually gets.
      const likely = Math.max(value, full * 0.93);
      const spread = 0.05 + i * 0.035;
      out.push({ month, value: likely, low: likely * (1 - spread), high: likely * (1 + spread), forecast: true });
    }
  }
  return out;
}

export type StaffRow = { specialist: Specialist; scheduled: number; treated: number; revenue: number; followUp: number; count: number };

/** Hours on the roster in a span: the opening hours of every day she works. */
function rosterHours(s: Specialist, start: Date, stop: Date): number {
  let hours = 0;
  for (const day of days(start, stop)) {
    const open = openingHours(day, s.locationId);
    if (open && works(s, day)) hours += open.close - open.open;
  }
  return hours;
}

/**
 * Hours on the roster, hours treating, revenue and the share of clients who booked a next visit. Treating hours and
 * revenue come from the real diary of the last weeks, scaled to the roster of the whole period.
 */
export function staffPerformance(range: Range, today: Date): StaffRow[] {
  const stop = new Date(Math.min(range.end.getTime(), addDays(startOfDay(today), 1).getTime()));
  const from = new Date(Math.max(range.start.getTime(), addDays(startOfDay(today), -EXACT_BACK).getTime()));
  const { list } = realisedSample(range.start, range.end, today);
  return SPECIALISTS.map((s) => {
    const scheduled = rosterHours(s, range.start, stop);
    const sampled = rosterHours(s, from, stop);
    const scale = sampled ? scheduled / sampled : 1;
    const own = list.filter((a) => a.specialist.id === s.id);
    const r = rng(`pk-followup-${s.id}-${dateKey(range.start)}`);
    return {
      specialist: s,
      scheduled,
      treated: (own.reduce((n, a) => n + a.treatment.minutes, 0) / 60) * scale,
      revenue: sumPrice(own) * scale,
      followUp: s.role === 'beauty' ? 0.52 + r() * 0.14 : 0.62 + r() * 0.24,
      count: Math.round(own.length * scale),
    };
  });
}

/** The ten clients who spent most in the period. */
export function topClients(list: Appt[]): { client: string; clinic: LocationId; visits: number; revenue: number; last: Date }[] {
  const map = new Map<string, { client: string; clinic: LocationId; visits: number; revenue: number; last: Date }>();
  for (const a of list) {
    const row = map.get(a.client) ?? { client: a.client, clinic: a.clinic, visits: 0, revenue: 0, last: a.start };
    row.visits++;
    row.revenue += a.price;
    if (a.start > row.last) row.last = a.start;
    map.set(a.client, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || b.visits - a.visits).slice(0, 10);
}

export type OccupancyCell = { day: Date; value: number | null; minutes: number; open: number };

/** Per agenda and per day of a week (Monday to Saturday): booked minutes against open minutes; null when not on the roster. */
export function occupancyWeek(weekStart: Date): Record<SpecialistId, OccupancyCell[]> {
  const out = {} as Record<SpecialistId, OccupancyCell[]>;
  const week = Array.from({ length: 6 }, (_, i) => addDays(weekStart, i));
  for (const s of SPECIALISTS) {
    out[s.id] = week.map((day) => {
      const hours = openingHours(day, s.locationId);
      if (!hours || !works(s, day)) return { day, value: null, minutes: 0, open: 0 };
      const open = (hours.close - hours.open) * 60;
      const minutes = apptsOn(day)
        .filter((a) => a.specialist.id === s.id)
        .reduce((n, a) => n + a.treatment.minutes, 0);
      return { day, value: Math.min(1, minutes / open), minutes, open };
    });
  }
  return out;
}

export const weekStartOf = monday;

export const COMPLICATION_TYPES = ['redness', 'blister', 'hyper', 'hypo', 'allergy', 'bruise', 'infection'] as const;
export type ComplicationType = (typeof COMPLICATION_TYPES)[number];
export const SEVERITIES = ['light', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Registered complications in a period, by type and severity: few, and nearly all light. */
export function complications(range: Range, today: Date): Record<ComplicationType, Record<Severity, number>> {
  const r = rng(`pk-complications-${dateKey(range.start)}-${dateKey(range.end)}`);
  const share = Math.max(0.05, Math.min(1, (Math.min(range.end.getTime(), today.getTime()) - range.start.getTime()) / (365 * 86400000)));
  const base: Record<ComplicationType, number> = { redness: 150, blister: 26, hyper: 34, hypo: 9, allergy: 12, bruise: 52, infection: 3 };
  const out = {} as Record<ComplicationType, Record<Severity, number>>;
  for (const type of COMPLICATION_TYPES) {
    const total = Math.round(base[type] * share * (0.7 + r() * 0.6));
    const severe = type === 'infection' || type === 'allergy' ? Math.min(total, r() < 0.45 ? 1 : 0) : 0;
    const moderate = Math.min(total - severe, Math.round(total * (0.15 + r() * 0.2)));
    out[type] = { light: total - severe - moderate, moderate, severe };
  }
  return out;
}

export type Qualizorg = {
  locationId: LocationId;
  score: number;
  nps: number;
  responses: number;
  invited: number;
  /** How many answers gave a 6, 7, 8, 9 or 10. */
  spread: number[];
};

export function qualizorg(range: Range): Qualizorg[] {
  return LOCATIONS.map((l) => {
    const r = rng(`pk-quality-${l.id}-${dateKey(range.start)}`);
    const months = range.buckets[0].kind === 'month' ? 12 : range.buckets.length / 4.3;
    const invited = Math.round((l.id === 'nijmegen' ? 120 : 62) * months * (0.9 + r() * 0.2));
    const responses = Math.round(invited * (0.34 + r() * 0.1));
    // Uden answers a little more reservedly than Nijmegen.
    const shares = l.id === 'nijmegen' ? [0.02, 0.05, 0.19, 0.38, 0.36] : [0.03, 0.08, 0.26, 0.36, 0.27];
    const spread = shares.map((p) => Math.round(responses * p * (0.85 + r() * 0.3)));
    const total = spread.reduce((a, b) => a + b, 0) || 1;
    const score = spread.reduce((s, n, i) => s + n * (6 + i), 0) / total;
    const promoters = (spread[3] + spread[4]) / total;
    const detractors = (spread[0] + spread[1]) / total;
    return { locationId: l.id, score, nps: Math.round((promoters - detractors) * 100), responses: total, invited, spread };
  });
}

export const QUALITY_COMMENTS = [
  { key: 'c1', locationId: 'nijmegen', score: 10, back: 2 },
  { key: 'c2', locationId: 'uden', score: 9, back: 3 },
  { key: 'c3', locationId: 'nijmegen', score: 8, back: 5 },
  { key: 'c4', locationId: 'nijmegen', score: 9, back: 6 },
  { key: 'c5', locationId: 'uden', score: 7, back: 9 },
  { key: 'c6', locationId: 'nijmegen', score: 10, back: 11 },
] as const;

/** Injectable skin treatments given together with the partner doctor; their revenue is shared. */
export const PARTNER_TREATMENTS: TreatmentId[] = ['skinbooster', 'pdrn', 'exosomes'];

/**
 * Per month of this year up to now: the partner treatments given and their revenue, from their share of the real
 * diary of the last weeks applied to each month's revenue.
 */
export function partnerMonths(today: Date): { month: Date; count: number; revenue: number }[] {
  const { list } = realisedSample(addDays(startOfDay(today), -EXACT_BACK), addDays(startOfDay(today), 1), today);
  const partner = list.filter((a) => PARTNER_TREATMENTS.includes(a.treatment.id));
  const share = sumPrice(list) ? sumPrice(partner) / sumPrice(list) : 0;
  const price = partner.length ? sumPrice(partner) / partner.length : 300;
  const out: { month: Date; count: number; revenue: number }[] = [];
  for (let m = new Date(today.getFullYear(), 0, 1); m <= today; m = addMonths(m, 1)) {
    const revenue = Math.round(realisedTotal(m, addMonths(m, 1), today) * share);
    out.push({ month: m, count: Math.round(revenue / price), revenue });
  }
  return out.reverse();
}

/** A fixed seed for small things such as the export file's date stamp. */
export const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Ages for the list builder's range: whole years, 16 to 90. */
export const clampAge = (n: number) => Math.max(16, Math.min(90, Math.round(n) || 16));
