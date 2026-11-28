import { treatmentById, type LocationId, type TreatmentId } from '@pure-clinics/shared';

import { baseDay, columnFree, seedAgenda, type AgAppt, type AgendaState, type BlockRule } from './agenda';
import { STAFF, type StaffId } from './core';

// The agenda's changes as Huidly keeps them (api/src/functions/agenda.js): one entry per change, so two people working
// in the agenda at once never overwrite each other. Huidly's Kliniek writes them; the business's own admin (Pure's
// /beheer overview) reads the same entries with this same file, so both show the very same day.
// Keep this file the same in both places: huidly app/src/praktijk/data/agendaSync.ts and pure-ivy
// apps/admin/src/praktijk/data/agendaSync.ts (only the name of the shared package differs).

export type AgendaKind = 'moved' | 'deleted' | 'added' | 'note' | 'confirmed' | 'report' | 'rule' | 'wait';
export type AgendaEntry = { kind: AgendaKind; key: string; data: unknown };
export type AgendaOp = { op: 'put'; kind: AgendaKind | 'meta'; key: string; data: unknown } | { op: 'del'; kind: AgendaKind; key: string };
export type AgendaData = { entries: AgendaEntry[]; seeded: boolean };

/** A new appointment as stored: the treatment by id, times in ms; a confirmed online request may come without a room. */
type StoredAppt = Omit<AgAppt, 'treatment' | 'start' | 'end' | 'col' | 'price'> & {
  treatment: TreatmentId;
  start: number;
  end: number;
  col: StaffId | null;
  price: number | null;
};
type StoredRule = Omit<BlockRule, 'first' | 'until'> & { first: number; until: number | null };

const storeAppt = (a: AgAppt): StoredAppt => ({ ...a, treatment: a.treatment.id, start: a.start.getTime(), end: a.end.getTime() });
const storeRule = (r: BlockRule): StoredRule => ({ ...r, first: r.first.getTime(), until: r.until ? r.until.getTime() : null });

/** The first room at the clinic that does the treatment, works that day and is free then; the same choice everywhere. */
function roomFor(s: StoredAppt, start: Date, end: Date, placed: AgAppt[]): StaffId | null {
  const treatment = treatmentById(s.treatment);
  if (!treatment) return null;
  const rooms = STAFF.filter((x) => x.locationId === s.clinic && x.categories.includes(treatment.category));
  const busy = [...baseDay(start), ...placed];
  const free = rooms.find((x) => x.days.includes(start.getDay()) && columnFree(x.id, start, end, busy, []));
  return (free ?? rooms[0])?.id ?? null;
}

function readAppt(s: StoredAppt, placed: AgAppt[]): AgAppt | null {
  const treatment = s && typeof s.treatment === 'string' ? treatmentById(s.treatment) : undefined;
  if (!treatment || !Number.isFinite(s.start) || !Number.isFinite(s.end)) return null;
  const start = new Date(s.start);
  const end = new Date(s.end);
  const known = s.col ? STAFF.find((x) => x.id === s.col) : undefined;
  const col = known ? known.id : roomFor(s, start, end, placed);
  if (!col) return null;
  const clinic: LocationId = known ? known.locationId : s.clinic;
  return { ...s, clinic, col, treatment, start, end, price: s.price ?? treatment.priceFrom, added: true };
}

function readRule(s: StoredRule): BlockRule | null {
  if (!s || !Number.isFinite(s.first) || !STAFF.some((x) => x.id === s.col)) return null;
  return { ...s, first: new Date(s.first), until: s.until ? new Date(s.until) : null, skip: Array.isArray(s.skip) ? s.skip : [] };
}

/** The agenda state from Huidly's entries; before the program stored its standard blocks, those are added here. */
export function agendaFromData({ entries, seeded }: AgendaData, today: Date): AgendaState {
  const state: AgendaState = { moved: {}, deleted: [], added: [], notes: {}, confirmed: [], reports: {}, rules: [], waitPlanned: [] };
  const added: StoredAppt[] = [];
  for (const e of entries) {
    switch (e.kind) {
      case 'moved': {
        const m = e.data as { start: number; col: StaffId };
        if (m && Number.isFinite(m.start)) state.moved[e.key] = { start: m.start, col: m.col };
        break;
      }
      case 'deleted':
        state.deleted.push(e.key);
        break;
      case 'added':
        added.push(e.data as StoredAppt);
        break;
      case 'note':
        if (typeof e.data === 'string') state.notes[e.key] = e.data;
        break;
      case 'confirmed':
        state.confirmed.push(e.key);
        break;
      case 'report':
        if (typeof e.data === 'boolean') state.reports[e.key] = e.data;
        break;
      case 'rule': {
        const rule = readRule(e.data as StoredRule);
        if (rule) state.rules.push(rule);
        break;
      }
      case 'wait':
        state.waitPlanned.push(e.key);
        break;
    }
  }
  // In time order, so a request without a room gets the same one on every screen.
  added.sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));
  for (const s of added) {
    const appt = readAppt(s, state.added);
    if (appt) state.added.push(appt);
  }
  if (!seeded) state.rules = [...seedAgenda(today).rules, ...state.rules];
  return state;
}

/** Every change of a state as entries, by "<kind>~<key>". */
function entriesOf(state: AgendaState): Map<string, AgendaEntry> {
  const out = new Map<string, AgendaEntry>();
  const add = (kind: AgendaKind, key: string, data: unknown) => out.set(`${kind}~${key}`, { kind, key, data });
  for (const [key, m] of Object.entries(state.moved)) add('moved', key, { start: m.start, col: m.col });
  for (const key of state.deleted) add('deleted', key, true);
  for (const a of state.added) add('added', a.id, storeAppt(a));
  for (const [key, note] of Object.entries(state.notes)) add('note', key, note);
  for (const key of state.confirmed) add('confirmed', key, true);
  for (const [key, filled] of Object.entries(state.reports)) add('report', key, filled);
  for (const r of state.rules) add('rule', r.id, storeRule(r));
  for (const key of state.waitPlanned) add('wait', key, true);
  return out;
}

/** What to send to Huidly to go from one state to the next. */
export function agendaOps(prev: AgendaState, next: AgendaState): AgendaOp[] {
  const before = entriesOf(prev);
  const after = entriesOf(next);
  const ops: AgendaOp[] = [];
  for (const [id, e] of after) {
    const old = before.get(id);
    if (!old || JSON.stringify(old.data) !== JSON.stringify(e.data)) ops.push({ op: 'put', ...e });
  }
  for (const [id, e] of before) if (!after.has(id)) ops.push({ op: 'del', kind: e.kind, key: e.key });
  return ops;
}

/** The first save for a business: the standard blocks, and the mark that they are stored. */
export function seedOps(state: AgendaState): AgendaOp[] {
  return [
    ...state.rules.map((r): AgendaOp => ({ op: 'put', kind: 'rule', key: r.id, data: storeRule(r) })),
    { op: 'put', kind: 'meta', key: 'seeded', data: true },
  ];
}
