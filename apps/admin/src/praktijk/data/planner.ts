import { addDays, openingHours, sameDay, startOfDay, treatmentById, type LocationId, type SpecialistId, type TreatmentId } from '@pure-clinics/shared';

import {
  atMinutes,
  baseDay,
  blocksOn,
  dayAppts,
  excepted,
  minutesOf,
  partOf,
  reservations,
  type AgAppt,
  type AgendaState,
  type EquipmentState,
  type Exception,
  type Part,
} from './agenda';
import { AGENDAS, STAFF, type EquipmentId } from './core';

// The planner of SkinAdmin's "planagenda": it searches every agenda for moments that suit the client's preferences, with
// the practitioner free and, on a strict agenda, the machine too. Options say how they sit against existing appointments.

export type PlanItem = { treatment: TreatmentId; minutes: number };

export type PlanQuery = {
  location: LocationId;
  practitioner: SpecialistId | 'all';
  items: PlanItem[];
  /** Weekday (Date#getDay) → the parts of the day the client can come; null when a fixed date is asked. */
  parts: Record<number, Part[]> | null;
  date: Date | null;
  from: Date;
  days: number;
};

/** How an option sits in the agenda: floating, right before or right after an appointment, or filling a gap exactly. */
export type Pos = 'float' | 'before' | 'fill' | 'after';

export type PlanOption = {
  id: string;
  day: Date;
  start: Date;
  end: Date;
  staff: SpecialistId;
  room: number;
  /** The machine per treatment; null when the treatment needs none. */
  machines: (EquipmentId | null)[];
  /** The machine is already reserved then (only shown on agendas that are not strict). */
  clash: boolean;
  pos: Pos;
};

export const roomOf = (id: SpecialistId) => (AGENDAS.find((a) => a.id === id)?.index ?? 0) + 1;

type Interval = { s: number; e: number };

export function planOptions(
  q: PlanQuery,
  state: AgendaState,
  equipment: EquipmentState[],
  exceptions: Exception[],
  strict: SpecialistId[],
): { options: PlanOption[]; excluded: number } {
  const total = q.items.reduce((sum, i) => sum + i.minutes, 0);
  const categories = q.items.map((i) => treatmentById(i.treatment).category);
  const options: PlanOption[] = [];
  let excluded = 0;
  if (!q.items.length || total <= 0) return { options, excluded };

  for (let offset = 0; offset < q.days; offset++) {
    const day = addDays(startOfDay(q.from), offset);
    if (q.date && !sameDay(day, q.date)) continue;
    const hours = openingHours(day, q.location);
    if (!hours) continue;
    const team = STAFF.filter(
      (s) =>
        s.locationId === q.location &&
        s.role !== 'reception' &&
        categories.every((c) => s.categories.includes(c)) &&
        s.days.includes(day.getDay()) &&
        !excepted(s.id, day, exceptions) &&
        (q.practitioner === 'all' || q.practitioner === s.id),
    );
    if (!team.length) continue;
    const appts = dayAppts(day, state);
    const blocks = blocksOn(day, state.rules);
    const held = reservations(appts, equipment, day, exceptions);
    const machineBusy = (id: EquipmentId, s: number, e: number) =>
      appts.some((a) => held.get(a.id)?.machine === id && minutesOf(a.start) < e && minutesOf(a.end) > s);
    const earliest = sameDay(day, q.from) ? Math.ceil((minutesOf(q.from) + 30) / 15) * 15 : hours.open * 60;

    for (const s of team) {
      const busy: Interval[] = [
        ...appts.filter((a) => a.col === s.id).map((a) => ({ s: minutesOf(a.start), e: minutesOf(a.end) })),
        ...blocks.filter((b) => b.col === s.id).map((b) => ({ s: minutesOf(b.start), e: minutesOf(b.end) })),
      ].sort((a, b) => a.s - b.s);
      const apptEdges = new Set(appts.filter((a) => a.col === s.id).flatMap((a) => [`s${minutesOf(a.start)}`, `e${minutesOf(a.end)}`]));

      // Free gaps between the start of the day (or now), the appointments and closing time.
      const gaps: Interval[] = [];
      let cursor = hours.open * 60;
      for (const b of busy) {
        if (b.s > cursor) gaps.push({ s: cursor, e: b.s });
        cursor = Math.max(cursor, b.e);
      }
      if (cursor < hours.close * 60) gaps.push({ s: cursor, e: hours.close * 60 });

      for (const gap of gaps) {
        const gs = Math.max(gap.s, earliest);
        const ge = gap.e;
        if (ge - gs < total) continue;
        const afterAppt = gs === gap.s && apptEdges.has(`e${gs}`);
        const beforeAppt = apptEdges.has(`s${ge}`);
        const starts = [...new Set([gs, ge - total])];
        for (const start of starts) {
          const end = start + total;
          const part = partOf(start);
          if (q.parts && !(q.parts[day.getDay()] ?? []).includes(part)) continue;
          const pos: Pos =
            start === gs && end === ge && (afterAppt || beforeAppt) ? 'fill' : end === ge && beforeAppt ? 'before' : start === gs && afterAppt ? 'after' : 'float';

          // A machine per treatment, in the order they are given.
          let at = start;
          let clash = false;
          let unavailable = false;
          const machines = q.items.map((item) => {
            const from = at;
            at += item.minutes;
            const kinds = equipment.filter((m) => m.locationId === q.location && m.treatments.includes(item.treatment));
            if (!kinds.length) return null;
            const usable = kinds.filter((m) => !m.maintenance && !excepted(m.id, day, exceptions));
            if (!usable.length) {
              unavailable = true;
              return kinds[0].id;
            }
            const free = usable.find((m) => !machineBusy(m.id, from, at));
            if (!free) clash = true;
            return (free ?? usable[0]).id;
          });
          if (unavailable || (clash && strict.includes(s.id as SpecialistId))) {
            excluded++;
            continue;
          }
          options.push({
            id: `${day.getTime()}-${s.id}-${start}`,
            day,
            start: atMinutes(day, start),
            end: atMinutes(day, end),
            staff: s.id as SpecialistId,
            room: roomOf(s.id as SpecialistId),
            machines,
            clash,
            pos,
          });
        }
      }
    }
  }
  return { options, excluded };
}

/** Upcoming appointments that hold a machine, as examples for rescheduling. */
export function machineAppointments(today: Date, location: LocationId, equipment: EquipmentState[], exceptions: Exception[], count = 3): { id: string; day: Date }[] {
  const out: { id: string; day: Date }[] = [];
  for (let offset = 1; offset < 14 && out.length < count; offset++) {
    const day = addDays(today, offset);
    const list = baseDay(day).filter((a) => a.clinic === location);
    const held = reservations(list, equipment, day, exceptions);
    const pick = list.find((a, i) => i % 3 === offset % 3 && held.get(a.id)?.machine);
    if (pick) out.push({ id: pick.id, day });
  }
  return out;
}

export const findAppt = (id: string, day: Date, state: AgendaState): AgAppt | undefined => dayAppts(day, state).find((a) => a.id === id);
