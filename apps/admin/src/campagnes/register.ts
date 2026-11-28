import { dateKey, startOfDay } from '@pure-clinics/shared';
import { useMemo } from 'react';

import { useSharedValue } from '../data/sharedStore';
import { seedBilling, type Invoice } from '../praktijk/data/billing';
import { registerOf, seedDuplicates, type Duplicates } from '../praktijk/data/clients';
import { practiceClients, type PracticeClient } from '../praktijk/data/core';
import { AUDIENCE, SEGMENTS, type BackFlow, type Contact, type EmailStatus, type Segment, type SegmentId } from './data';

// The contacts, the audience and the segments of Campagnes, worked out from the client register as Huidly keeps it
// (Cliënten in Kliniek: praktijk/data/clients.ts registerOf, from the same pieces in data/sharedStore.ts) and from its
// invoices: who gave consent for the newsletter, e-mail and SMS, where she comes, whether she is a member, what she is
// treated for and what she bought. Nothing here is a number of its own: a client added, changed or removed in Kliniek
// changes these counts.

/** The client register, the same list as Cliënten in Kliniek. */
export function useRegister(now: Date): PracticeClient[] {
  const dayKey = dateKey(now);
  const today = useMemo(() => startOfDay(now), [dayKey]);
  const base = useMemo(() => practiceClients(today), [today]);
  const added = useSharedValue<PracticeClient[]>('clients');
  const storedDups = useSharedValue<Duplicates>('clients:duplicates');
  const dups = useMemo(() => storedDups ?? seedDuplicates(base, today), [storedDups, base, today]);
  const edits = useSharedValue<Record<string, Partial<PracticeClient>>>('clients:edits');
  const removed = useSharedValue<string[]>('clients:removed');
  return useMemo(() => registerOf(base, added ?? [], dups, edits ?? {}, removed ?? []), [base, added, dups, edits, removed]);
}

/** The invoices as Kliniek has them: stored at Huidly once someone changed them, the built-in ones until then. */
export function useInvoices(now: Date): Invoice[] {
  const stored = useSharedValue<Invoice[]>('invoices');
  const dayKey = dateKey(now);
  return useMemo(() => stored ?? seedBilling(startOfDay(now), now).invoices, [stored, dayKey]);
}

const emailStatusOf = (c: PracticeClient): EmailStatus => (c.flags.newsletter ? 'subscribed' : c.flags.email ? 'transactional' : 'unsubscribed');

/** Which segments a client is in, by the segment's rule. */
function tagsOf(c: PracticeClient, zo: Set<string>, gift: Set<string>): SegmentId[] {
  const tags: SegmentId[] = [];
  if (c.member) tags.push('app2000', 'members');
  if (c.episodes.some((e) => e.condition === 'acne')) tags.push('acne');
  if (c.episodes.some((e) => e.condition === 'pigment')) tags.push('pigment');
  if (zo.has(c.id)) tags.push('zo');
  if (gift.has(c.id)) tags.push('gift');
  tags.push(c.locationId);
  if (c.flags.sms) tags.push('sms');
  return tags;
}

export type Audience = typeof AUDIENCE;

/** The audience, the segments and the contacts of Campagnes, all from the register and the invoices. */
export function campaignData(register: PracticeClient[], invoices: Invoice[], today: Date) {
  const buyers = (test: (inv: Invoice) => boolean) => new Set(invoices.filter(test).map((i) => i.clientId));
  const zo = buyers((i) => i.lines.some((l) => l.ref.type === 'product' && l.ref.id.startsWith('zo-')));
  const gift = buyers((i) => i.lines.some((l) => l.ref.type === 'giftcard'));
  const tagged = register.map((c) => ({ c, tags: tagsOf(c, zo, gift), email: emailStatusOf(c) }));

  const audience: Audience = {
    subscribed: tagged.filter((x) => x.email === 'subscribed').length,
    unsubscribed: tagged.filter((x) => x.email === 'unsubscribed').length,
    // Mailchimp's own states: Huidly does not know of bounced or unconfirmed addresses, so there are none.
    cleaned: 0,
    pending: 0,
    transactional: tagged.filter((x) => x.email === 'transactional').length,
    sms: register.filter((c) => c.flags.sms).length,
    smsUnsubscribed: 0,
  };

  const segments: Segment[] = SEGMENTS.map((s) => {
    const inside = tagged.filter((x) => x.tags.includes(s.id));
    return {
      ...s,
      count: inside.length,
      email: inside.filter((x) => x.email === 'subscribed').length,
      sms: inside.filter((x) => x.c.flags.sms).length,
      lag: 0,
    };
  });

  // The newest clients first: the ones a sync would have brought in last.
  const contacts: Contact[] = [...tagged]
    .sort((a, b) => b.c.since.getTime() - a.c.since.getTime())
    .map(({ c, tags, email }) => ({
      id: c.id,
      first: c.first,
      last: c.last,
      email: c.email,
      phone: c.phone,
      birthday: `${String(c.birth.getMonth() + 1).padStart(2, '0')}/${String(c.birth.getDate()).padStart(2, '0')}`,
      location: c.locationId,
      tags,
      emailStatus: email,
      smsStatus: c.flags.sms ? 'subscribed' : 'none',
      confirmedDaysAgo: email === 'subscribed' ? Math.max(0, Math.round((today.getTime() - c.since.getTime()) / 86400000)) : null,
    }));

  // What came back: the clients who said no to the newsletter or to SMS, as their file in Kliniek says.
  const backflow: BackFlow[] = contacts
    .filter((c) => c.emailStatus === 'unsubscribed')
    .slice(0, 4)
    .map((c, i) => ({ id: `f-${c.id}`, contact: c.id, kind: 'unsubscribe', minutesAgo: 60 * (6 + i * 19), campaign: null }));

  return { audience, segments, contacts, backflow };
}
