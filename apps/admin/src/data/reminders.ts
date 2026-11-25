import { dateKey } from '@pure-clinics/shared';
import { useMemo, useSyncExternalStore } from 'react';

import { clinicViewDay } from './clinics';
import { courseState, type Course } from './courses';
import { happenedBy, liveDay, type LiveDay } from './live';

// The clients in a series and the reminders sent to them, shared by the overview card and the full page of treatment
// plans (…/#trajecten): a reminder sent on one shows as sent on the other, and in the overview's live feed.

/** The day's stream, worked out once per day, so both pages see the very same clients and dates. */
const days = new Map<string, LiveDay>();
export function todayLive(now: Date): LiveDay {
  const key = dateKey(now);
  let day = days.get(key);
  if (!day) {
    day = liveDay(clinicViewDay(now), now);
    days.set(key, day);
  }
  return day;
}

/** One press of Remind or Remind all: who got a reminder, and when. */
export type ReminderBatch = { id: string; at: Date; day: string; courses: Course[] };

let batches: ReminderBatch[] = [];
const listeners = new Set<() => void>();
let nextId = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Every reminder sent so far, newest first. */
export function useReminderBatches(): ReminderBatch[] {
  return useSyncExternalStore(subscribe, () => batches);
}

/**
 * Sends reminders to the clients among `ids` who are due or late and have not had one yet; in the demo nothing really
 * goes out. Returns the clients reminded, so the caller can say how many.
 */
export function sendReminders(courses: Course[], ids: string[], now: Date): Course[] {
  const picked = courses.filter((c) => ids.includes(c.id) && !c.reminded && ['due', 'late'].includes(courseState(c, now)));
  if (!picked.length) return picked;
  batches = [{ id: `reminders-${++nextId}`, at: new Date(now), day: dateKey(now), courses: picked }, ...batches];
  listeners.forEach((listener) => listener());
  return picked;
}

/**
 * The day's clients in a series as they stand now: the next session once it is booked (in the diary already, or
 * booked during the day so far) and the reminder once it went out.
 */
export function useCourses(now: Date, live: LiveDay = todayLive(now)): Course[] {
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
