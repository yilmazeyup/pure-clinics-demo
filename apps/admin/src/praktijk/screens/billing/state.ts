import { addDays, type LocationId } from '@pure-clinics/shared';

import { useI18n } from '../../../i18n';
import { usePraktijk, useShared, type ApptRef } from '../../context';
import { clientFor, type StaffId } from '../../data/core';
import {
  claimFrom,
  DEFAULT_LAYOUT,
  episodeFor,
  lineFor,
  nextNumber,
  outcome,
  payerFor,
  round2,
  seedBilling,
  totals,
  type CashBooking,
  type CashCheck,
  type Claim,
  type GiftUse,
  type Invoice,
  type InvoiceLayout,
  type InvoiceLine,
  type Payment,
  type StripCard,
} from '../../data/billing';
import { seedGiftCards, type GiftCard, type StockLevels } from '../../data/shared';
import { stockAt } from '../../data/stock';

/**
 * Everything at the desk, shared by Facturen & kassa and Declaraties: invoices, claims, gift and strip cards, stock and
 * the cash drawer, with the actions that keep them consistent (a final insured invoice becomes a claim, a product
 * credit puts the stock back, a gift card is valid once its invoice is final).
 */
export function useBilling() {
  const { today, now, demo } = usePraktijk();
  const { t } = useI18n();
  const seed = () => seedBilling(today, now);
  const [invoices, setInvoices] = useShared<Invoice[]>('invoices', () => seed().invoices);
  const [claims, setClaims] = useShared<Claim[]>('claims', () => seed().claims);
  const [giftcards, setGiftcards] = useShared<GiftCard[]>('giftcards', () => seedGiftCards(today));
  const [giftUses, setGiftUses] = useShared<Record<string, GiftUse[]>>('giftUses', () => seed().giftUses);
  const [stock, setStock] = useShared<StockLevels>('stock', () => stockAt(now));
  const [strips, setStrips] = useShared<StripCard[]>('strips', () => seed().strips);
  const [bookings, setBookings] = useShared<CashBooking[]>('cashBookings', () => seed().bookings);
  const [checks, setChecks] = useShared<CashCheck[]>('cashChecks', () => seed().checks);
  const [closures, setClosures] = useShared<{ locationId: LocationId; day: string; at: Date }[]>('closures', () => []);
  const [layout, setLayout] = useShared<InvoiceLayout>('invoiceLayout', () => DEFAULT_LAYOUT);

  const update = (id: string, change: (inv: Invoice) => Invoice) => setInvoices((list) => list.map((i) => (i.id === id ? change(i) : i)));

  /** Moves product units on or off the shelf of a location. */
  const moveStock = (locationId: LocationId, lines: InvoiceLine[], sign: 1 | -1) =>
    setStock((levels) => {
      const next = { ...levels, [locationId]: { ...levels[locationId] } };
      for (const l of lines) if (l.ref.type === 'product') next[locationId][l.ref.id] = Math.max(0, (next[locationId][l.ref.id] ?? 0) + sign * l.qty);
      return next;
    });

  /** One invoice per episode: a second treatment of the same episode today joins the concept that is already open. */
  const invoiceAppt = (appt: ApptRef): string => {
    const client = clientFor(appt.client, appt.clinic, today);
    const episode = episodeFor(client, appt.treatment);
    const line: InvoiceLine = { ...lineFor({ type: 'treatment', id: appt.treatment }), unit: appt.price, appt: appt.id };
    const existing = invoices.find(
      (i) => i.status === 'concept' && i.clientId === client.id && i.episode?.condition === episode.condition && !i.lines.some((l) => l.appt === appt.id),
    );
    if (existing) {
      update(existing.id, (inv) => ({ ...inv, lines: [...inv.lines, line] }));
      return existing.id;
    }
    const already = invoices.find((i) => i.lines.some((l) => l.appt === appt.id));
    if (already) return already.id;
    const id = `inv-new-${Date.now()}`;
    const invoice: Invoice = {
      id,
      number: null,
      kind: 'invoice',
      status: 'concept',
      payer: appt.price === 0 ? 'client' : payerFor(client, appt.treatment, 0),
      clientId: client.id,
      short: client.short,
      client: `${client.first} ${client.last}`,
      locationId: appt.clinic,
      practitioner: appt.specialistId,
      date: appt.end,
      lines: [line],
      discount: { mode: 'pct', value: 0 },
      payments: [],
      episode,
      apptId: appt.id,
    };
    setInvoices((list) => [...list, invoice]);
    return id;
  };

  /** A new empty concept, e.g. for products only. */
  const newInvoice = (kind: Invoice['kind'], locationId: LocationId, short: string, lines: InvoiceLine[] = []): Invoice => {
    const client = clientFor(short, locationId, today);
    const invoice: Invoice = {
      id: `inv-new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: null,
      kind,
      status: 'concept',
      payer: 'client',
      clientId: client.id,
      short: client.short,
      client: `${client.first} ${client.last}`,
      locationId,
      practitioner: null,
      date: now,
      lines,
      discount: { mode: 'pct', value: 0 },
      payments: [],
      episode: null,
    };
    return invoice;
  };

  /**
   * Makes a concept final: the next number, and then by payer: a claim for a contracted insurer, a restitutienota for
   * the client, or an open invoice. Gift cards sold on it become valid.
   */
  const finalize = (id: string): Invoice | null => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv || inv.status !== 'concept') return null;
    const number = nextNumber(invoices, today.getFullYear());
    const total = totals(inv).total;
    const final: Invoice = {
      ...inv,
      number,
      date: inv.date > now ? now : inv.date,
      kind: inv.payer === 'restitutie' && inv.kind === 'invoice' ? 'restitutie' : inv.kind,
      status: inv.payer === 'insurer' ? 'insurer' : total <= 0 ? 'paid' : 'open',
    };
    setInvoices((list) => list.map((i) => (i.id === id ? final : i)));
    if (final.payer === 'insurer') {
      const client = clientFor(inv.short, inv.locationId, today);
      setClaims((list) => [...list, claimFrom(final, client, `cl-${final.id}`)]);
    }
    const codes = inv.lines.flatMap((l) => (l.ref.type === 'giftcard' ? [l.ref.code] : []));
    if (codes.length) setGiftcards((cards) => cards.map((c) => (codes.includes(c.code) ? { ...c, final: true, invoice: number } : c)));
    return final;
  };

  /** Registers payments; "on account" leaves the invoice open, to be paid by transfer. Gift cards lose their part. */
  const pay = (id: string, payments: Payment[], onAccount = false, number?: string) => {
    const inv = invoices.find((i) => i.id === id);
    const gift = payments.filter((p) => p.method === 'gift' && p.code);
    if (gift.length) {
      setGiftcards((cards) => cards.map((c) => (gift.some((g) => g.code === c.code) ? { ...c, balance: round2(c.balance - gift.find((g) => g.code === c.code)!.amount) } : c)));
      setGiftUses((uses) => {
        const next = { ...uses };
        for (const g of gift) next[g.code!] = [...(next[g.code!] ?? []), { date: now, amount: g.amount, invoice: number ?? inv?.number ?? '' }];
        return next;
      });
    }
    update(id, (i) => {
      const all = [...i.payments, ...payments];
      const paid = all.reduce((s, p) => s + p.amount, 0);
      return { ...i, payments: all, onAccount: onAccount || i.onAccount, status: !onAccount && paid >= totals(i).total - 0.004 ? 'paid' : i.status };
    });
  };

  /** A credit invoice for the chosen lines, final at once; credited products go back on the shelf. */
  const credit = (id: string, keys: string[]): Invoice | null => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv || !keys.length) return null;
    const sums = totals(inv);
    const factor = sums.gross ? sums.total / sums.gross : 1;
    const lines = inv.lines.filter((l) => keys.includes(l.key)).map((l) => ({ ...l, key: `${l.key}-cr`, qty: -l.qty, unit: round2(l.unit * factor) }));
    const creditInv: Invoice = {
      ...inv,
      id: `cr-${inv.id}-${Date.now()}`,
      number: nextNumber(invoices, today.getFullYear()),
      kind: 'credit',
      status: 'paid',
      date: now,
      lines,
      discount: { mode: 'pct', value: 0 },
      payments: [],
      creditOf: inv.number ?? undefined,
      reminded: undefined,
      onAccount: false,
    };
    // A paid invoice is refunded the way it was paid; an open one simply closes.
    const refund = lines.reduce((s, l) => s + l.qty * l.unit, 0);
    if (inv.status === 'paid') creditInv.payments = [{ method: inv.payments[0]?.method ?? 'pin', amount: round2(refund), at: now }];
    const all = keys.length === inv.lines.length;
    setInvoices((list) => [...list.map((i) => (i.id === id ? { ...i, status: all ? ('credited' as const) : i.status } : i)), creditInv]);
    if (lines.some((l) => l.ref.type === 'product')) {
      moveStock(inv.locationId, inv.lines.filter((l) => keys.includes(l.key)), 1);
      demo(t('pk.facturen.credit.stockBack'));
    }
    return creditInv;
  };

  /** The part a partly approved claim did not cover: a restnota for the client, open on account. */
  const restnota = (claimId: string) => {
    const claim = claims.find((c) => c.id === claimId);
    if (!claim || claim.approved === null) return;
    const rest = round2(claim.amount - claim.approved);
    const client = clientFor(claim.short, claim.locationId, today);
    const inv: Invoice = {
      ...newInvoice('restnota', claim.locationId, claim.short, [{ ...lineFor({ type: 'treatment', id: claim.treatment }), unit: rest, vat: 0 }]),
      number: nextNumber(invoices, today.getFullYear()),
      status: 'open',
      onAccount: true,
      practitioner: claim.practitioner as StaffId,
      episode: { condition: episodeFor(client, claim.treatment).condition, zt: claim.zt, start: claim.start, diagnosis: claim.diagnosis },
      creditOf: claim.invoiceNumber ?? undefined,
    };
    setInvoices((list) => [...list, inv]);
    setClaims((list) => list.map((c) => (c.id === claimId ? { ...c, rest: 'nota' } : c)));
    return inv;
  };

  const updateClaim = (id: string, patch: Partial<Claim>) => setClaims((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** Hands claims to Vecozo; the insurer's answer comes back later through `answer`. */
  const sendClaims = (ids: string[], batch: string) =>
    setClaims((list) => list.map((c) => (ids.includes(c.id) ? { ...c, status: 'sent', batch, sentAt: now } : c)));

  /** The insurer's return information for claims that were sent; returns how many were approved, partly or rejected. */
  const answer = (ids: string[], sent: Claim[]) => {
    const counts = { approved: 0, partial: 0, rejected: 0 };
    const answers = new Map<string, ReturnType<typeof outcome>>();
    for (const c of sent) {
      if (!ids.includes(c.id)) continue;
      const o = outcome(c);
      answers.set(c.id, o);
      counts[o.status === 'approved' ? 'approved' : o.status === 'partial' ? 'partial' : 'rejected']++;
    }
    setClaims((list) => list.map((c) => (answers.has(c.id) && c.status === 'sent' ? { ...c, ...answers.get(c.id)! } : c)));
    return counts;
  };

  /** A credit line to the insurer: the whole claim, or the part it did not pay. */
  const creditClaim = (id: string, part: 'all' | 'rest') => {
    const claim = claims.find((c) => c.id === id);
    if (!claim) return;
    const amount = part === 'rest' ? round2(claim.amount - (claim.approved ?? 0)) : claim.status === 'rejected' ? claim.amount : (claim.approved ?? claim.amount);
    const creditLine: Claim = {
      ...claim,
      id: `${claim.id}-cr-${Date.now()}`,
      side: 'credit',
      amount: -amount,
      approved: null,
      // A rejected claim was never paid: the credit only closes it in the books, nothing goes to Vecozo.
      status: claim.status === 'rejected' && part === 'all' ? 'approved' : 'ready',
      reason: null,
      batch: null,
      sentAt: null,
      creditOf: claim.id,
      resubmitOf: null,
    };
    setClaims((list) => [...list.map((c) => (c.id === id ? (part === 'rest' ? { ...c, restCredited: true } : { ...c, status: 'credited' as const }) : c)), creditLine]);
  };

  /** After a correction, the claim goes out again as a new debit line; the old one is marked as re-submitted. */
  const resubmit = (id: string) => {
    const claim = claims.find((c) => c.id === id);
    if (!claim) return;
    const again: Claim = { ...claim, id: `${claim.id}-r${Date.now()}`, status: 'ready', reason: null, approved: null, batch: null, sentAt: null, resubmitOf: claim.id };
    setClaims((list) => [...list.map((c) => (c.id === id ? { ...c, status: 'resubmitted' as const } : c)), again]);
    return again;
  };

  return {
    invoices,
    setInvoices,
    update,
    claims,
    setClaims,
    giftcards,
    setGiftcards,
    giftUses,
    stock,
    moveStock,
    strips,
    setStrips,
    bookings,
    setBookings,
    checks,
    setChecks,
    closures,
    setClosures,
    layout,
    setLayout,
    invoiceAppt,
    newInvoice,
    finalize,
    pay,
    credit,
    restnota,
    updateClaim,
    sendClaims,
    answer,
    creditClaim,
    resubmit,
  };
}

export type Billing = ReturnType<typeof useBilling>;

/** Days between two moments, in whole days. */
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

/** The due date of an invoice: its date plus the payment term of the layout. */
export const dueDate = (inv: Invoice, term: number) => addDays(inv.date, term);
