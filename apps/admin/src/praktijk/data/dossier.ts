import { addDays, dateKey, LASER_ZONES, startOfDay, treatmentById, type SpecialistId, type TreatmentId } from '@pure-clinics/shared';

import type { Appt } from '../../data/clinics';
import { clinicDay } from '../../data/clinics';
import type { NoteKey } from '../../data/clients';
import { COURSE_PLAN } from '../../data/courses';
import { between, pick, rng, type Rng } from '../../data/random';
import type { Arg, MessageKey } from '../../i18n';
import { conditionById, conditionOf, type ConditionId, type Episode, type PracticeClient } from './core';

// One client's electronic file (EPD): episodes with their history, intake and consent, reports, the face canvas, photos,
// documents and the change log. Made up from the client's name so it is the same on every load, and joined with the
// appointments the agenda shows for her. Seeded words are message keys, so the file follows the chosen language; what
// someone types in the demo is kept as plain text.

/** A seeded sentence (a message key) or what someone typed. */
export type Txt = { key: MessageKey; args?: Record<string, Arg> } | { text: string };

/* ---------- Reference lists ---------- */

export type TemplateId = 'ther-general' | 'ther-laser' | 'ther-acne' | 'ther-vascular' | 'cos-skinbooster' | 'cos-injectables';
export type Template = { id: TemplateId; kind: 'therapeutic' | 'cosmetic'; sections: MessageKey[] };

export const TEMPLATES: Template[] = [
  { id: 'ther-general', kind: 'therapeutic', sections: ['pk.dossier.tplsec.findings', 'pk.dossier.tplsec.treatment', 'pk.dossier.tplsec.checklist', 'pk.dossier.tplsec.advice'] },
  { id: 'ther-laser', kind: 'therapeutic', sections: ['pk.dossier.tplsec.checklist', 'pk.dossier.tplsec.treatment', 'pk.dossier.tplsec.reaction', 'pk.dossier.tplsec.advice'] },
  { id: 'ther-acne', kind: 'therapeutic', sections: ['pk.dossier.tplsec.findings', 'pk.dossier.tplsec.checklist', 'pk.dossier.tplsec.treatment', 'pk.dossier.tplsec.advice'] },
  { id: 'ther-vascular', kind: 'therapeutic', sections: ['pk.dossier.tplsec.findings', 'pk.dossier.tplsec.treatment', 'pk.dossier.tplsec.reaction', 'pk.dossier.tplsec.checklist'] },
  { id: 'cos-skinbooster', kind: 'cosmetic', sections: ['pk.dossier.tplsec.lots', 'pk.dossier.tplsec.checklist', 'pk.dossier.tplsec.treatment', 'pk.dossier.tplsec.advice'] },
  { id: 'cos-injectables', kind: 'cosmetic', sections: ['pk.dossier.tplsec.lots', 'pk.dossier.tplsec.canvas', 'pk.dossier.tplsec.checklist', 'pk.dossier.tplsec.advice'] },
];

export const templateById = (id: TemplateId) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export type ChecklistId = 'laser' | 'acne' | 'injectables' | 'none';
export const CHECKLISTS: ChecklistId[] = ['laser', 'acne', 'injectables', 'none'];
export const CHECK_ITEMS: Record<ChecklistId, MessageKey[]> = {
  laser: ['pk.dossier.chk.sun', 'pk.dossier.chk.meds', 'pk.dossier.chk.patch', 'pk.dossier.chk.shaved', 'pk.dossier.chk.goggles', 'pk.dossier.chk.cooling'],
  acne: ['pk.dossier.chk.meds', 'pk.dossier.chk.cleansed', 'pk.dossier.chk.extract', 'pk.dossier.chk.spf'],
  injectables: ['pk.dossier.chk.meds', 'pk.dossier.chk.disinfect', 'pk.dossier.chk.marked', 'pk.dossier.chk.aftercare'],
  none: [],
};

const TEMPLATE_FOR: Record<ConditionId, [TemplateId, ChecklistId]> = {
  acne: ['ther-acne', 'acne'],
  couperose: ['ther-vascular', 'laser'],
  hirsutism: ['ther-laser', 'laser'],
  pigment: ['ther-vascular', 'laser'],
  scars: ['cos-skinbooster', 'injectables'],
  tattoo: ['ther-laser', 'laser'],
  aging: ['cos-injectables', 'injectables'],
  hairloss: ['ther-general', 'none'],
  camouflage: ['ther-general', 'none'],
  beauty: ['ther-general', 'none'],
};

/** Anamnesis: the same five questions for every condition, plus one of its own. */
export type AnamQ = 'complaint' | 'since' | 'medication' | 'skincare' | 'sun' | 'hormonal' | 'methods' | 'triggers' | 'origin' | 'colours' | 'goals' | 'pattern' | 'area';
const OWN_Q: Record<ConditionId, AnamQ> = {
  acne: 'hormonal',
  couperose: 'triggers',
  hirsutism: 'methods',
  pigment: 'origin',
  scars: 'origin',
  tattoo: 'colours',
  aging: 'goals',
  hairloss: 'pattern',
  camouflage: 'area',
  beauty: 'goals',
};
export const questionsFor = (condition: ConditionId): AnamQ[] => ['complaint', 'since', 'medication', 'skincare', 'sun', OWN_Q[condition]];

const ANSWER: Record<Exclude<AnamQ, 'complaint'>, MessageKey[]> = {
  since: ['pk.dossier.ans.since.1', 'pk.dossier.ans.since.2'],
  medication: ['pk.dossier.ans.medication.none', 'pk.dossier.ans.medication.pill'],
  skincare: ['pk.dossier.ans.skincare.basic', 'pk.dossier.ans.skincare.zo'],
  sun: ['pk.dossier.ans.sun.low', 'pk.dossier.ans.sun.high'],
  hormonal: ['pk.dossier.ans.hormonal'],
  methods: ['pk.dossier.ans.methods'],
  triggers: ['pk.dossier.ans.triggers'],
  origin: ['pk.dossier.ans.origin'],
  colours: ['pk.dossier.ans.colours'],
  goals: ['pk.dossier.ans.goals'],
  pattern: ['pk.dossier.ans.pattern'],
  area: ['pk.dossier.ans.area'],
};

/** Notes therapists wrote after a visit, per condition; the panel's own note.* sentences. */
const NOTES: Record<ConditionId, NoteKey[]> = {
  acne: ['note.acneCalmer', 'note.skinHome', 'note.skinEven'],
  couperose: ['note.rednessLess', 'note.skinSpf'],
  hirsutism: ['note.laserCalm', 'note.laserFewer', 'note.laserEnergy', 'note.laserRedness'],
  pigment: ['note.pigmentLighter', 'note.skinSpf'],
  scars: ['note.skinEven', 'note.skinHome'],
  tattoo: ['note.tattooFading', 'note.skinSpf'],
  aging: ['note.skinEven', 'note.skinSpf', 'note.skinHome'],
  hairloss: ['note.hairFuller'],
  camouflage: ['note.skinEven'],
  beauty: ['note.brows', 'note.nails'],
};

export type AllergyId = PracticeClient['allergies'][number];
export const ALLERGIES: AllergyId[] = ['latex', 'lidocaine', 'plaster', 'nuts'];

export const HEALTH_QS = ['pregnant', 'diabetes', 'epilepsy', 'pacemaker', 'anticoag', 'photosens', 'skincancer', 'keloid'] as const;
export type HealthQ = (typeof HEALTH_QS)[number];
export const MRSA_QS = ['abroad', 'carrier', 'household', 'livestock', 'outbreak', 'treated'] as const;
export type MrsaQ = (typeof MRSA_QS)[number];
export const DTH_QS = ['changing', 'bleeding', 'fever', 'pain', 'sudden'] as const;
export type DthQ = (typeof DTH_QS)[number];
export const PREOP = ['pregnant', 'bloodthinners', 'infection', 'fillers', 'photos', 'consent'] as const;
export type PreopId = (typeof PREOP)[number];
export const WORKFLOW = ['intake', 'photos', 'consent', 'marking', 'treatment', 'aftercare', 'control'] as const;

export const ICF_CODES = ['b810', 'b820', 'b840', 's810', 'd520', 'd920'] as const;
export type IcfCode = (typeof ICF_CODES)[number];

export type ZoneId = 'forehead' | 'glabella' | 'crowsfeet' | 'cheeks' | 'nasolabial' | 'lips' | 'chin' | 'jaw';
/** Treatment zones of the face canvas with their default colour. */
export const ZONES: { id: ZoneId; color: string }[] = [
  { id: 'forehead', color: '#7A6A55' },
  { id: 'glabella', color: '#B0563F' },
  { id: 'crowsfeet', color: '#4F6F86' },
  { id: 'cheeks', color: '#C08A4E' },
  { id: 'nasolabial', color: '#86587A' },
  { id: 'lips', color: '#C24F68' },
  { id: 'chin', color: '#4E7A58' },
  { id: 'jaw', color: '#34405C' },
];
export const POINT_COLOURS = ['#7A6A55', '#B0563F', '#4F6F86', '#C08A4E', '#86587A', '#C24F68', '#4E7A58', '#34405C', '#1E1E1C'];
export const zoneColor = (id: ZoneId) => ZONES.find((z) => z.id === id)?.color ?? '#7A6A55';

export const DEPTHS = ['intradermal', 'subcutaneous', 'supraperiosteal'] as const;
export type Depth = (typeof DEPTHS)[number];
export type PointSize = 'S' | 'M' | 'L';
export type Unit = 'E' | 'ml';

export const COMPLICATION_TYPES = ['hyperpigment', 'blister', 'redness', 'infection', 'hematoma', 'allergic', 'scar'] as const;
export type ComplicationType = (typeof COMPLICATION_TYPES)[number];

export const DOC_TYPES = ['intake', 'consent', 'referral', 'plan', 'invoice', 'photos', 'other'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type PhotoArea = 'cheekL' | 'cheekR' | 'chin' | 'forehead' | 'jaw';

/* ---------- The file ---------- */

export type Session = { date: Date; treatment: TreatmentId; specialist: SpecialistId; price: number; note: NoteKey | null; agenda: boolean };
export type DsInvoice = { number: string; date: Date; amount: number; paid: boolean };
export type Measure = { id: string; date: Date; value: number };

export type DsEpisode = Episode & {
  template: TemplateId;
  checklist: ChecklistId;
  intake: { status: 'none' | 'sent' | 'filled'; sent: Date | null; filled: Date | null };
  anamnesis: Partial<Record<AnamQ, Txt>>;
  measures: Measure[];
  history: Session[];
  planned: Session[];
  invoices: DsInvoice[];
  diagnosis: string;
  /** Care begun at another practice: code 008 with the entitlement start date there. */
  code008: { since: Date; done: number; practice: string; agb: string } | null;
};

export type Report = { id: string; date: Date; treatment: TreatmentId; specialist: SpecialistId; template: TemplateId | null; text: Txt | null };
export type Lot = { id: string; product: TreatmentId; number: string; expiry: Date };
export type Injectable = { id: string; product: TreatmentId; batch: string; dose: string; needle: string };
export type FacePoint = {
  id: string;
  x: number;
  y: number;
  zone: ZoneId;
  color: string;
  size: PointSize;
  unit: Unit;
  amount: number | null;
  depth: Depth | null;
  note: string;
};
export type Annotation = { id: string; kind: 'circle' | 'arrow' | 'text'; x1: number; y1: number; x2: number; y2: number; color: string; text?: Txt };
export type Complication = { id: string; date: Date; type: ComplicationType; severity: 1 | 2 | 3; action: Txt; follow: Date | null; resolved: boolean };
export type Photo = { id: string; date: Date; area: PhotoArea; stage: 'before' | 'progress' | 'after'; seed: string; condition: ConditionId; url?: string };
export type Doc = { id: string; type: DocType; date: Date; name: string; kb: number; url?: string };
export type Evaluation = { id: string; date: Date; score: number; note: Txt };
export type LogEntry = { id: string; at: Date; who: string; line: Txt };
export type SettingsRow = { id: string; zone: string; energy: string; pulse: string; spot: string };

export type DossierState = {
  episodes: DsEpisode[];
  selected: string;
  allergies: AllergyId[];
  partner: { on: boolean; doctor: string; since: Date | null; lastView: Date | null };
  cosmetic: { checks: Record<PreopId, boolean>; step: number };
  intakeAuto: { on: boolean; days: number };
  verify: { checked: 'ok' | 'wrong' | null; moved: boolean };
  health: { answers: Record<HealthQ, boolean>; signed: Date | null };
  mrsa: { answers: Record<MrsaQ, boolean>; filled: Date | null };
  consent: { image: string | null; at: Date | null; treatment: TreatmentId };
  dth: { answers: Record<DthQ, boolean>; referral: 'dth' | 'gp' };
  icf: { code: IcfCode; qualifier: number }[];
  reports: Report[];
  checks: Record<string, boolean>;
  checkAnswer: Txt;
  settings: SettingsRow[];
  lots: Lot[];
  injectables: Injectable[];
  points: FacePoint[];
  annotations: Annotation[];
  complications: Complication[];
  photos: Photo[];
  docs: Doc[];
  goals: Txt[];
  evaluations: Evaluation[];
  log: LogEntry[];
};

/** The client's appointments in the agenda from three weeks back to two weeks ahead, the window the register covers. */
export function agendaOf(short: string, today: Date): Appt[] {
  const out: Appt[] = [];
  for (let offset = -21; offset <= 14; offset++) for (const a of clinicDay(addDays(today, offset))) if (a.client === short) out.push(a);
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const yearOf = (d: Date) => d.getFullYear();

/** Spreads `count` sessions evenly from the start to the day before `until`, on believable hours. */
function spread(r: Rng, start: Date, until: Date, count: number): Date[] {
  if (count <= 0) return [];
  const from = start.getTime();
  const to = Math.max(from + 86400000, until.getTime());
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from + ((to - from) * (i + 0.5)) / count);
    d.setHours(between(r, 9, 17), pick(r, [0, 15, 30, 45]), 0, 0);
    return d;
  });
}

let ids = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(ids++).toString(36)}`;

/** A care-trajectory number for a new episode: ZT, the year and five digits. */
export const makeZt = (day: Date) => `ZT-${day.getFullYear()}-${String(10000 + Math.floor(Math.random() * 89999))}`;

/** A new episode with nothing in it yet: opened from the file, the online portal or a transfer. */
export function blankEpisode(episode: Episode): DsEpisode {
  const [template, checklist] = TEMPLATE_FOR[episode.condition];
  return {
    ...episode,
    template,
    checklist,
    diagnosis: conditionById(episode.condition).diagnosis,
    intake: { status: 'none', sent: null, filled: null },
    anamnesis: {},
    measures: [],
    history: [],
    planned: [],
    invoices: [],
    code008: null,
  };
}

export function seedEpisode(r: Rng, episode: Episode, today: Date, agenda: Appt[], now: Date): DsEpisode {
  const condition = conditionById(episode.condition);
  const [template, checklist] = TEMPLATE_FOR[episode.condition];
  const own = agenda.filter((a) => conditionOf(a.treatment.id).id === episode.condition || (a.treatment.id === 'consult' && episode.step !== 'afsluiting'));
  const pastAgenda = own.filter((a) => a.end.getTime() <= now.getTime());
  const futureAgenda = own.filter((a) => a.end.getTime() > now.getTime());

  const generated = Math.max(0, episode.sessions.done - pastAgenda.length);
  const notes = NOTES[episode.condition];
  const history: Session[] = [
    ...spread(r, addDays(episode.start, 7), addDays(today, -22), generated).map((date) => ({
      date,
      treatment: episode.treatment,
      specialist: episode.practitioner,
      price: episode.price ?? treatmentById(episode.treatment).priceFrom,
      note: pick(r, notes),
      agenda: false,
    })),
    ...pastAgenda.map((a) => ({ date: a.start, treatment: a.treatment.id, specialist: a.specialist.id, price: a.price, note: pick(r, notes), agenda: true })),
  ];
  // The free intake opens every episode, at a believable hour.
  const intakeAt = new Date(episode.start);
  intakeAt.setHours(between(r, 10, 16), pick(r, [0, 30]), 0, 0);
  history.unshift({ date: intakeAt, treatment: 'consult', specialist: episode.practitioner, price: 0, note: 'note.intakePlan', agenda: false });

  const planned: Session[] = futureAgenda.map((a) => ({ date: a.start, treatment: a.treatment.id, specialist: a.specialist.id, price: a.price, note: null, agenda: true }));
  if (!planned.length && !episode.closed && episode.sessions.done < episode.sessions.total) {
    const date = addDays(today, between(r, 5, 30));
    date.setHours(between(r, 10, 16), pick(r, [0, 30]), 0, 0);
    planned.push({ date, treatment: episode.treatment, specialist: episode.practitioner, price: episode.price ?? treatmentById(episode.treatment).priceFrom, note: null, agenda: false });
  }

  const invoices: DsInvoice[] = history
    .filter((s) => s.price > 0)
    .map((s, i, all) => ({
      number: `${yearOf(s.date)}-${String(between(r, 100, 2999)).padStart(4, '0')}`,
      date: s.date,
      amount: s.price,
      paid: i < all.length - 1 || r() < 0.7,
    }));

  const anamnesis: Partial<Record<AnamQ, Txt>> = {};
  for (const q of questionsFor(episode.condition)) {
    anamnesis[q] = q === 'complaint' ? { key: `pk.dossier.ans.complaint.${episode.condition}` } : { key: pick(r, ANSWER[q]) };
  }
  const measures: Measure[] = history
    .filter((s) => s.treatment !== 'consult')
    .slice(-4)
    .map((s, i, all) => ({ id: `m-${episode.id}-${i}`, date: s.date, value: measureValue(episode.condition, i, all.length, r) }));

  const intakeSent = addDays(episode.start, -between(r, 3, 6));
  return {
    ...episode,
    template,
    checklist,
    diagnosis: condition.diagnosis,
    intake: { status: 'filled', sent: intakeSent, filled: addDays(intakeSent, between(r, 0, 2)) },
    anamnesis,
    measures,
    history,
    planned,
    invoices,
    code008: null,
  };
}

/** A believable measurement that improves over the sessions. */
function measureValue(condition: ConditionId, i: number, n: number, r: Rng): number {
  const progress = n > 1 ? i / (n - 1) : 0;
  switch (condition) {
    case 'acne':
      return Math.max(1, Math.round(18 - progress * 11 + between(r, -1, 1)));
    case 'hirsutism':
      return Math.max(10, Math.round(90 - progress * 45 + between(r, -3, 3)));
    case 'tattoo':
      return Math.min(95, Math.round(20 + progress * 50 + between(r, -3, 3)));
    case 'hairloss':
      return Math.round(140 + progress * 40 + between(r, -5, 5));
    case 'beauty':
      return Math.min(10, 7 + Math.round(progress * 2));
    case 'aging':
      return Math.min(10, Math.round(4 + progress * 3));
    default:
      return Math.max(1, Math.round(8 - progress * 4));
  }
}

/** A made-up lot number such as SB26-0917. */
export const lotNumber = (r: Rng, product: TreatmentId) => `${product.slice(0, 2).toUpperCase()}${between(r, 24, 26)}-${String(between(r, 100, 9999)).padStart(4, '0')}`;

export function seedDossier(client: PracticeClient, todayIn: Date, now: Date): DossierState {
  const today = startOfDay(todayIn);
  const r = rng(`pk-dossier-${client.id}-${dateKey(today)}`);
  const agenda = agendaOf(client.short, today);

  // An episode never starts in the future: a young file gets its start a few weeks back (and a number for that year).
  const base: Episode[] = client.episodes.map((e) => {
    if (e.start.getTime() <= today.getTime()) return e;
    const start = addDays(today, -between(r, 14, 60));
    return { ...e, start, zt: e.zt.replace(/^ZT-\d{4}/, `ZT-${start.getFullYear()}`) };
  });
  // Agenda appointments for a condition the file has no episode for yet get one, so the agenda and the file agree.
  for (const a of agenda) {
    if (a.treatment.id === 'consult') continue;
    const condition = conditionOf(a.treatment.id);
    if (base.some((e) => e.condition === condition.id)) continue;
    const plan = COURSE_PLAN[a.treatment.id] ?? { sessions: 1, weeks: 4 };
    const start = addDays(today, -between(r, 60, 300));
    base.push({
      id: `${client.short}-${condition.id}`,
      condition: condition.id,
      treatment: a.treatment.id,
      practitioner: a.specialist.id,
      billing: condition.insured && r() < 0.6 ? 'insurer' : 'client',
      zt: `ZT-${start.getFullYear()}-${String(between(r, 10000, 99999))}`,
      start,
      price: null,
      minutes: null,
      sessions: { done: between(r, 1, Math.max(1, plan.sessions - 1)), total: plan.sessions },
      step: 'behandeling',
      closed: false,
    });
  }
  const episodes = base.map((e) => seedEpisode(r, e, today, agenda, now));
  // The file opens on the running episode with the most behind it.
  const main = [...episodes].sort((a, b) => Number(a.closed) - Number(b.closed) || b.history.length - a.history.length)[0];

  const allSessions = episodes.flatMap((e) => e.history.map((s) => ({ s, e }))).sort((a, b) => b.s.date.getTime() - a.s.date.getTime());
  // Always five to show: a short file gets older visits of its main treatment.
  while (main && allSessions.length < 5) {
    const oldest = allSessions[allSessions.length - 1]?.s.date ?? today;
    const date = addDays(oldest, -between(r, 21, 42));
    allSessions.push({ s: { date, treatment: main.treatment, specialist: main.practitioner, price: 0, note: pick(r, NOTES[main.condition]), agenda: false }, e: main });
  }
  const reports: Report[] = allSessions.slice(0, 5).map(({ s, e }, i) => ({
    id: `rep-${client.id}-${i}`,
    date: s.date,
    treatment: s.treatment,
    specialist: s.specialist,
    template: i === 0 || i === 3 ? null : e.template,
    text: i === 0 || i === 3 ? null : s.note ? { key: s.note } : null,
  }));
  // Today's visit (if any) comes first, still empty.
  const todays = agenda.find((a) => startOfDay(a.start).getTime() === today.getTime());
  if (todays && !reports.some((x) => x.date.getTime() === todays.start.getTime())) {
    reports.unshift({ id: `rep-${client.id}-today`, date: todays.start, treatment: todays.treatment.id, specialist: todays.specialist.id, template: null, text: null });
    reports.length = Math.min(reports.length, 5);
  }

  const cosmeticProduct: TreatmentId = main && ['aging', 'scars'].includes(main.condition) ? main.treatment : 'skinbooster';
  const lots: Lot[] = [
    { id: 'lot-1', product: cosmeticProduct, number: lotNumber(r, cosmeticProduct), expiry: addDays(today, between(r, 120, 500)) },
    { id: 'lot-2', product: 'pdrn', number: lotNumber(r, 'pdrn'), expiry: addDays(today, -between(r, 5, 40)) },
  ];
  const injectables: Injectable[] = [
    { id: 'inj-1', product: cosmeticProduct, batch: lots[0].number, dose: '2 ml', needle: '30G · 13 mm' },
    { id: 'inj-2', product: 'pdrn', batch: lotNumber(r, 'pdrn'), dose: '1 ml', needle: '32G · 4 mm' },
  ];

  const points: FacePoint[] = [
    [150, 268, 'cheeks'],
    [128, 300, 'cheeks'],
    [250, 268, 'cheeks'],
    [272, 300, 'cheeks'],
    [175, 302, 'nasolabial'],
    [225, 302, 'nasolabial'],
    [200, 386, 'chin'],
    [143, 360, 'jaw'],
    [257, 360, 'jaw'],
  ].map(([x, y, zone], i) => ({
    id: `pt-${i}`,
    x: x as number,
    y: y as number,
    zone: zone as ZoneId,
    color: zoneColor(zone as ZoneId),
    size: 'M' as PointSize,
    unit: 'ml' as Unit,
    amount: zone === 'cheeks' ? 0.2 : 0.1,
    depth: (zone === 'chin' || zone === 'jaw' ? 'subcutaneous' : 'intradermal') as Depth,
    note: '',
  }));

  const area: PhotoArea = main?.condition === 'acne' ? 'jaw' : main?.condition === 'hirsutism' ? 'chin' : main?.condition === 'pigment' ? 'forehead' : 'cheekL';
  // Before at the start, one along the way, after at the latest visit (or a few weeks on when the file is young).
  const visits = main ? main.history.map((h) => h.date) : [];
  const first = visits[0] ?? today;
  const last = visits.length > 1 ? visits[visits.length - 1] : addDays(first, 42);
  const middle = new Date((first.getTime() + last.getTime()) / 2);
  const photos: Photo[] = main
    ? [
        { id: 'ph-1', date: first, area, stage: 'before', seed: `${client.id}-a`, condition: main.condition },
        { id: 'ph-2', date: middle, area, stage: 'progress', seed: `${client.id}-b`, condition: main.condition },
        { id: 'ph-3', date: last, area, stage: 'after', seed: `${client.id}-c`, condition: main.condition },
        { id: 'ph-4', date: first, area: area === 'cheekL' ? 'cheekR' : 'cheekL', stage: 'before', seed: `${client.id}-d`, condition: main.condition },
      ]
    : [];

  const firstDate = episodes.reduce((min, e) => (e.start < min ? e.start : min), client.since);
  const slug = `${client.last.toLowerCase().replace(/[^a-z]+/g, '')}`;
  const docs: Doc[] = [
    { id: 'doc-1', type: 'intake', date: firstDate, name: `intake-${slug}.pdf`, kb: between(r, 80, 180) },
    { id: 'doc-2', type: 'consent', date: addDays(firstDate, 1), name: `toestemming-${slug}.pdf`, kb: between(r, 60, 140) },
    { id: 'doc-3', type: 'plan', date: addDays(firstDate, 2), name: `behandelplan-${slug}.pdf`, kb: between(r, 90, 210) },
    ...(client.cameVia === 'gp' ? [{ id: 'doc-4', type: 'referral' as DocType, date: addDays(firstDate, -4), name: `verwijzing-${slug}.pdf`, kb: between(r, 40, 90) }] : []),
    { id: 'doc-5', type: 'photos', date: addDays(today, -between(r, 8, 40)), name: `fotos-${slug}.zip`, kb: between(r, 2200, 6400) },
  ];

  const log: LogEntry[] = [];
  const add = (at: Date, who: string, line: Txt) => log.push({ id: `log-${log.length}`, at, who, line });
  add(client.since, 'HUS', { key: 'pk.dossier.log.created' });
  for (const e of episodes) {
    add(e.start, 'HUS', { key: 'pk.dossier.log.episode', args: { condition: { msg: conditionById(e.condition).label }, zt: e.zt } });
    if (e.intake.filled) add(e.intake.filled, 'web', { key: 'pk.dossier.log.intakeFilled' });
    for (const s of e.history.slice(-3)) {
      if (s.treatment === 'consult') continue;
      add(addDays(s.date, 0), s.specialist.slice(0, 3).toUpperCase(), { key: 'pk.dossier.log.report', args: { treatment: { treatment: s.treatment } } });
    }
    for (const inv of e.invoices.slice(-2)) add(inv.date, 'HUS', { key: 'pk.dossier.log.invoice', args: { number: inv.number } });
  }
  add(addDays(firstDate, 1), 'web', { key: 'pk.dossier.log.consent' });
  log.sort((a, b) => b.at.getTime() - a.at.getTime());

  const evalDate = (n: number) => (n === 1 ? last : middle);
  return {
    episodes,
    selected: main?.id ?? '',
    allergies: [...client.allergies],
    partner: { on: main?.condition === 'aging' || main?.condition === 'scars', doctor: 'dr. M. Hoekstra', since: addDays(today, -between(r, 30, 200)), lastView: addDays(today, -between(r, 1, 20)) },
    cosmetic: { checks: { pregnant: true, bloodthinners: true, infection: true, fillers: false, photos: true, consent: true }, step: 3 },
    intakeAuto: { on: true, days: 3 },
    verify: { checked: null, moved: false },
    health: {
      answers: { pregnant: false, diabetes: false, epilepsy: false, pacemaker: false, anticoag: r() < 0.15, photosens: r() < 0.2, skincancer: false, keloid: r() < 0.1 },
      signed: addDays(firstDate, 1),
    },
    mrsa: { answers: { abroad: false, carrier: false, household: false, livestock: false, outbreak: false, treated: false }, filled: addDays(firstDate, 1) },
    consent: { image: null, at: null, treatment: main?.treatment ?? 'consult' },
    dth: { answers: { changing: false, bleeding: false, fever: false, pain: false, sudden: false }, referral: client.cameVia === 'gp' ? 'gp' : 'dth' },
    icf: [
      { code: 'b810', qualifier: 2 },
      { code: 's810', qualifier: 1 },
      { code: 'd920', qualifier: 1 },
    ],
    reports,
    checks: {},
    checkAnswer: { key: 'pk.dossier.chk.answerSeed' },
    settings: [
      { id: 'set-1', zone: LASER_ZONES[2].id, energy: '14', pulse: '20', spot: '12' },
      { id: 'set-2', zone: LASER_ZONES[1].id, energy: '12', pulse: '20', spot: '12' },
    ],
    lots,
    injectables,
    points,
    annotations: [
      { id: 'an-1', kind: 'circle', x1: 205, y1: 150, x2: 250, y2: 150, color: '#B0563F' },
      { id: 'an-2', kind: 'text', x1: 260, y1: 100, x2: 260, y2: 100, color: '#B0563F', text: { key: 'pk.dossier.an.seed1' } },
      { id: 'an-3', kind: 'arrow', x1: 110, y1: 250, x2: 150, y2: 215, color: '#4F6F86' },
      { id: 'an-4', kind: 'text', x1: 40, y1: 268, x2: 40, y2: 268, color: '#4F6F86', text: { key: 'pk.dossier.an.seed2' } },
    ],
    complications:
      main && main.history.length > 2
        ? [
            {
              id: 'cx-1',
              date: main.history[2].date,
              type: main.condition === 'hirsutism' || main.condition === 'pigment' ? 'hyperpigment' : 'redness',
              severity: 1,
              action: { key: 'pk.dossier.cx.seedAction' },
              follow: addDays(main.history[2].date, 14),
              resolved: true,
            },
          ]
        : [],
    photos,
    docs,
    goals: main ? [{ key: `pk.dossier.goal.${main.condition}` }, { key: 'pk.dossier.goal.home' }, { key: 'pk.dossier.goal.sun' }] : [],
    evaluations: main
      ? [
          { id: 'ev-1', date: evalDate(3), score: 6, note: { key: 'pk.dossier.plan.eval2' } },
          { id: 'ev-2', date: evalDate(1), score: 8, note: { key: 'pk.dossier.plan.eval1' } },
        ]
      : [],
    log,
  };
}

/** Planned sessions and the interval for the treatment plan. */
export const planOf = (treatment: TreatmentId) => COURSE_PLAN[treatment] ?? { sessions: 1, weeks: 4 };
