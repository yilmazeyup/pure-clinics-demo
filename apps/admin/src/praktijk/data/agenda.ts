import {
  addDays,
  dateKey,
  openingHours,
  sameDay,
  startOfDay,
  type LocationId,
  type Treatment,
  type TreatmentId,
} from '@pure-clinics/shared';

import type { Appt } from '../../data/clinics';
import { between, pick, rng } from '../../data/random';
import type { MessageKey } from '../../i18n';
import {
  AGENDAS,
  agendaDay,
  clientFor,
  conditionById,
  EQUIPMENT,
  practiceClients,
  STAFF,
  staffById,
  type Equipment,
  type EquipmentId,
  type PracticeClient,
  type Staff,
  type StaffId,
} from './core';

// The agenda of Pure Praktijk: the overview's own diary (clinicDay, through agendaDay) plus what the team changes in the
// module: moves, deletions, new appointments, confirmations, notes and blocks without a client. Those changes live in
// useShared('agenda', …) so the Agenda and the Planner show the same day.

/** An appointment as the module shows it; `col` is the agenda (room) id, which is also its specialist's id. */
export type AgAppt = {
  id: string;
  clinic: LocationId;
  col: StaffId;
  treatment: Treatment;
  client: string;
  start: Date;
  end: Date;
  price: number;
  online: boolean;
  /** A note the clinic wrote when booking, kept as a key so it follows the language. */
  noteKey: MessageKey | null;
  /** True for appointments made in the module (booking, planner, waiting list). */
  added?: boolean;
};

export type Repeat = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
export const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'biweekly', 'monthly'];

export type BlockKind = 'meeting' | 'break' | 'maintenance' | 'admin' | 'training' | 'desk';
export const BLOCK_KINDS: BlockKind[] = ['meeting', 'break', 'maintenance', 'admin', 'training', 'desk'];

/** A block without a client, once or on a repeat pattern; `skip` holds days taken out of the series. */
export type BlockRule = {
  id: string;
  kind: BlockKind | null;
  /** Free text when the kind is not one of the standard ones. */
  title: string;
  col: StaffId;
  clinic: LocationId;
  first: Date;
  /** Minutes after midnight. */
  from: number;
  to: number;
  repeat: Repeat;
  until: Date | null;
  skip: string[];
};

export type BlockItem = { id: string; rule: BlockRule; col: StaffId; clinic: LocationId; start: Date; end: Date };

export type AgendaState = {
  moved: Record<string, { start: number; col: StaffId }>;
  deleted: string[];
  added: AgAppt[];
  /** Notes typed in the module; an empty string removes the note. */
  notes: Record<string, string>;
  confirmed: string[];
  /** Reports switched by hand: filled (true) or empty (false). */
  reports: Record<string, boolean>;
  rules: BlockRule[];
  /** Clients from the waiting list who got a slot. */
  waitPlanned: string[];
};

const NOTE_KEYS: MessageKey[] = [
  'pk.agenda.notes.quiet',
  'pk.agenda.notes.patch',
  'pk.agenda.notes.late',
  'pk.agenda.notes.latex',
  'pk.agenda.notes.photo',
  'pk.agenda.notes.gift',
];

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const atMinutes = (day: Date, minutes: number) => {
  const d = startOfDay(day);
  d.setMinutes(minutes);
  return d;
};

/** Reception's own blocks, so her column in the staff view is not empty. */
export function seedAgenda(today: Date): AgendaState {
  const first = addDays(today, -90);
  return {
    moved: {},
    deleted: [],
    added: [],
    notes: {},
    confirmed: [],
    reports: {},
    rules: [
      { id: 'r-husna-desk', kind: 'desk', title: '', col: 'husna', clinic: 'nijmegen', first, from: 9 * 60, to: 12 * 60 + 30, repeat: 'daily', until: null, skip: [] },
      { id: 'r-husna-break', kind: 'break', title: '', col: 'husna', clinic: 'nijmegen', first, from: 12 * 60 + 30, to: 13 * 60, repeat: 'daily', until: null, skip: [] },
      { id: 'r-husna-admin', kind: 'admin', title: '', col: 'husna', clinic: 'nijmegen', first: addDays(first, (5 - first.getDay() + 7) % 7), from: 15 * 60, to: 16 * 60 + 30, repeat: 'weekly', until: null, skip: [] },
      { id: 'r-husna-meeting', kind: 'meeting', title: '', col: 'husna', clinic: 'nijmegen', first: addDays(first, (3 - first.getDay() + 7) % 7), from: 13 * 60 + 30, to: 14 * 60 + 30, repeat: 'biweekly', until: null, skip: [] },
    ],
    waitPlanned: [],
  };
}

const baseCache = new Map<string, AgAppt[]>();

/** The overview's diary of a day, as module appointments; some were booked online, a few carry a note. */
export function baseDay(day: Date): AgAppt[] {
  const key = dateKey(day);
  const known = baseCache.get(key);
  if (known) return known;
  const list = agendaDay(day).map((a: Appt): AgAppt => {
    const r = rng(`pk-ag-${a.id}`);
    return {
      id: a.id,
      clinic: a.clinic,
      col: a.specialist.id,
      treatment: a.treatment,
      client: a.client,
      start: a.start,
      end: a.end,
      price: a.price,
      online: r() < 0.24,
      noteKey: r() < 0.1 ? pick(r, NOTE_KEYS) : null,
    };
  });
  baseCache.set(key, list);
  return list;
}

/** The appointments of a day with every change of the module applied. */
export function dayAppts(day: Date, state: AgendaState): AgAppt[] {
  const gone = new Set(state.deleted);
  const out: AgAppt[] = [];
  for (const a of baseDay(day)) {
    if (gone.has(a.id)) continue;
    const m = state.moved[a.id];
    if (m) {
      const start = new Date(m.start);
      out.push({ ...a, col: m.col, start, end: new Date(m.start + (a.end.getTime() - a.start.getTime())) });
    } else out.push(a);
  }
  for (const a of state.added) if (!gone.has(a.id) && sameDay(a.start, day)) out.push(a);
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Moves an appointment to a new start and column; new appointments are changed in place. */
export function moveAppt(state: AgendaState, a: AgAppt, start: Date, col: StaffId): AgendaState {
  if (a.added) {
    const length = a.end.getTime() - a.start.getTime();
    return {
      ...state,
      added: state.added.map((x) => (x.id === a.id ? { ...x, start, end: new Date(start.getTime() + length), col, clinic: staffById(col).locationId } : x)),
    };
  }
  return { ...state, moved: { ...state.moved, [a.id]: { start: start.getTime(), col } } };
}

/** Moves an appointment to another day: the original goes, a copy is made on the new day. */
export function rescheduleAppt(state: AgendaState, a: AgAppt, start: Date, col: StaffId, id = `${a.id}-v${Date.now() % 100000}`): AgendaState {
  if (sameDay(a.start, start)) return moveAppt(state, a, start, col);
  const length = a.end.getTime() - a.start.getTime();
  const copy: AgAppt = { ...a, id, start, end: new Date(start.getTime() + length), col, clinic: staffById(col).locationId, added: true };
  return {
    ...state,
    deleted: a.added ? state.deleted : [...state.deleted, a.id],
    added: [...state.added.filter((x) => x.id !== a.id), copy],
  };
}

/** Whether a block rule falls on a day. */
function ruleOn(rule: BlockRule, day: Date): boolean {
  const d = startOfDay(day);
  const first = startOfDay(rule.first);
  if (d < first) return false;
  if (rule.until && d > startOfDay(rule.until)) return false;
  if (rule.skip.includes(dateKey(d))) return false;
  const diff = Math.round((d.getTime() - first.getTime()) / 86400000);
  switch (rule.repeat) {
    case 'none':
      return diff === 0;
    case 'daily':
      return staffById(rule.col).days.includes(d.getDay()) && openingHours(d, rule.clinic) !== null;
    case 'weekly':
      return diff % 7 === 0;
    case 'biweekly':
      return diff % 14 === 0;
    case 'monthly':
      return d.getDate() === first.getDate();
  }
}

export function blocksOn(day: Date, rules: BlockRule[]): BlockItem[] {
  return rules
    .filter((r) => ruleOn(r, day))
    .map((rule) => ({ id: `${rule.id}@${dateKey(day)}`, rule, col: rule.col, clinic: rule.clinic, start: atMinutes(day, rule.from), end: atMinutes(day, rule.to) }));
}

/* ---------- Status ---------- */

export type ApptStatus = 'unconfirmed' | 'client' | 'insurer' | 'invoiced' | 'future';

/** Whether the client's episode for this treatment is billed to the insurer. */
export function insurerPays(a: AgAppt, today: Date): boolean {
  if (!a.treatment.insurable) return false;
  const client = clientFor(a.client, a.clinic, today);
  const episode =
    client.episodes.find((e) => e.treatment === a.treatment.id) ?? client.episodes.find((e) => conditionById(e.condition).treatments.includes(a.treatment.id));
  return episode?.billing === 'insurer';
}

const HOUR = 3600000;

/**
 * SkinAdmin's euro sign: unconfirmed up to an hour ahead (orange), confirmed and still to pay (red) or claimed from the
 * insurer (shield), and grey once invoiced, or while it is more than an hour away.
 */
export function statusOf(a: AgAppt, now: Date, state: AgendaState, today: Date): ApptStatus {
  const pay: ApptStatus = insurerPays(a, today) ? 'insurer' : 'client';
  const confirmed = state.confirmed.includes(a.id);
  const roll = rng(`pk-st-${a.id}`)();
  // Earlier days are fully handled; today a few treatments that just ended still wait for payment.
  if (a.end.getTime() <= now.getTime()) return !sameDay(a.start, now) || roll < 0.78 ? 'invoiced' : pay;
  if (a.start.getTime() <= now.getTime()) return confirmed || roll < 0.6 ? pay : 'unconfirmed';
  if (a.start.getTime() - now.getTime() <= HOUR) return confirmed ? pay : 'unconfirmed';
  return 'future';
}

/** Can be confirmed: it starts within the hour, has started or lies in the past. */
export const confirmable = (a: AgAppt, now: Date) => a.start.getTime() - now.getTime() <= HOUR;

export function reportFilled(a: AgAppt, now: Date, state: AgendaState): boolean {
  if (a.id in state.reports) return state.reports[a.id];
  if (a.end.getTime() > now.getTime()) return false;
  return rng(`pk-rep-${a.id}`)() < 0.84;
}

/* ---------- Columns ---------- */

export type Mode = 'room' | 'staff';
export type Column = { id: StaffId; clinic: LocationId; room: number | null; staff: Staff };

/** Room view: the six treatment rooms; staff view: everyone, with Husna at reception. */
export function columnsFor(mode: Mode, location: LocationId | 'all'): Column[] {
  if (mode === 'room')
    return AGENDAS.filter((a) => location === 'all' || a.locationId === location).map((a) => ({ id: a.id, clinic: a.locationId, room: a.index + 1, staff: a.staff }));
  return STAFF.filter((s) => location === 'all' || s.locationId === location).map((s) => ({ id: s.id, clinic: s.locationId, room: null, staff: s }));
}

/** Whether nothing else is in a column at that time. */
export function columnFree(col: StaffId, start: Date, end: Date, appts: AgAppt[], blocks: BlockItem[], ignore?: string): boolean {
  const s = start.getTime();
  const e = end.getTime();
  return (
    appts.every((a) => a.id === ignore || a.col !== col || a.end.getTime() <= s || a.start.getTime() >= e) &&
    blocks.every((b) => b.col !== col || b.end.getTime() <= s || b.start.getTime() >= e)
  );
}

/** Side-by-side lanes for items that overlap in one column. */
export function lanes<T extends { id: string; start: Date; end: Date }>(items: T[]): Map<string, { lane: number; of: number }> {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out = new Map<string, { lane: number; of: number }>();
  let group: T[] = [];
  let groupEnd = 0;
  const ends: number[] = [];
  const flush = () => {
    const of = Math.max(1, ends.length);
    for (const item of group) out.set(item.id, { lane: out.get(item.id)!.lane, of });
    group = [];
    ends.length = 0;
  };
  for (const item of sorted) {
    if (group.length && item.start.getTime() >= groupEnd) flush();
    let lane = ends.findIndex((end) => end <= item.start.getTime());
    if (lane < 0) {
      lane = ends.length;
      ends.push(item.end.getTime());
    } else ends[lane] = item.end.getTime();
    out.set(item.id, { lane, of: 1 });
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end.getTime());
  }
  if (group.length) flush();
  return out;
}

/* ---------- Online bookings ---------- */

export type OnlineBooking = { appt: AgAppt; bookedAt: Date; changed: 'moved' | 'deleted' | null };

/** Appointments clients booked themselves in the last 28 days, today included; newest first. */
export function onlineBookings(today: Date, now: Date, state: AgendaState): OnlineBooking[] {
  const from = addDays(startOfDay(today), -27);
  const out: OnlineBooking[] = [];
  for (let offset = -27; offset <= 35; offset++) {
    for (const a of baseDay(addDays(today, offset))) {
      if (!a.online) continue;
      const r = rng(`pk-onl-${a.id}`);
      const bookedAt = new Date(a.start.getTime() - between(r, 1, 21) * 86400000 - between(r, 0, 600) * 60000);
      if (bookedAt < from || bookedAt > now) continue;
      const roll = r();
      const changed = state.deleted.includes(a.id) ? 'deleted' : a.id in state.moved ? 'moved' : roll < 0.05 ? 'moved' : roll < 0.08 ? 'deleted' : null;
      out.push({ appt: a, bookedAt, changed });
    }
  }
  return out.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime());
}

/* ---------- Waiting list ---------- */

export type Part = 'morning' | 'afternoon' | 'evening';
export const partOf = (minutes: number): Part => (minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening');

export type Waiting = { client: PracticeClient; treatment: TreatmentId; part: Part; since: Date };

/** Six clients who would like to come sooner, each for the treatment of an open episode. */
export function waitingList(today: Date): Waiting[] {
  const r = rng('pk-wait');
  const pool = practiceClients(today).filter((c) => c.episodes.some((e) => !e.closed));
  const out: Waiting[] = [];
  const used = new Set<string>();
  while (out.length < 6 && used.size < pool.length) {
    const client = pick(r, pool);
    if (used.has(client.id)) continue;
    used.add(client.id);
    const episode = client.episodes.find((e) => !e.closed)!;
    out.push({ client, treatment: episode.treatment, part: pick(r, ['morning', 'afternoon', 'evening'] as const), since: addDays(today, -between(r, 2, 26)) });
  }
  return out;
}

/* ---------- Equipment ---------- */

export type EquipmentState = Equipment & { maintenance: boolean };
export const seedEquipment = (): EquipmentState[] => EQUIPMENT.map((e) => ({ ...e, maintenance: e.id === 'ipl-ud' }));

export type Exception = { id: string; who: StaffId | EquipmentId; kind: 'holiday' | 'course' | 'sick' | 'service'; from: Date; to: Date };

/** A holiday and a course in the coming weeks, so the planner visibly works around them. */
export function seedExceptions(today: Date): Exception[] {
  return [
    { id: 'x1', who: 'margot', kind: 'holiday', from: addDays(today, 6), to: addDays(today, 12) },
    { id: 'x2', who: 'nadila', kind: 'course', from: addDays(today, 4), to: addDays(today, 4) },
    { id: 'x3', who: 'tixel', kind: 'service', from: addDays(today, 3), to: addDays(today, 3) },
  ];
}

export const excepted = (who: string, day: Date, list: Exception[]) =>
  list.some((x) => x.who === who && startOfDay(day) >= startOfDay(x.from) && startOfDay(day) <= startOfDay(x.to));

/** Which machine each appointment of a day holds: the first free one at its location that gives the treatment. */
export function reservations(appts: AgAppt[], equipment: EquipmentState[], day: Date, exceptions: Exception[]): Map<string, { machine: EquipmentId | null; clash: boolean }> {
  const out = new Map<string, { machine: EquipmentId | null; clash: boolean }>();
  const busy = new Map<string, { s: number; e: number }[]>();
  for (const a of [...appts].sort((x, y) => x.start.getTime() - y.start.getTime())) {
    const options = equipment.filter((m) => m.locationId === a.clinic && m.treatments.includes(a.treatment.id));
    if (!options.length) {
      out.set(a.id, { machine: null, clash: false });
      continue;
    }
    const s = a.start.getTime();
    const e = a.end.getTime();
    const usable = options.filter((m) => !m.maintenance && !excepted(m.id, day, exceptions));
    const free = usable.find((m) => (busy.get(m.id) ?? []).every((b) => b.e <= s || b.s >= e));
    const machine = free ?? usable[0] ?? options[0];
    busy.set(machine.id, [...(busy.get(machine.id) ?? []), { s, e }]);
    out.set(a.id, { machine: machine.id, clash: !free });
  }
  return out;
}

/** Minutes between opening and closing for a location on a day, or 0 when closed. */
export const openMinutes = (day: Date, location: LocationId) => {
  const h = openingHours(day, location);
  return h ? (h.close - h.open) * 60 : 0;
};

export { minutesOf };
