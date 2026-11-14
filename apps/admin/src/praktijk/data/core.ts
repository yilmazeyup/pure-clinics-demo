import {
  addDays,
  dateKey,
  LOCATIONS,
  SPECIALISTS,
  startOfDay,
  treatmentById,
  type LocationId,
  type Specialist,
  type SpecialistId,
  type Treatment,
  type TreatmentCategory,
  type TreatmentId,
} from '@pure-clinics/shared';

import type { MessageKey } from '../../i18n';
import { clinicDay, ROOMS, type Appt } from '../../data/clinics';
import { COURSE_PLAN } from '../../data/courses';
import { between, pick, rng, type Rng } from '../../data/random';

// The practice world of Pure Praktijk. Treatments, prices, locations, hours and the team come from @pure-clinics/shared;
// everything about clients (names, birthdates, BSNs, policies, addresses) is invented. BSNs are 9999x test numbers that
// pass the eleven-test, AGB codes start with 99 and phone numbers with 06 0000, so none of them can be real.

/* ---------- Team ---------- */

export type StaffId = SpecialistId | 'husna';
export type StaffRole = Specialist['role'] | 'reception';

export type Staff = {
  id: StaffId;
  name: string;
  role: StaffRole;
  locationId: LocationId;
  /** Three letters, as on the agenda and in reports. */
  code: string;
  /** A made-up AGB code (99…), so it can never be a real practitioner's. */
  agb: string;
  email: string;
  /** Working days, as Date#getDay() values. */
  days: number[];
  categories: TreatmentCategory[];
  /** Whether the portrait in public/team/<id>.webp exists; Loubna has none. */
  photo: boolean;
};

const fromSpecialist = (s: Specialist, agb: string): Staff => ({
  id: s.id,
  name: s.name,
  role: s.role,
  locationId: s.locationId,
  code: s.name.slice(0, 3).toUpperCase(),
  agb,
  email: `${s.id}@pureclinics.nl`,
  days: s.days,
  categories: s.categories,
  photo: s.id !== 'loubna',
});

const AGB: Record<SpecialistId, string> = {
  loubna: '99-104417',
  margot: '99-104422',
  maud: '99-104438',
  hawin: '99-104445',
  nadila: '99-104451',
  sam: '99-104466',
};

/** Pure's own team, plus Husna at the front desk in Nijmegen. */
export const STAFF: Staff[] = [
  ...SPECIALISTS.map((s) => fromSpecialist(s, AGB[s.id])),
  {
    id: 'husna',
    name: 'Husna',
    role: 'reception',
    locationId: 'nijmegen',
    code: 'HUS',
    agb: '',
    email: 'husna@pureclinics.nl',
    days: [1, 2, 3, 4, 5],
    categories: [],
    photo: true,
  },
];

export const staffById = (id: StaffId) => STAFF.find((s) => s.id === id) ?? STAFF[0];

/** The role in words: huidtherapeut, beautyspecialist or receptie. */
export const roleKey = (role: StaffRole): MessageKey => (role === 'reception' ? 'role.reception' : `role.${role}`);

/** Portrait of a team member, served from public/team/. */
export const portrait = (id: StaffId) => `${import.meta.env.BASE_URL}team/${id}.webp`;

/* ---------- Locations and agendas ---------- */

export const PRACTICE = {
  name: 'Pure Clinics',
  agb: '99-012345',
  kvk: '00000000',
  iban: 'NL00 TEST 0123 4567 89',
};

/** Every location has its own AGB code (made up); Blanche Beauty Studio is a room inside Nijmegen. */
export const LOCATION_AGB: Record<LocationId, string> = { nijmegen: '99-012346', uden: '99-012347' };

export type Agenda = { id: SpecialistId; locationId: LocationId; index: number; staff: Staff; beauty: boolean };

/** One agenda per treatment room, the same rooms as the overview's diary: four in Nijmegen, two in Uden. */
export const AGENDAS: Agenda[] = LOCATIONS.flatMap((l) =>
  ROOMS[l.id].map((s, index) => ({ id: s.id, locationId: l.id, index, staff: staffById(s.id), beauty: s.role === 'beauty' })),
);

export const cityOf = (id: LocationId) => LOCATIONS.find((l) => l.id === id)?.city ?? '';

/* ---------- Insurers ---------- */

export type InsurerId = 'zk' | 'cz' | 'vgz' | 'menzis' | 'dsw' | 'onvz';
export type Insurer = { id: InsurerId; name: string; uzovi: string; contracted: boolean };

/** Dutch health insurers with their UZOVI codes; "contracted" decides between a Vecozo claim and a restitutienota. */
export const INSURERS: Insurer[] = [
  { id: 'zk', name: 'Zilveren Kruis', uzovi: '3311', contracted: true },
  { id: 'cz', name: 'CZ', uzovi: '9664', contracted: true },
  { id: 'vgz', name: 'VGZ', uzovi: '7095', contracted: true },
  { id: 'menzis', name: 'Menzis', uzovi: '3332', contracted: true },
  { id: 'dsw', name: 'DSW', uzovi: '7119', contracted: false },
  { id: 'onvz', name: 'ONVZ', uzovi: '3343', contracted: false },
];

export const insurerById = (id: InsurerId) => INSURERS.find((i) => i.id === id) ?? INSURERS[0];

/* ---------- Conditions and coding ---------- */

export type ConditionId = 'acne' | 'couperose' | 'hirsutism' | 'pigment' | 'scars' | 'tattoo' | 'aging' | 'hairloss' | 'camouflage' | 'beauty';

export type Condition = {
  id: ConditionId;
  label: MessageKey;
  /** The treatments given for it, the first one the usual. */
  treatments: TreatmentId[];
  /** Insured care under the supplementary policy: claimed through Vecozo or on a restitutienota, at 0% VAT. */
  insured: boolean;
  /** A made-up diagnosis code for the demo. */
  diagnosis: string;
};

export const CONDITIONS: Condition[] = [
  { id: 'acne', label: 'pk.cond.acne', treatments: ['acne', 'deepclean', 'peel', 'ipl'], insured: true, diagnosis: '1101' },
  { id: 'couperose', label: 'pk.cond.couperose', treatments: ['couperose', 'legveins', 'ipl'], insured: true, diagnosis: '1204' },
  { id: 'hirsutism', label: 'pk.cond.hirsutism', treatments: ['laser', 'epilation'], insured: true, diagnosis: '1310' },
  { id: 'pigment', label: 'pk.cond.pigment', treatments: ['pigment', 'ipl', 'tca'], insured: false, diagnosis: '1402' },
  { id: 'scars', label: 'pk.cond.scars', treatments: ['skinpen', 'sylfirm', 'tixel', 'pdrn'], insured: false, diagnosis: '1505' },
  { id: 'tattoo', label: 'pk.cond.tattoo', treatments: ['tattoo'], insured: false, diagnosis: '1607' },
  { id: 'aging', label: 'pk.cond.aging', treatments: ['tixel', 'skinbooster', 'exosomes', 'prx', 'facial', 'eyes'], insured: false, diagnosis: '1703' },
  { id: 'hairloss', label: 'pk.cond.hairloss', treatments: ['xlhair'], insured: false, diagnosis: '1808' },
  { id: 'camouflage', label: 'pk.cond.camouflage', treatments: ['camouflage'], insured: true, diagnosis: '1906' },
  { id: 'beauty', label: 'pk.cond.beauty', treatments: ['brows', 'nails'], insured: false, diagnosis: '' },
];

export const conditionById = (id: ConditionId) => CONDITIONS.find((c) => c.id === id) ?? CONDITIONS[0];

/** The condition a treatment usually belongs to. */
export function conditionOf(treatment: TreatmentId): Condition {
  return CONDITIONS.find((c) => c.treatments[0] === treatment) ?? CONDITIONS.find((c) => c.treatments.includes(treatment)) ?? CONDITIONS[6];
}

/** Master data per treatment that the shared catalogue does not have: abbreviation, VAT, ledger account and insurer codes. */
export type TreatmentCodes = { abbr: string; vat: 0 | 21; ledger: string; prestatie: string; aanspraak: string; intake: boolean };

const ABBR: Record<TreatmentId, string> = {
  consult: 'INT',
  laser: 'LAS',
  epilation: 'EPI',
  tattoo: 'TAT',
  acne: 'ACN',
  couperose: 'COU',
  pigment: 'PIG',
  legveins: 'BEN',
  eyes: 'OOG',
  skinpen: 'SKP',
  tixel: 'TIX',
  sylfirm: 'SYL',
  skinbooster: 'SKB',
  exosomes: 'EXO',
  pdrn: 'PDR',
  tca: 'TCA',
  deepclean: 'DRE',
  xlhair: 'XLH',
  camouflage: 'CAM',
  ipl: 'IPL',
  massage: 'MAS',
  prx: 'PRX',
  facial: 'FAC',
  peel: 'PEE',
  brows: 'BRW',
  nails: 'NAG',
};

/** Insured treatments carry a prestatiecode and aanspraakcode (demo values) and 0% VAT; the rest 21%. */
export function codesOf(t: Treatment): TreatmentCodes {
  const insured = Boolean(t.insurable);
  return {
    abbr: ABBR[t.id],
    vat: insured || t.id === 'consult' ? 0 : 21,
    ledger: t.category === 'beauty' ? '8030' : insured ? '8010' : '8020',
    prestatie: insured ? `${1000 + (ABBR[t.id].charCodeAt(0) % 9) * 10 + (ABBR[t.id].charCodeAt(1) % 10)}` : '',
    aanspraak: insured ? '001' : '',
    intake: t.id === 'consult',
  };
}

/* ---------- Equipment ---------- */

export type EquipmentId = 'diode-nm' | 'diode-ud' | 'ndyag' | 'ipl-nm' | 'ipl-ud' | 'skinpen' | 'tixel' | 'sylfirm' | 'epi-nm' | 'epi-ud';

export type Equipment = { id: EquipmentId; name: string; locationId: LocationId; treatments: TreatmentId[]; serial: string; service: string };

/** Machines are proper names and stay untranslated; serial numbers and service dates are demo values. */
export const EQUIPMENT: Equipment[] = [
  { id: 'diode-nm', name: 'Diodelaser 1', locationId: 'nijmegen', treatments: ['laser'], serial: 'DL-2291', service: '2027-02-10' },
  { id: 'ndyag', name: 'Nd:YAG', locationId: 'nijmegen', treatments: ['couperose', 'legveins', 'tattoo', 'pigment'], serial: 'ND-0817', service: '2027-01-14' },
  { id: 'ipl-nm', name: 'IPL 1', locationId: 'nijmegen', treatments: ['ipl', 'pigment', 'acne'], serial: 'IP-3320', service: '2026-12-02' },
  { id: 'skinpen', name: 'SkinPen', locationId: 'nijmegen', treatments: ['skinpen', 'prx', 'exosomes', 'pdrn'], serial: 'SP-1185', service: '2027-03-21' },
  { id: 'tixel', name: 'Tixel', locationId: 'nijmegen', treatments: ['tixel', 'eyes'], serial: 'TX-0442', service: '2027-04-08' },
  { id: 'sylfirm', name: 'Sylfirm X', locationId: 'nijmegen', treatments: ['sylfirm'], serial: 'SX-0093', service: '2027-05-30' },
  { id: 'epi-nm', name: 'Epilatie 1', locationId: 'nijmegen', treatments: ['epilation'], serial: 'EP-7710', service: '2027-01-30' },
  { id: 'diode-ud', name: 'Diodelaser 2', locationId: 'uden', treatments: ['laser'], serial: 'DL-2307', service: '2027-02-17' },
  { id: 'ipl-ud', name: 'IPL 2', locationId: 'uden', treatments: ['ipl', 'pigment', 'acne'], serial: 'IP-3341', service: '2026-12-09' },
  { id: 'epi-ud', name: 'Epilatie 2', locationId: 'uden', treatments: ['epilation'], serial: 'EP-7724', service: '2027-02-05' },
];

/** The machines at a location that can give a treatment; empty when it needs none. */
export const equipmentFor = (treatment: TreatmentId, locationId: LocationId) =>
  EQUIPMENT.filter((e) => e.locationId === locationId && e.treatments.includes(treatment));

/* ---------- Clients ---------- */

export type CameVia = 'google' | 'instagram' | 'friend' | 'gp' | 'website' | 'directory' | 'app';
export const CAME_VIA: CameVia[] = ['google', 'instagram', 'friend', 'gp', 'website', 'directory', 'app'];

/** The HMH steps of methodical working, from screening to closing. */
export const HMH_STEPS = ['screening', 'intake', 'onderzoek', 'analyse', 'plan', 'behandeling', 'evaluatie', 'afsluiting'] as const;
export type HmhStep = (typeof HMH_STEPS)[number];

export type Episode = {
  id: string;
  condition: ConditionId;
  treatment: TreatmentId;
  practitioner: SpecialistId;
  billing: 'client' | 'insurer';
  /** Zorgtrajectnummer, made when the episode is opened. */
  zt: string;
  start: Date;
  /** Own price and duration when they differ from the treatment's. */
  price: number | null;
  minutes: number | null;
  sessions: { done: number; total: number };
  step: HmhStep;
  closed: boolean;
};

export type PracticeClient = {
  id: string;
  /** "Emma B.", as the agenda shows her. */
  short: string;
  first: string;
  last: string;
  birth: Date;
  email: string;
  phone: string;
  bsn: string;
  insurer: InsurerId;
  policy: string;
  street: string;
  postcode: string;
  city: string;
  locationId: LocationId;
  since: Date;
  cameVia: CameVia;
  flags: { newsletter: boolean; sms: boolean; email: boolean; share: boolean };
  member: boolean;
  /** Allergies the file warns about, as words in the language files (pk.dossier.allergy.<id>). */
  allergies: ('latex' | 'lidocaine' | 'plaster' | 'nuts')[];
  episodes: Episode[];
};

/** Full surnames behind the initials the agenda shows ("Emma B." is Emma Bakker or Emma Brouwer). */
const SURNAMES: Record<string, string[]> = {
  'B.': ['Bakker', 'Brouwer', 'Bosman'],
  'K.': ['Kok', 'Kuipers', 'Koster'],
  'M.': ['Mulder', 'Meijer', 'Maas'],
  'P.': ['Peters', 'Postma', 'Prins'],
  'E.': ['Evers', 'Ensing'],
  'A.': ['Aksoy', 'Arts', 'Aerts'],
  'V.': ['Visser', 'Verhoeven', 'Vos'],
  'J.': ['Jansen', 'Janssen', 'Jacobs'],
  'D.': ['Dekker', 'Dijkstra'],
  'S.': ['Smit', 'Schouten', 'Sahin'],
  'H.': ['Hendriks', 'Hermans'],
  'W.': ['Willems', 'Wouters'],
  'O.': ['Ouali', 'Oosterhuis'],
  'Y.': ['Yusuf', 'Yalçın'],
  'T.': ['Terlouw', 'Tahiri'],
  'R.': ['Rutten', 'Roelofs'],
  'de V.': ['de Vries', 'de Vos'],
  'van D.': ['van Dijk', 'van Dam'],
  'de J.': ['de Jong', 'de Jager'],
  'van L.': ['van Leeuwen', 'van Loon'],
};

const STREETS = ['Lindenlaan', 'Kerkstraat', 'Molenweg', 'Berkenhof', 'Esdoornstraat', 'Wilhelminasingel', 'Parklaan', 'Rozenstraat', 'Beukenlaan', 'Kastanjehof'];
const CITIES: Record<LocationId, { city: string; postcode: number }[]> = {
  nijmegen: [
    { city: 'Nijmegen', postcode: 6521 },
    { city: 'Nijmegen', postcode: 6534 },
    { city: 'Wijchen', postcode: 6602 },
    { city: 'Beuningen', postcode: 6641 },
    { city: 'Malden', postcode: 6581 },
  ],
  uden: [
    { city: 'Uden', postcode: 5401 },
    { city: 'Uden', postcode: 5406 },
    { city: 'Veghel', postcode: 5461 },
    { city: 'Oss', postcode: 5341 },
  ],
};

const ascii = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z]+/g, '');

/** A BSN for testing: starts with 9999 and passes the eleven-test, so it is valid in form but never issued. */
export function testBsn(r: Rng): string {
  for (;;) {
    const digits = [9, 9, 9, 9, between(r, 0, 9), between(r, 0, 9), between(r, 0, 9), between(r, 0, 9)];
    const sum = digits.reduce((s, d, i) => s + d * (9 - i), 0);
    const last = sum % 11;
    if (last <= 9) return [...digits, last].join('');
  }
}

/** True for a number that passes the BSN eleven-test. */
export function elevenTest(bsn: string): boolean {
  if (!/^\d{9}$/.test(bsn)) return false;
  const d = bsn.split('').map(Number);
  return (d.slice(0, 8).reduce((s, n, i) => s + n * (9 - i), 0) - d[8]) % 11 === 0;
}

const cache = new Map<string, PracticeClient>();

/** A client file from the name the agenda shows: the same file for the same name, on every load. */
export function clientFor(short: string, locationId: LocationId = 'nijmegen', today = startOfDay(new Date())): PracticeClient {
  const known = cache.get(short);
  if (known) return known;
  const r = rng(`pk-client-${short}`);
  const [first, ...rest] = short.split(' ');
  const initial = rest.join(' ');
  const last = pick(r, SURNAMES[initial] ?? [initial.replace('.', '')]);
  const place = pick(r, CITIES[locationId]);
  const age = between(r, 19, 61);
  const birth = new Date(today.getFullYear() - age, between(r, 0, 11), between(r, 1, 28));
  const since = addDays(today, -between(r, 20, 1600));
  const insurer = pick(r, INSURERS).id;
  const allergies: PracticeClient['allergies'] = r() < 0.12 ? [pick(r, ['latex', 'lidocaine', 'plaster', 'nuts'] as const)] : [];

  const count = r() < 0.55 ? 1 : r() < 0.85 ? 2 : 3;
  const usual = pick(
    r,
    SPECIALISTS.filter((s) => s.locationId === locationId),
  );
  const episodes: Episode[] = [];
  const seen = new Set<ConditionId>();
  for (let i = 0; i < count; i++) {
    const options = CONDITIONS.filter((c) => !seen.has(c.id) && (usual.role === 'beauty' ? c.id === 'beauty' : c.id !== 'beauty'));
    if (!options.length) break;
    const condition = i === 0 && usual.role !== 'beauty' ? pick(r, options.filter((c) => c.id !== 'beauty')) : pick(r, options);
    seen.add(condition.id);
    const treatment = condition.treatments[0];
    const plan = COURSE_PLAN[treatment] ?? { sessions: 1, weeks: 4 };
    const total = plan.sessions;
    const closed = i > 0 && r() < 0.5;
    const done = closed ? total : between(r, 0, Math.max(0, total - 1));
    const start = addDays(since, i * between(r, 30, 200));
    const insured = condition.insured && r() < 0.7;
    episodes.push({
      id: `${short}-${condition.id}`,
      condition: condition.id,
      treatment,
      practitioner: usual.categories.includes(treatmentById(treatment).category) ? usual.id : (SPECIALISTS.find((s) => s.locationId === locationId && s.categories.includes(treatmentById(treatment).category))?.id ?? usual.id),
      billing: insured ? 'insurer' : 'client',
      zt: `ZT-${start.getFullYear()}-${String(between(r, 1000, 99999)).padStart(5, '0')}`,
      start,
      price: r() < 0.15 ? treatmentById(treatment).priceFrom - 5 : null,
      minutes: r() < 0.15 ? treatmentById(treatment).minutes + 15 : null,
      sessions: { done, total },
      step: closed ? 'afsluiting' : done === 0 ? pick(r, ['intake', 'onderzoek', 'analyse', 'plan'] as const) : done >= total - 1 ? 'evaluatie' : 'behandeling',
      closed,
    });
  }

  const client: PracticeClient = {
    id: ascii(`${first}-${last}`) + '-' + seedSuffix(short),
    short,
    first,
    last,
    birth,
    email: `${ascii(first)}.${ascii(last)}@example.com`,
    phone: `06 0000 ${String(between(r, 1000, 9999))}`,
    bsn: testBsn(r),
    insurer,
    policy: `T${between(r, 10000000, 99999999)}`,
    street: `${pick(r, STREETS)} ${between(r, 1, 140)}`,
    postcode: `${place.postcode} ${String.fromCharCode(65 + between(r, 0, 25))}${String.fromCharCode(65 + between(r, 0, 25))}`,
    city: place.city,
    locationId,
    since,
    cameVia: pick(r, CAME_VIA),
    flags: { newsletter: r() < 0.62, sms: r() < 0.7, email: r() < 0.9, share: r() < 0.4 },
    member: r() < 0.3,
    allergies,
    episodes,
  };
  cache.set(short, client);
  return client;
}

const seedSuffix = (text: string) => (rng(`id-${text}`)() * 1e6).toFixed(0).padStart(6, '0');

/** The agenda of a day: the same appointments as the overview's diary. */
export const agendaDay = (day: Date): Appt[] => clinicDay(day);

/**
 * Everyone who had or has an appointment from three weeks back to two weeks ahead, as client files, sorted by surname.
 * The agenda and the files therefore always match.
 */
export function practiceClients(today: Date): PracticeClient[] {
  const day = startOfDay(today);
  const key = dateKey(day);
  if (listCache?.key === key) return listCache.list;
  const seen = new Map<string, PracticeClient>();
  for (let offset = -21; offset <= 14; offset++) {
    for (const a of clinicDay(addDays(day, offset))) {
      if (!seen.has(a.client)) seen.set(a.client, clientFor(a.client, a.clinic, day));
    }
  }
  const list = [...seen.values()].sort((a, b) => a.last.localeCompare(b.last, 'nl') || a.first.localeCompare(b.first, 'nl'));
  listCache = { key, list };
  return list;
}
let listCache: { key: string; list: PracticeClient[] } | null = null;

export const clientById = (id: string, today: Date) => practiceClients(today).find((c) => c.id === id);

/** The age in whole years on a day. */
export function ageOn(birth: Date, day: Date): number {
  let age = day.getFullYear() - birth.getFullYear();
  if (day.getMonth() < birth.getMonth() || (day.getMonth() === birth.getMonth() && day.getDate() < birth.getDate())) age--;
  return age;
}

/** dd-mm-jjjj, the way Dutch forms write a birthdate; the same in every language. */
export const dmy = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
