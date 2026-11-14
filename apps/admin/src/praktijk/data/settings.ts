import { addDays, type TreatmentId } from '@pure-clinics/shared';

import type { MessageKey } from '../../i18n';
import type { ScreenId } from '../nav';
import type { PkIconName } from '../icons';
import type { ConditionId, StaffId } from './core';

// Instellingen & koppelingen: integrations, the change log, the status page, support and the import. Every person,
// practice and number here is made up; the GP practices are generic names, IP addresses are documentation ranges.

/* ---------- Integrations ---------- */

export type IntegrationId = 'vecozo' | 'zorgdomein' | 'zorgmail' | 'qualizorg' | 'boekhouding' | 'bi' | 'api' | 'suppliers' | 'teamviewer' | 'erecept';
export type IntegrationGroup = 'care' | 'finance' | 'data' | 'support';

export type Integration = { id: IntegrationId; feature: string; icon: PkIconName; group: IntegrationGroup; on: boolean; planned?: boolean };

export const INTEGRATIONS: Integration[] = [
  { id: 'vecozo', feature: 'w.vecozo', icon: 'shieldCheck', group: 'care', on: true },
  { id: 'zorgdomein', feature: 'w.zorgdomein', icon: 'inbox', group: 'care', on: true },
  { id: 'zorgmail', feature: 'w.zorgmail', icon: 'send', group: 'care', on: true },
  { id: 'qualizorg', feature: 'w.qualizorg', icon: 'star', group: 'care', on: false },
  { id: 'boekhouding', feature: 'w.boekhouding', icon: 'chart', group: 'finance', on: true },
  { id: 'bi', feature: 'w.bi', icon: 'layers', group: 'data', on: false },
  { id: 'api', feature: 'w.api', icon: 'wand', group: 'data', on: true },
  { id: 'suppliers', feature: 'w.suppliers', icon: 'truck', group: 'finance', on: true },
  { id: 'teamviewer', feature: 'w.teamviewer', icon: 'eye', group: 'support', on: false },
  { id: 'erecept', feature: 'w.erecept', icon: 'file', group: 'care', on: false, planned: true },
];

/** Referrals that arrived through Zorgdomein, each with the GP's letter. */
export const REFERRALS: { id: string; gp: string; city: string; client: string; condition: ConditionId; daysAgo: number }[] = [
  { id: 'ref-1', gp: 'Huisartsenpraktijk Oost', city: 'Nijmegen', client: 'Noor V.', condition: 'acne', daysAgo: 1 },
  { id: 'ref-2', gp: 'Gezondheidscentrum De Brink', city: 'Uden', client: 'Sevda K.', condition: 'camouflage', daysAgo: 3 },
];

/** Suppliers that can take orders straight from the order list. */
export const SUPPLIERS = ['ZO Skin Health', 'Lycogel', 'WiQo', 'XL Hair', 'Medi (steunkousen)'];

/* ---------- Change log ---------- */

export type AuditEntry = {
  id: string;
  minutesAgo: number;
  who: StaffId;
  key: Extract<MessageKey, `pk.instellingen.log.${string}`>;
  args: Record<string, string | { treatment: TreatmentId } | { msg: MessageKey }>;
  object: 'client' | 'treatment' | 'invoice' | 'profile' | 'export';
};

export const AUDIT: AuditEntry[] = [
  { id: 'a1', minutesAgo: 6, who: 'husna', key: 'pk.instellingen.log.client', args: { client: 'Noor V.' }, object: 'client' },
  { id: 'a2', minutesAgo: 19, who: 'loubna', key: 'pk.instellingen.log.report', args: { client: 'Emma B.' }, object: 'client' },
  { id: 'a3', minutesAgo: 34, who: 'margot', key: 'pk.instellingen.log.price', args: { treatment: { treatment: 'laser' } }, object: 'treatment' },
  { id: 'a4', minutesAgo: 52, who: 'maud', key: 'pk.instellingen.log.consent', args: { client: 'Fleur J.' }, object: 'client' },
  { id: 'a5', minutesAgo: 75, who: 'husna', key: 'pk.instellingen.log.invoice', args: { number: '2026-0418' }, object: 'invoice' },
  { id: 'a6', minutesAgo: 128, who: 'margot', key: 'pk.instellingen.log.profile', args: { profile: { msg: 'pk.team.profile.reception' } }, object: 'profile' },
  { id: 'a7', minutesAgo: 190, who: 'nadila', key: 'pk.instellingen.log.report', args: { client: 'Hira S.' }, object: 'client' },
  { id: 'a8', minutesAgo: 260, who: 'sam', key: 'pk.instellingen.log.export', args: {}, object: 'export' },
];

/* ---------- Status page ---------- */

export const STATUS_PARTS = ['agenda', 'dossier', 'vecozo', 'mail', 'sms', 'portal', 'api', 'backup'] as const;
export type StatusPart = (typeof STATUS_PARTS)[number];

/* ---------- Support ---------- */

/** The next weekly webinars: Tuesdays at ten. */
export function webinars(today: Date): { id: string; date: Date; topic: 'agenda' | 'claims' | 'reports' }[] {
  const first = addDays(today, (2 - today.getDay() + 7) % 7 || 7);
  const at = (d: Date) => {
    const x = new Date(d);
    x.setHours(10, 0, 0, 0);
    return x;
  };
  return [
    { id: 'w1', date: at(first), topic: 'agenda' },
    { id: 'w2', date: at(addDays(first, 7)), topic: 'claims' },
    { id: 'w3', date: at(addDays(first, 14)), topic: 'reports' },
  ];
}

export const NEWS: { id: 'gds' | 'portal' | 'canvas'; daysAgo: number }[] = [
  { id: 'gds', daysAgo: 2 },
  { id: 'portal', daysAgo: 9 },
  { id: 'canvas', daysAgo: 21 },
];

export const FORUM: { id: 'restnota' | 'canvas' | 'strip' | 'reminders'; replies: number; daysAgo: number }[] = [
  { id: 'restnota', replies: 6, daysAgo: 1 },
  { id: 'canvas', replies: 3, daysAgo: 2 },
  { id: 'strip', replies: 9, daysAgo: 5 },
  { id: 'reminders', replies: 4, daysAgo: 8 },
];

/** The starter guide: what a new practice sets up first, and the screen where it happens. */
export type StarterStep = 'clinic' | 'locations' | 'team' | 'treatments' | 'vecozo' | 'portal' | 'reminders' | 'import';
export const STARTER: { id: StarterStep; screen: ScreenId; feature?: string; done: boolean }[] = [
  { id: 'clinic', screen: 'instellingen', feature: 'u.clinic', done: true },
  { id: 'locations', screen: 'instellingen', feature: 't.locations', done: true },
  { id: 'team', screen: 'team', feature: 's.employees', done: true },
  { id: 'treatments', screen: 'instellingen', feature: 'u.treatments', done: true },
  { id: 'vecozo', screen: 'instellingen', feature: 'w.vecozo', done: true },
  { id: 'portal', screen: 'portaal', done: false },
  { id: 'reminders', screen: 'berichten', feature: 'q.reminders', done: false },
  { id: 'import', screen: 'instellingen', feature: 'v.import', done: false },
];

/* ---------- Import ---------- */

export const IMPORT_SOURCES = ['practice', 'excel', 'other'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_FIELDS = ['first', 'last', 'birth', 'email', 'phone', 'bsn', 'policy', 'skip'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/**
 * The columns of the sample export file the demo pretends to read, as a Dutch practice would export them; they are
 * data from the file, so they are not translated.
 */
export const IMPORT_COLUMNS: { column: string; field: ImportField; sample: string }[] = [
  { column: 'Voornaam', field: 'first', sample: 'Emma' },
  { column: 'Achternaam', field: 'last', sample: 'Bakker' },
  { column: 'Geb.datum', field: 'birth', sample: '14-03-1991' },
  { column: 'E-mail', field: 'email', sample: 'emma.bakker@example.com' },
  { column: 'Mobiel', field: 'phone', sample: '06 0000 4821' },
  { column: 'BSN', field: 'bsn', sample: '999990019' },
  { column: 'Polisnr', field: 'policy', sample: 'T48211907' },
  { column: 'Opmerking', field: 'skip', sample: '…' },
];
