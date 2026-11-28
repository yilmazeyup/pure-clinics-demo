import { addDays, type LocationId } from '@pure-clinics/shared';

import { between, personName, pick, rng } from '../../data/random';
import { clientFor, elevenTest, INSURERS, testBsn, type InsurerId, type PracticeClient } from './core';

// The client register of Pure Praktijk: the message log on a client card, the duplicates the register spots, and the
// simulated COV check through Vecozo. Every person here is made up; BSNs are 9999… test numbers.

/* ---------- Sent messages ---------- */

export type Channel = 'email' | 'sms' | 'whatsapp';
export type Subject = 'confirm' | 'reminder' | 'intake' | 'aftercare' | 'newsletter' | 'invoice' | 'review';
export type Delivery = 'delivered' | 'opened' | 'failed';
export type SentMessage = { id: string; at: Date; channel: Channel; subject: Subject; status: Delivery };

/** What the practice sent this client lately, newest first; follows her reminder and newsletter choices. */
export function messageLog(client: PracticeClient, today: Date): SentMessage[] {
  const r = rng(`pk-log-${client.id}`);
  const out: SentMessage[] = [];
  let day = addDays(today, -between(r, 0, 3));
  const count = between(r, 5, 9);
  for (let i = 0; i < count; i++) {
    const options: Subject[] = ['confirm', 'reminder', 'aftercare', 'invoice', 'review', 'intake'];
    if (client.flags.newsletter) options.push('newsletter', 'newsletter');
    const subject = pick(r, options);
    const channel: Channel =
      subject === 'reminder' ? (client.flags.sms ? pick(r, ['sms', 'whatsapp'] as const) : 'email') : subject === 'review' && r() < 0.4 ? 'whatsapp' : 'email';
    const at = new Date(day);
    at.setHours(subject === 'reminder' ? 3 : between(r, 9, 18), subject === 'reminder' ? 0 : pick(r, [0, 12, 24, 41, 55]), 0, 0);
    const status: Delivery = r() < 0.06 ? 'failed' : channel === 'email' && r() < 0.6 ? 'opened' : 'delivered';
    out.push({ id: `${client.id}-m${i}`, at, channel, subject, status });
    day = addDays(day, -between(r, 2, 21));
  }
  return out;
}

/* ---------- Membership ---------- */

/** Members of the app since a date after they became a client. */
export function memberSince(client: PracticeClient, today: Date): Date {
  const r = rng(`pk-member-${client.id}`);
  const span = Math.max(1, Math.round((today.getTime() - client.since.getTime()) / 86400000));
  return addDays(client.since, Math.min(span - 1, between(r, 0, Math.min(span, 420))));
}

/* ---------- Duplicates ---------- */

export type DuplicatePair = { a: string; b: string; reasons: ('birth' | 'name' | 'email')[] };

const SECOND = ['de Wit', 'Smits', 'Kramer'];

/**
 * A few clients who booked online a second time with a slightly different name or email: the register keeps them
 * apart until someone merges them. The copies have no BSN and no episodes, as after an online booking.
 */
export function seedDuplicates(base: PracticeClient[], today: Date): { clients: PracticeClient[]; pairs: DuplicatePair[] } {
  const r = rng('pk-duplicates');
  const pool = base.filter((c) => c.episodes.length > 0);
  const clients: PracticeClient[] = [];
  const pairs: DuplicatePair[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 3 && pool.length; i++) {
    let original = pick(r, pool);
    for (let tries = 0; used.has(original.id) && tries < 20; tries++) original = pick(r, pool);
    if (used.has(original.id)) break;
    used.add(original.id);
    const variant = i % 3;
    const last = variant === 0 ? `${original.last}-${SECOND[i]}` : original.last;
    const first = variant === 1 ? original.first.slice(0, -1) + original.first.slice(-1).repeat(2) : original.first;
    const email =
      variant === 2
        ? `${original.first[0].toLowerCase()}.${original.email.split('@')[0].split('.').pop()}@example.com`
        : original.email.replace('@', variant === 0 ? '1@' : '@');
    const copy: PracticeClient = {
      ...original,
      id: `${original.id}-dup`,
      first,
      last,
      email,
      phone: `06 0000 ${String(between(r, 1000, 9999))}`,
      bsn: '',
      policy: variant === 1 ? original.policy : '',
      since: addDays(today, -between(r, 1, 20)),
      cameVia: 'website',
      member: false,
      allergies: [],
      episodes: [],
      flags: { newsletter: false, sms: true, email: true, share: false },
    };
    clients.push(copy);
    const reasons: DuplicatePair['reasons'] = ['birth'];
    if (variant !== 2) reasons.push('name');
    if (variant !== 1) reasons.push('email');
    pairs.push({ a: original.id, b: copy.id, reasons });
  }
  return { clients, pairs };
}

/* ---------- COV check through Vecozo (simulated) ---------- */

export type CovMethod = 'bsn' | 'policy' | 'postcode';
export type CovQuery = { birth: Date; method: CovMethod; bsn: string; policy: string; postcode: string; house: string };
export type CovPerson = {
  first: string;
  last: string;
  street: string;
  postcode: string;
  city: string;
  insurer: InsurerId;
  policy: string;
  bsn: string;
};
export type CovResult = { ok: true; person: CovPerson; duplicate: PracticeClient | null } | { ok: false; reason: 'bsn' | 'empty' };

const normal = (text: string) => text.replace(/\s+/g, '').toUpperCase();

/**
 * What Vecozo would answer: the insured person behind a BSN, policy number or postcode. A number that is already in
 * the register returns that person, so the duplicate warning shows; anything else returns a made-up person.
 */
export function covCheck(query: CovQuery, known: PracticeClient[], locationId: LocationId, today: Date): CovResult {
  const value = query.method === 'bsn' ? query.bsn.trim() : query.method === 'policy' ? query.policy.trim() : `${normal(query.postcode)}${query.house.trim()}`;
  if (!value) return { ok: false, reason: 'empty' };
  if (query.method === 'bsn' && !elevenTest(value)) return { ok: false, reason: 'bsn' };

  const existing =
    query.method === 'bsn'
      ? known.find((c) => c.bsn === value)
      : query.method === 'policy'
        ? known.find((c) => normal(c.policy) === normal(value))
        : undefined;
  if (existing) {
    const person: CovPerson = { ...existing, insurer: existing.insurer };
    return { ok: true, person, duplicate: existing };
  }

  const r = rng(`pk-cov-${query.method}-${value}`);
  const names = new Set(known.map((c) => c.short));
  let short = personName(r);
  for (let i = 0; names.has(short) && i < 30; i++) short = personName(r);
  const template = clientFor(short, locationId, today);
  const person: CovPerson = {
    first: template.first,
    last: template.last,
    street: query.method === 'postcode' ? `${template.street.replace(/\s\d+$/, '')} ${query.house.trim()}` : template.street,
    postcode: query.method === 'postcode' ? formatPostcode(query.postcode) : template.postcode,
    city: template.city,
    insurer: pick(r, INSURERS).id,
    policy: query.method === 'policy' ? value : `T${between(r, 10000000, 99999999)}`,
    bsn: query.method === 'bsn' ? value : testBsn(r),
  };
  const duplicate = known.find((c) => c.first === person.first && c.last === person.last && c.birth.getTime() === query.birth.getTime()) ?? null;
  return { ok: true, person, duplicate };
}

/** "6521ab" → "6521 AB". */
export function formatPostcode(text: string): string {
  const v = normal(text);
  return /^\d{4}[A-Z]{2}$/.test(v) ? `${v.slice(0, 4)} ${v.slice(4)}` : text.trim();
}

/** A new, empty client file from a COV answer. */
export function newClient(person: CovPerson, birth: Date, extra: Pick<PracticeClient, 'locationId' | 'cameVia' | 'flags' | 'email' | 'phone'>, today: Date): PracticeClient {
  return {
    id: `new-${person.bsn || Date.now().toString(36)}`,
    short: `${person.first} ${person.last[0]}.`,
    first: person.first,
    last: person.last,
    birth,
    email: extra.email,
    phone: extra.phone,
    bsn: person.bsn,
    insurer: person.insurer,
    policy: person.policy,
    street: person.street,
    postcode: person.postcode,
    city: person.city,
    locationId: extra.locationId,
    since: today,
    cameVia: extra.cameVia,
    flags: extra.flags,
    member: false,
    allergies: [],
    episodes: [],
  };
}

/** Parses dd-mm-jjjj (or d-m-jjjj, with / or .) into a date; null when it is not a real day. */
export function parseDmy(text: string): Date | null {
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const date = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return date.getDate() === Number(m[1]) && date.getMonth() === Number(m[2]) - 1 ? date : null;
}

export type Duplicates = { clients: PracticeClient[]; pairs: DuplicatePair[] };

/**
 * The client register as Cliënten shows it: everyone in the agenda's window, the duplicates waiting to be merged and the
 * clients added by hand, with the edits and removals applied. The business's own admin builds the very same list from
 * the same pieces kept at Huidly (clients, clients:duplicates, clients:edits, clients:removed).
 */
export function registerOf(
  base: PracticeClient[],
  added: PracticeClient[],
  dups: Duplicates,
  edits: Record<string, Partial<PracticeClient>>,
  removed: string[],
): PracticeClient[] {
  const gone = new Set(removed);
  const all = [...added, ...base, ...dups.clients].filter((c) => !gone.has(c.id));
  return all.map((c) => (edits[c.id] ? { ...c, ...edits[c.id] } : c));
}
