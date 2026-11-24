import { addDays, LOCATIONS, openingHours, startOfDay, type LocationId } from '@pure-clinics/shared';

import { memberSince } from '../data/clients';
import { practiceClients } from '../data/core';
import { apptsOn, dayRevenue, occupancyWeek, weekStartOf } from '../data/reports';

// The numbers of the Overzicht, all derived from the module's own seeded test world (data/*.ts), so they agree with
// what the other screens show: the same diary, the same clients, the same revenue curve.

/** Days the clinics are open, Monday to Saturday, and the hours the busy map covers (the earliest opening to the latest close). */
export const HEAT_DAYS = [1, 2, 3, 4, 5, 6] as const;
export const HEAT_FROM = 8;
export const HEAT_TO = 21;
/** How many weeks back the busy map averages over. */
export const HEAT_WEEKS = 8;

export type HeatCell = {
  /** Date#getDay() of the row. */
  weekday: number;
  /** Start of the hour. */
  hour: number;
  /** Treatments in progress, on average, in this hour on this weekday. */
  value: number;
  /** Whether the clinic (or one of them) is open in this hour at all. */
  open: boolean;
};

const heatCache = new Map<string, HeatCell[]>();

/**
 * When it is busy: for every weekday and hour, how many treatments run at the same time on average over the last
 * eight weeks, for one location or both together. Minutes are counted, so a treatment of half an hour adds 0.5.
 */
export function busyMap(today: Date, location: LocationId | 'all'): HeatCell[] {
  const key = `${today.toDateString()}|${location}`;
  const hit = heatCache.get(key);
  if (hit) return hit;
  const sums = new Map<string, number>();
  const counts = new Map<number, number>();
  const openHours = new Set<string>();
  const start = addDays(startOfDay(today), -HEAT_WEEKS * 7);
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const day = addDays(start, i);
    const weekday = day.getDay();
    if (weekday === 0) continue;
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
    for (const l of LOCATIONS) {
      if (location !== 'all' && l.id !== location) continue;
      const hours = openingHours(day, l.id);
      if (!hours) continue;
      for (let h = Math.floor(hours.open); h < Math.ceil(hours.close); h++) openHours.add(`${weekday}-${h}`);
    }
    for (const a of apptsOn(day)) {
      if (location !== 'all' && a.clinic !== location) continue;
      for (let h = HEAT_FROM; h < HEAT_TO; h++) {
        const from = new Date(day).setHours(h, 0, 0, 0);
        const to = from + 3600000;
        const overlap = Math.max(0, Math.min(to, a.end.getTime()) - Math.max(from, a.start.getTime()));
        if (overlap > 0) sums.set(`${weekday}-${h}`, (sums.get(`${weekday}-${h}`) ?? 0) + overlap / 3600000);
      }
    }
  }
  const out: HeatCell[] = [];
  for (const weekday of HEAT_DAYS) {
    for (let hour = HEAT_FROM; hour < HEAT_TO; hour++) {
      const k = `${weekday}-${hour}`;
      out.push({ weekday, hour, value: (sums.get(k) ?? 0) / Math.max(1, counts.get(weekday) ?? 1), open: openHours.has(k) });
    }
  }
  heatCache.set(key, out);
  return out;
}

/** Revenue per day for the last `days` days, both locations together (for sparklines). */
export function dailyRevenue(today: Date, days: number): number[] {
  return Array.from({ length: days }, (_, i) => {
    const r = dayRevenue(addDays(startOfDay(today), i - days + 1), today);
    return r.nijmegen + r.uden;
  });
}

/** Revenue per week for the last `weeks` weeks, Monday to Sunday, the current week up to today. */
export function weeklyRevenue(today: Date, weeks: number): number[] {
  const thisWeek = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, (i - weeks + 1) * 7);
    let sum = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, d);
      if (day > today) break;
      const r = dayRevenue(day, today);
      sum += r.nijmegen + r.uden;
    }
    return sum;
  });
}

/** Treatments per day for the last `days` days (today included). */
export function dailyTreatments(today: Date, days: number): number[] {
  return Array.from({ length: days }, (_, i) => apptsOn(addDays(startOfDay(today), i - days + 1)).length);
}

/** Average occupancy of all agendas in a week, 0..1; days off are left out. */
export function weekOccupancy(weekStart: Date): number {
  const cells = Object.values(occupancyWeek(weekStart)).flat().filter((c) => c.value !== null);
  const open = cells.reduce((s, c) => s + c.open, 0);
  return open ? cells.reduce((s, c) => s + c.minutes, 0) / open : 0;
}

/** The occupancy of the last `weeks` weeks, oldest first, the current week last. */
export function occupancyTrend(today: Date, weeks: number): number[] {
  const thisWeek = weekStartOf(today);
  return Array.from({ length: weeks }, (_, i) => weekOccupancy(addDays(thisWeek, (i - weeks + 1) * 7)));
}

/** New clients per week over the last `weeks` weeks, and how many in the last 28 days. */
export function newClients(today: Date, weeks: number): { perWeek: number[]; last28: number } {
  const since = practiceClients(today).map((c) => memberSince(c, today).getTime());
  const day = 86400000;
  const end = startOfDay(today).getTime() + day;
  const perWeek = Array.from({ length: weeks }, (_, i) => {
    const to = end - (weeks - 1 - i) * 7 * day;
    const from = to - 7 * day;
    return since.filter((t) => t >= from && t < to).length;
  });
  return { perWeek, last28: since.filter((t) => t >= end - 28 * day).length };
}

/** Change between two numbers as a share (0.08 = +8 %), or null when there is nothing to compare with. */
export const change = (now: number, before: number) => (before > 0 ? now / before - 1 : null);
