import { addDays, dateKey, LOCATIONS, sameDay, startOfDay, type LocationId } from '@pure-clinics/shared';

import { dayAppts, onlineBookings, type AgAppt, type AgendaState } from '../praktijk/data/agenda';
import { clinicDay, ROOMS, type Appt } from './clinics';
import { courseState, coursesOn, type Course } from './courses';
import { between, pick, rng } from './random';
import { clinicOfOrder, type Order } from './shop';

/** Something that happens at a set moment of the day; the overview plays these as the clock runs. */
export type LiveEvent =
  /** Booked online today, for today or a later day, as the agenda's list of online bookings has it. */
  | { id: string; at: Date; kind: 'booking'; appt: Appt }
  /** Paid at the desk when the treatment ends. */
  | { id: string; at: Date; kind: 'payment'; appt: Appt }
  /** The intake form for a later appointment came in. */
  | { id: string; at: Date; kind: 'intake'; appt: Appt }
  /** The reminder for a later appointment went out. */
  | { id: string; at: Date; kind: 'reminder'; appt: Appt }
  | { id: string; at: Date; kind: 'order'; order: Order }
  /** A client in a series booked her next session. */
  | { id: string; at: Date; kind: 'course'; course: Course; planned: Date }
  | { id: string; at: Date; kind: 'member'; client: string };

export type LiveDay = {
  /** The day the clinics show: today, or Monday while both clinics are closed on Sunday. */
  day: Date;
  /** Every appointment of that day, as Kliniek's agenda has it. */
  appts: Appt[];
  /** Today's webshop orders, all day. */
  orders: Order[];
  courses: Course[];
  /** Everything that happens today, in time order. */
  events: LiveEvent[];
};

const at = (day: Date, minutes: number) => new Date(startOfDay(day).getTime() + Math.round(minutes) * 60000);
const minuteOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

/**
 * What Huidly holds for the day (Huidly's api/src/functions/agenda.js): the agenda as the team changed it in Kliniek
 * and, in the business's own admin, the real webshop orders and the clients who joined the app. Without it nothing is
 * shown, so no screen can tell a day of its own.
 */
export type DayChanges = { agenda: AgendaState; orders: Order[]; joined: { name: string; at: Date }[] };

/** No changes: the diary as it is, for the demo accounts on this computer and for screens that only need the series. */
export const NO_CHANGES: DayChanges = {
  agenda: { moved: {}, deleted: [], added: [], notes: {}, confirmed: [], reports: {}, rules: [], waitPlanned: [] },
  orders: [],
  joined: [],
};

/** An appointment of Kliniek's agenda in its specialist's room; null in a column without a room (the front desk). */
export function asAppt(a: AgAppt, firstVisit = false): Appt | null {
  const room = ROOMS[a.clinic].findIndex((s) => s.id === a.col);
  if (room < 0) return null;
  return { id: a.id, clinic: a.clinic, room, specialist: ROOMS[a.clinic][room], treatment: a.treatment, client: a.client, start: a.start, end: a.end, price: a.price, firstVisit };
}

/** A day's appointments as Kliniek's agenda shows them: the diary with every move, deletion and new appointment. */
export function diaryOn(day: Date, agenda: AgendaState): Appt[] {
  const first = new Map(clinicDay(day).map((a) => [a.id, a.firstVisit]));
  return dayAppts(day, agenda).flatMap((a) => asAppt(a, first.get(a.id) ?? false) ?? []);
}

export const ordersOn = (orders: Order[], day: Date) => orders.filter((o) => sameDay(o.at, day));

/**
 * Today as a stream of events, the same on every load and on every screen: every treatment is paid at the desk when it
 * ends, intake forms and reminders go out ahead of appointments, online bookings come in as the agenda's list of online
 * bookings has them, webshop orders and new members as Huidly has them, and clients in a series book their next session.
 */
export function liveDay(day: Date, today: Date, changes: DayChanges): LiveDay {
  const r = rng(`live-${dateKey(today)}`);
  const isToday = sameDay(day, today);
  const appts = diaryOn(day, changes.agenda);
  const orders = ordersOn(changes.orders, today);
  const courses = coursesOn(today);
  const events: LiveEvent[] = [];
  const DAY_START = 7 * 60;

  if (isToday) {
    for (const appt of appts) {
      const start = minuteOf(appt.start);
      // The free intake costs nothing, so there is nothing to pay.
      if (appt.price > 0) events.push({ id: `payment-${appt.id}`, at: appt.end, kind: 'payment', appt });
      if ((appt.firstVisit || appt.treatment.id === 'consult') && start - 40 > DAY_START && r() < 0.7) {
        events.push({ id: `intake-${appt.id}`, at: at(day, between(r, DAY_START, start - 40)), kind: 'intake', appt });
      } else if (start - 150 > DAY_START && r() < 0.18) {
        events.push({ id: `reminder-${appt.id}`, at: at(day, start - between(r, 120, 180)), kind: 'reminder', appt });
      }
    }
  }

  // Booked online today, for today or a later day; a moved one shows where it is now.
  for (const b of onlineBookings(today, at(today, 24 * 60 - 1), changes.agenda)) {
    if (!sameDay(b.bookedAt, today) || b.changed === 'deleted') continue;
    const m = changes.agenda.moved[b.appt.id];
    const now = m ? { ...b.appt, col: m.col, start: new Date(m.start), end: new Date(m.start + b.appt.end.getTime() - b.appt.start.getTime()) } : b.appt;
    const appt = asAppt(now);
    if (appt) events.push({ id: `booking-${b.appt.id}`, at: b.bookedAt, kind: 'booking', appt });
  }

  for (const order of orders) events.push({ id: `order-${order.id}`, at: order.at, kind: 'order', order });

  // A handful of clients who are due book their next session, spread over the day: drawn on their own, so they stay the
  // same whatever changes in the agenda.
  const cr = rng(`live-courses-${dateKey(today)}`);
  const due = courses.filter((c) => {
    const state = courseState(c, today);
    return state === 'due' || state === 'late';
  });
  for (const course of due.slice(0, between(cr, 4, 7))) {
    const planned = addDays(startOfDay(today), between(cr, 2, 12));
    planned.setHours(pick(cr, [9, 10, 11, 13, 14, 15, 16, 18]), pick(cr, [0, 15, 30, 45]), 0, 0);
    events.push({ id: `course-${course.id}`, at: at(today, between(cr, 8 * 60, 21 * 60)), kind: 'course', course, planned });
  }
  changes.joined.forEach((j, i) => {
    if (sameDay(j.at, today)) events.push({ id: `member-${i}-${j.at.getTime()}`, at: j.at, kind: 'member', client: j.name });
  });

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { day, appts, orders, courses, events };
}

/** What happened up to now. */
export const happenedBy = (events: LiveEvent[], now: Date) => events.filter((e) => e.at.getTime() <= now.getTime());

/** The diary as it stands now: online bookings appear once they are made. */
export const diaryAt = (appts: Appt[], now: Date) => appts.filter((a) => !a.bookedAt || a.bookedAt.getTime() <= now.getTime());

/** Treatments are paid at the desk when they end. */
export const paidBy = (appts: Appt[], now: Date) => appts.filter((a) => a.end.getTime() <= now.getTime());

export const sum = <T>(items: T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);

/** One clinic on one day: treatments paid, webshop sales near it, and treatments still booked to come. */
export type ClinicSales = { treatments: number; webshop: number; booked: number };
export type DaySales = { date: Date; clinics: ClinicSales[] };

function salesOf(appts: Appt[], orders: Order[], booked: Appt[]): ClinicSales[] {
  return LOCATIONS.map((l) => ({
    treatments: sum(
      appts.filter((a) => a.clinic === l.id),
      (a) => a.price,
    ),
    webshop: sum(
      orders.filter((o) => clinicOfOrder(o) === l.id),
      (o) => o.total,
    ),
    booked: sum(
      booked.filter((a) => a.clinic === l.id),
      (a) => a.price,
    ),
  }));
}

/** The days of this week other than today: earlier days as they ended, later days with what is booked so far. */
export function weekFrame(today: Date, changes: DayChanges): DaySales[] {
  const monday = addDays(startOfDay(today), -((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    if (sameDay(date, today)) return { date, clinics: LOCATIONS.map(() => ({ treatments: 0, webshop: 0, booked: 0 })) };
    const appts = diaryOn(date, changes.agenda);
    if (date.getTime() < today.getTime()) return { date, clinics: salesOf(appts, ordersOn(changes.orders, date), []) };
    return { date, clinics: salesOf([], [], appts) };
  });
}

/** This week with today filled in up to now: paid so far, sold online so far, and what is still booked today. */
export function weekSales(frame: DaySales[], live: LiveDay, now: Date): DaySales[] {
  return frame.map((day) => {
    if (!sameDay(day.date, now)) return day;
    const isClinicDay = sameDay(live.day, now);
    const diary = isClinicDay ? diaryAt(live.appts, now) : [];
    const paid = paidBy(diary, now);
    const open = diary.filter((a) => a.end.getTime() > now.getTime());
    return { date: day.date, clinics: salesOf(paid, live.orders.filter((o) => o.at.getTime() <= now.getTime()), open) };
  });
}

/** Revenue on an earlier day up to the same time of day: treatments paid by then and webshop orders by then. */
export function revenueAt(appts: Appt[], orders: Order[], time: Date): number {
  const cut = minuteOf(time);
  return (
    sum(
      appts.filter((a) => minuteOf(a.end) <= cut),
      (a) => a.price,
    ) +
    sum(
      orders.filter((o) => minuteOf(o.at) <= cut),
      (o) => o.total,
    )
  );
}

export const clinicIndex = (id: LocationId) => LOCATIONS.findIndex((l) => l.id === id);
