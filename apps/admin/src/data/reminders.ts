import { dateKey } from '@pure-clinics/shared';
import { useMemo } from 'react';

import { clinicViewDay } from './clinics';
import { courseState, type Course } from './courses';
import { happenedBy, liveDay, type DayChanges, type LiveDay } from './live';
import { sharedGet, sharedSet, useSharedValue } from './sharedStore';

// The clients in a series and the reminders sent to them, shared by the overview card and the full page of treatment
// plans (…/#trajecten): a reminder sent on one shows as sent on the other, and in the overview's live feed. The
// reminders are kept at Huidly ("reminders" in data/sharedStore.ts), so Kliniek's "Mijn dag" and the business's own
// admin show the same ones, also after a reload.

/**
 * The day's stream, worked out once per day and again when Huidly has something new, so every page sees the very same
 * clients and dates.
 */
const days = new Map<string, { changes: DayChanges; day: LiveDay }>();
export function todayLive(now: Date, changes: DayChanges): LiveDay {
  const key = dateKey(now);
  let known = days.get(key);
  if (!known || known.changes !== changes) {
    known = { changes, day: liveDay(clinicViewDay(now), now, changes) };
    days.set(key, known);
  }
  return known.day;
}

/** One press of Remind or Remind all: who got a reminder, and when. */
export type ReminderBatch = { id: string; at: Date; day: string; courses: Course[] };

const NONE: ReminderBatch[] = [];
/** Enough for weeks of reminders; older ones no longer change what a page shows. */
const KEEP = 300;

/** Every reminder sent so far, newest first. */
export function useReminderBatches(): ReminderBatch[] {
  return useSharedValue<ReminderBatch[]>('reminders') ?? NONE;
}

/**
 * Sends reminders to the clients among `ids` who are due or late and have not had one yet; in the demo nothing really
 * goes out. Returns the clients reminded, so the caller can say how many.
 */
export function sendReminders(courses: Course[], ids: string[], now: Date): Course[] {
  const picked = courses.filter((c) => ids.includes(c.id) && !c.reminded && ['due', 'late'].includes(courseState(c, now)));
  if (!picked.length) return picked;
  const batch: ReminderBatch = { id: `reminders-${Date.now().toString(36)}`, at: new Date(now), day: dateKey(now), courses: picked };
  sharedSet('reminders', [batch, ...(sharedGet<ReminderBatch[]>('reminders') ?? [])].slice(0, KEEP));
  return picked;
}

/**
 * The day's clients in a series as they stand now: the next session once it is booked (in the diary already, or
 * booked during the day so far) and the reminder once it went out.
 */
export function useCourses(now: Date, live: LiveDay): Course[] {
  const sent = useReminderBatches();
  const key = dateKey(now);
  const booked = happenedBy(live.events, now);
  const plannedKey = booked.filter((e) => e.kind === 'course').length;
  return useMemo(() => {
    const planned = new Map<string, Date>();
    for (const e of booked) if (e.kind === 'course') planned.set(e.course.id, e.planned);
    const reminded = new Map<string, Date>();
    for (const b of sent) if (b.day === key) for (const c of b.courses) if (!reminded.has(c.id)) reminded.set(c.id, b.at);
    return live.courses.map((c) => ({ ...c, planned: c.planned ?? planned.get(c.id) ?? null, reminded: reminded.get(c.id) ?? null }));
    // The bookings only change when another one has happened; `booked` itself is a new list on every tick.
  }, [live, plannedKey, sent, key]);
}
