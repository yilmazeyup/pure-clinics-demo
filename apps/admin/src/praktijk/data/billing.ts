import {
  addDays,
  dateKey,
  LASER_ZONES,
  openingHours,
  PRODUCTS,
  startOfDay,
  treatmentById,
  type LocationId,
  type ProductId,
  type TreatmentId,
} from '@pure-clinics/shared';

import { between, pick, rng } from '../../data/random';
import {
  agendaDay,
  clientFor,
  codesOf,
  conditionOf,
  insurerById,
  type ConditionId,
  type InsurerId,
  type PracticeClient,
  type StaffId,
} from './core';
import { seedGiftCards, type GiftCard } from './shared';

// Invoices, payments, insurer claims and the cash drawer of Pure Praktijk. Facturen & kassa and Declaraties share them
// through useShared('invoices' | 'claims' | …), so an insured invoice made final in one shows up as a claim in the other.
// Every person is fictional; amounts follow the clinic's own prices from @pure-clinics/shared.

/* ---------- Invoices ---------- */

export type PayMethod = 'pin' | 'cash' | 'account' | 'debit' | 'credit' | 'ideal' | 'gift';
/** The methods at the desk; a gift card is the seventh, chosen with its code. */
export const PAY_METHODS: Exclude<PayMethod, 'gift'>[] = ['pin', 'cash', 'account', 'debit', 'credit', 'ideal'];

export type LineRef =
  | { type: 'treatment'; id: TreatmentId }
  | { type: 'product'; id: ProductId }
  /** A laser package for one zone: pay for five, the sixth is free; sold like a product. */
  | { type: 'package'; zone: string }
  | { type: 'giftcard'; code: string }
  | { type: 'strip'; id: TreatmentId; strips: number };

/** `appt` links a treatment line to the agenda appointment it bills, so the agenda knows it is invoiced. */
export type InvoiceLine = { key: string; ref: LineRef; qty: number; unit: number; vat: 0 | 21; appt?: string };

export type InvoiceKind = 'invoice' | 'restitutie' | 'credit' | 'restnota' | 'products';
/** Who pays: the client, the client with a restitutienota for her insurer, or the insurer directly through Vecozo. */
export type Payer = 'client' | 'restitutie' | 'insurer';
export type InvoiceStatus = 'concept' | 'open' | 'paid' | 'insurer' | 'credited' | 'writtenOff';

export type Payment = { method: PayMethod; amount: number; at: Date; code?: string };

export type EpisodeRef = { condition: ConditionId; zt: string; start: Date; diagnosis: string };

export type Invoice = {
  id: string;
  /** Null while it is a concept; final invoices get the next number of the year. */
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  payer: Payer;
  clientId: string;
  short: string;
  client: string;
  locationId: LocationId;
  practitioner: StaffId | null;
  date: Date;
  lines: InvoiceLine[];
  discount: { mode: 'pct' | 'eur'; value: number };
  payments: Payment[];
  episode: EpisodeRef | null;
  apptId?: string;
  creditOf?: string;
  reminded?: Date;
  /** Left open on purpose: paid later by bank transfer. */
  onAccount?: boolean;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Subtotal, discount, total, VAT per rate (prices include VAT), paid and still open. */
export function totals(inv: Invoice) {
  const gross = round2(inv.lines.reduce((s, l) => s + l.qty * l.unit, 0));
  const discount = round2(
    gross <= 0 ? 0 : inv.discount.mode === 'pct' ? (gross * Math.min(100, Math.max(0, inv.discount.value))) / 100 : Math.min(Math.max(0, inv.discount.value), gross),
  );
  const total = round2(gross - discount);
  const factor = gross ? total / gross : 1;
  const vat: Record<0 | 21, number> = { 0: 0, 21: 0 };
  for (const l of inv.lines) vat[l.vat] += (l.qty * l.unit * factor * l.vat) / (100 + l.vat);
  const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
  const open = inv.status === 'open' ? round2(total - paid) : 0;
  return { gross, discount, total, vat21: round2(vat[21]), net: round2(total - vat[21]), paid, open };
}

/** The next invoice number of the year: 2026-0948 after 2026-0947. */
export function nextNumber(invoices: Invoice[], year: number): string {
  const max = invoices.reduce((m, i) => {
    const match = i.number && new RegExp(`^${year}-(\\d+)$`).exec(i.number);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${year}-${String(max + 1).padStart(4, '0')}`;
}

/* ---------- Products, packages and barcodes ---------- */

/** An EAN-13 in the 200 range, which shops use for their own items: never a real product's code. */
function ean(prefix: string, n: number): string {
  const body = `${prefix}${String(n).padStart(12 - prefix.length, '0')}`;
  const sum = body.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

export const PRODUCT_EAN: Record<ProductId, string> = Object.fromEntries(PRODUCTS.map((p, i) => [p.id, ean('20004', i + 1)])) as Record<ProductId, string>;

/** The laser zones sold as a 5+1 package at the desk. */
export const PACKAGE_ZONES = LASER_ZONES.filter((z) => ['armpits', 'upperlip', 'bikini', 'halflegs', 'legs'].includes(z.id));
export const PACKAGE_EAN: Record<string, string> = Object.fromEntries(PACKAGE_ZONES.map((z, i) => [z.id, ean('20005', i + 1)]));
/** Five sessions paid, six given: packagePrice() per session times six. */
export const packageTotal = (zone: string) => (LASER_ZONES.find((z) => z.id === zone)?.price ?? 0) * 5;

export function lineFor(ref: LineRef, qty = 1): InvoiceLine {
  const key = `${ref.type}-${Math.random().toString(36).slice(2, 9)}`;
  switch (ref.type) {
    case 'treatment': {
      const t = treatmentById(ref.id);
      return { key, ref, qty, unit: t.priceFrom, vat: codesOf(t).vat };
    }
    case 'product':
      return { key, ref, qty, unit: PRODUCTS.find((p) => p.id === ref.id)?.price ?? 0, vat: 21 };
    case 'package':
      return { key, ref, qty, unit: packageTotal(ref.zone), vat: 21 };
    case 'giftcard':
      // A gift card is a voucher, not a sale yet: VAT is due when it is spent.
      return { key, ref, qty, unit: 0, vat: 0 };
    case 'strip': {
      const t = treatmentById(ref.id);
      return { key, ref, qty, unit: t.priceFrom * (ref.strips - 1), vat: codesOf(t).vat };
    }
  }
}

/** Finds a product or package by its barcode. */
export function byBarcode(code: string): LineRef | null {
  const clean = code.replace(/\D/g, '');
  const product = (Object.keys(PRODUCT_EAN) as ProductId[]).find((id) => PRODUCT_EAN[id] === clean);
  if (product) return { type: 'product', id: product };
  const zone = Object.keys(PACKAGE_EAN).find((z) => PACKAGE_EAN[z] === clean);
  return zone ? { type: 'package', zone } : null;
}

/* ---------- Claims ---------- */

export type ClaimStatus = 'ready' | 'sent' | 'approved' | 'partial' | 'rejected' | 'credited' | 'resubmitted';

/** Return codes as they come back from the insurer (demo codes in the style of Vecozo's retour information). */
export type ReasonCode = '8016' | '8264' | '8462' | '8091' | '8521' | '8530';
export const REASONS: ReasonCode[] = ['8016', '8264', '8462', '8091', '8521', '8530'];

export type Claim = {
  id: string;
  side: 'debit' | 'credit';
  invoiceId: string | null;
  invoiceNumber: string | null;
  clientId: string;
  short: string;
  client: string;
  bsn: string;
  insurer: InsurerId;
  locationId: LocationId;
  practitioner: StaffId;
  /** The day the treatment was given. */
  date: Date;
  treatment: TreatmentId;
  prestatie: string;
  aanspraak: string;
  diagnosis: string;
  zt: string;
  /** Start of the care trajectory; must lie on or before the service date. */
  start: Date;
  /** Care begun at another practice: aanspraakcode 008 with the start date there. */
  code008: boolean;
  entitlementStart: Date | null;
  amount: number;
  approved: number | null;
  status: ClaimStatus;
  reason: ReasonCode | null;
  batch: string | null;
  sentAt: Date | null;
  creditOf: string | null;
  resubmitOf: string | null;
  /** What happened to the part an insurer did not pay: billed to the client as a restnota, or written off. */
  rest: 'nota' | 'writtenOff' | null;
  restCredited: boolean;
};

/** The insurer's answer: start date after the service date is always rejected; otherwise mostly approved. */
export function outcome(c: Claim): Pick<Claim, 'status' | 'approved' | 'reason'> {
  if (c.side === 'credit') return { status: 'approved', approved: c.amount, reason: null };
  if (c.start.getTime() > startOfDay(c.date).getTime() + 86_399_000) return { status: 'rejected', approved: 0, reason: '8016' };
  const r = rng(`outcome-${c.id}`)();
  if (r < 0.7) return { status: 'approved', approved: c.amount, reason: null };
  if (r < 0.86) return { status: 'partial', approved: round2(c.amount * (r < 0.78 ? 0.75 : 0.8)), reason: r < 0.78 ? '8521' : '8530' };
  return { status: 'rejected', approved: 0, reason: pick(rng(`reason-${c.id}`), ['8264', '8462', '8091'] as const) };
}

/* ---------- Cash drawer ---------- */

export type CashCategory = 'supplies' | 'flowers' | 'cleaning' | 'postage' | 'change' | 'deposit';
export type CashBooking = {
  id: string;
  locationId: LocationId;
  date: Date;
  kind: 'expense' | 'income' | 'deposit';
  /** Seeded bookings carry a category (translated); ones typed in the demo carry their own text. */
  category: CashCategory | null;
  text: string | null;
  method: 'cash' | 'bank';
  amount: number;
};

export type CashCheck = {
  id: string;
  locationId: LocationId;
  start: Date;
  description: string | null;
  startBalance: number;
  included: string[];
  recount: number | null;
  status: 'active' | 'final';
  finalisedAt: Date | null;
  difference: number | null;
};

/** A cash movement for the check: invoices paid in cash and the drawer's own bookings, with a sign. */
export type CashMove = { id: string; date: Date; amount: number; invoice?: Invoice; booking?: CashBooking };

export function cashMoves(invoices: Invoice[], bookings: CashBooking[], locationId: LocationId, from: Date): CashMove[] {
  const moves: CashMove[] = [];
  for (const inv of invoices) {
    if (inv.locationId !== locationId) continue;
    inv.payments.forEach((p, i) => {
      if (p.method === 'cash' && p.at >= from) moves.push({ id: `pay-${inv.id}-${i}`, date: p.at, amount: p.amount, invoice: inv });
    });
  }
  for (const b of bookings) {
    if (b.locationId !== locationId || b.method !== 'cash' || b.date < from) continue;
    moves.push({ id: b.id, date: b.date, amount: b.kind === 'income' ? b.amount : -b.amount, booking: b });
  }
  return moves.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/* ---------- Strip cards and layout ---------- */

export type StripCard = { id: string; clientId: string; short: string; client: string; treatment: TreatmentId; strips: number; used: number; bought: Date; locationId: LocationId };

export type GiftUse = { date: Date; amount: number; invoice: string };

export type InvoiceLayout = {
  logo: 'start' | 'center' | 'end';
  accent: string;
  /** Null shows the standard closing line in the reader's language. */
  footer: string | null;
  showAgb: boolean;
  showIban: boolean;
  showKvk: boolean;
  term: number;
};

export const ACCENTS = ['#3A2623', '#8A4B55', '#2F4A3C', '#9B6B5A', '#5A6B7A'];
export const DEFAULT_LAYOUT: InvoiceLayout = { logo: 'start', accent: ACCENTS[1], footer: null, showAgb: true, showIban: true, showKvk: true, term: 14 };

/* ---------- Seeds ---------- */

/** The episode an invoice belongs to: the client's own one for this treatment, or the usual one for its condition. */
export function episodeFor(client: PracticeClient, treatment: TreatmentId): EpisodeRef {
  const own = client.episodes.find((e) => e.treatment === treatment) ?? client.episodes.find((e) => conditionOf(treatment).id === e.condition);
  const condition = conditionOf(treatment);
  if (own) return { condition: own.condition, zt: own.zt, start: own.start, diagnosis: condition.diagnosis };
  const r = rng(`ep-${client.id}-${condition.id}`);
  return {
    condition: condition.id,
    zt: `ZT-${client.since.getFullYear()}-${String(between(r, 1000, 99999)).padStart(5, '0')}`,
    start: client.since,
    diagnosis: condition.diagnosis,
  };
}

/** Who pays for a treatment for this client: insured care goes to the insurer when Pure has a contract with it. */
export function payerFor(client: PracticeClient, treatment: TreatmentId, roll: number): Payer {
  if (!treatmentById(treatment).insurable || roll > 0.6) return 'client';
  return insurerById(client.insurer).contracted ? 'insurer' : 'restitutie';
}

export function claimFrom(inv: Invoice, client: PracticeClient, id: string): Claim {
  const treatmentLine = inv.lines.find((l) => l.ref.type === 'treatment');
  const treatment = treatmentLine?.ref.type === 'treatment' ? treatmentLine.ref.id : 'acne';
  const codes = codesOf(treatmentById(treatment));
  const episode = inv.episode ?? episodeFor(client, treatment);
  return {
    id,
    side: 'debit',
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    clientId: client.id,
    short: client.short,
    client: `${client.first} ${client.last}`,
    bsn: client.bsn,
    insurer: client.insurer,
    locationId: inv.locationId,
    practitioner: inv.practitioner ?? 'loubna',
    date: inv.date,
    treatment,
    prestatie: codes.prestatie,
    aanspraak: codes.aanspraak || '001',
    diagnosis: episode.diagnosis,
    zt: episode.zt,
    start: episode.start,
    code008: false,
    entitlementStart: null,
    amount: totals(inv).total,
    approved: null,
    status: 'ready',
    reason: null,
    batch: null,
    sentAt: null,
    creditOf: null,
    resubmitOf: null,
    rest: null,
    restCredited: false,
  };
}

const WEIGHTED_METHODS: PayMethod[] = ['pin', 'pin', 'pin', 'pin', 'pin', 'pin', 'pin', 'cash', 'cash', 'cash', 'ideal', 'ideal', 'credit', 'debit'];

export type BillingSeed = { invoices: Invoice[]; claims: Claim[]; bookings: CashBooking[]; checks: CashCheck[]; strips: StripCard[]; giftUses: Record<string, GiftUse[]> };

let cache: { key: string; seed: BillingSeed } | null = null;

/**
 * The last two weeks at the desk, the same on every load: an invoice for every finished appointment (today only those
 * that ended an hour ago; the rest still wait to be invoiced), claims for insured care, and the drawer's own bookings.
 */
export function seedBilling(today: Date, now: Date): BillingSeed {
  const key = dateKey(today);
  if (cache?.key === key) return cache.seed;
  const invoices: Invoice[] = [];
  const claims: Claim[] = [];
  const cutoff = now.getTime() - 60 * 60_000;

  for (let offset = -13; offset <= 0; offset++) {
    const day = addDays(today, offset);
    for (const a of agendaDay(day)) {
      if (offset === 0 && a.end.getTime() > cutoff) continue;
      const r = rng(`inv-${a.id}`);
      const client = clientFor(a.client, a.clinic, today);
      const payer = a.price === 0 ? 'client' : payerFor(client, a.treatment.id, r());
      const lines: InvoiceLine[] = [{ ...lineFor({ type: 'treatment', id: a.treatment.id }), unit: a.price, appt: a.id }];
      // About one in eight takes the recommended aftercare home on the same invoice.
      if (payer === 'client' && a.price > 0 && r() < 0.13) lines.push(lineFor({ type: 'product', id: pick(r, ['zo-spf', 'zo-cleanser', 'laser-aftercare-set', 'wiqo-cream'] as const) }));
      // One in twenty-five goes on account; after ten days the transfer has come in.
      const method = r() < 0.04 && a.price > 0 && offset > -10 ? 'account' : pick(r, WEIGHTED_METHODS);
      const inv: Invoice = {
        id: `inv-${a.id}`,
        number: null,
        kind: payer === 'restitutie' ? 'restitutie' : 'invoice',
        status: payer === 'insurer' ? 'insurer' : a.price === 0 ? 'paid' : method === 'account' ? 'open' : 'paid',
        payer,
        clientId: client.id,
        short: client.short,
        client: `${client.first} ${client.last}`,
        locationId: a.clinic,
        practitioner: a.specialist.id,
        date: a.end,
        lines,
        discount: { mode: 'pct', value: r() < 0.06 ? 10 : 0 },
        payments: [],
        episode: episodeFor(client, a.treatment.id),
        apptId: a.id,
        onAccount: method === 'account' && payer !== 'insurer',
      };
      if (inv.status === 'paid' && a.price > 0) inv.payments = [{ method, amount: totals(inv).total, at: new Date(a.end.getTime() + 4 * 60_000) }];
      invoices.push(inv);
    }
  }
  invoices.sort((x, y) => x.date.getTime() - y.date.getTime());
  invoices.forEach((inv, i) => (inv.number = `${today.getFullYear()}-${String(820 + i).padStart(4, '0')}`));

  // Insured care at a contracted insurer: a claim per invoice; older ones are already answered.
  for (const inv of invoices) {
    if (inv.payer !== 'insurer') continue;
    const client = clientFor(inv.short, inv.locationId, today);
    const claim = claimFrom(inv, client, `cl-${inv.id}`);
    const age = Math.round((today.getTime() - startOfDay(inv.date).getTime()) / 86_400_000);
    if (age >= 6) {
      claim.batch = `VZ-${dateKey(addDays(inv.date, 2)).replace(/-/g, '').slice(2)}`;
      claim.sentAt = addDays(inv.date, 2);
      Object.assign(claim, outcome(claim));
    } else if (age >= 3) {
      claim.batch = `VZ-${dateKey(addDays(inv.date, 1)).replace(/-/g, '').slice(2)}`;
      claim.sentAt = addDays(inv.date, 1);
      claim.status = 'sent';
    }
    claims.push(claim);
  }
  // One claim whose care trajectory was entered with a start date after the treatment: it came back rejected.
  const wrong = claims.find((c) => c.status === 'approved');
  if (wrong) {
    wrong.start = addDays(wrong.date, 3);
    Object.assign(wrong, outcome(wrong));
  }

  // Two corrections on the credit side: one already processed, one waiting to go out.
  const done = claims.filter((c) => c.status === 'approved' && c.date < addDays(today, -7));
  done.slice(0, 2).forEach((c, i) => {
    c.status = 'credited';
    claims.push({
      ...c,
      id: `${c.id}-cr`,
      side: 'credit',
      amount: -c.amount,
      approved: i === 0 ? -c.amount : null,
      status: i === 0 ? 'approved' : 'ready',
      batch: i === 0 ? c.batch : null,
      sentAt: i === 0 ? addDays(c.date, 4) : null,
      creditOf: c.id,
    });
  });
  // One restitutienota whose care trajectory was entered after the treatment: the GDS check flags it.
  const nota = invoices.filter((i) => i.kind === 'restitutie' && i.episode).slice(-2)[0];
  if (nota?.episode) nota.episode = { ...nota.episode, start: addDays(nota.date, 2) };

  // A concept from yesterday that nobody made final, and two credit invoices.
  // Preferably insured care, so the concept shows the choice between client, restitutienota and insurer.
  const earlier = [...invoices].reverse().filter((i) => i.status === 'paid' && startOfDay(i.date) < today && i.lines[0].unit > 0);
  const yesterday = earlier.find((i) => i.lines[0].ref.type === 'treatment' && treatmentById(i.lines[0].ref.id).insurable) ?? earlier[0];
  if (yesterday) {
    yesterday.number = null;
    yesterday.status = 'concept';
    yesterday.payments = [];
  }
  const withProduct = invoices.filter((i) => i.status === 'paid' && i.lines.some((l) => l.ref.type === 'product')).slice(0, 1);
  for (const original of withProduct) {
    original.status = 'credited';
    const product = original.lines.find((l) => l.ref.type === 'product')!;
    invoices.push({
      ...original,
      id: `cr-${original.id}`,
      number: `${today.getFullYear()}-${String(820 + invoices.length).padStart(4, '0')}`,
      kind: 'credit',
      status: 'paid',
      date: addDays(original.date, 1),
      lines: [{ ...product, key: `${product.key}-cr`, qty: -product.qty }],
      discount: { mode: 'pct', value: 0 },
      payments: [{ method: original.payments[0]?.method ?? 'pin', amount: -product.unit, at: addDays(original.date, 1) }],
      creditOf: original.number ?? undefined,
    });
  }

  const bookings = seedBookings(today);
  const checks: CashCheck[] = [
    {
      id: 'kc-nm-1',
      locationId: 'nijmegen',
      start: addDays(today, -6),
      description: null,
      startBalance: 250,
      included: [],
      recount: null,
      status: 'active',
      finalisedAt: null,
      difference: null,
    },
    {
      id: 'kc-nm-0',
      locationId: 'nijmegen',
      start: addDays(today, -34),
      description: null,
      startBalance: 300,
      included: [],
      recount: 312.4,
      status: 'final',
      finalisedAt: addDays(today, -7),
      difference: 0,
    },
    {
      id: 'kc-ud-0',
      locationId: 'uden',
      start: addDays(today, -30),
      description: null,
      startBalance: 150,
      included: [],
      recount: 182.15,
      status: 'final',
      finalisedAt: addDays(today, -9),
      difference: -2.5,
    },
  ];
  // Part of the open check is already ticked off.
  const firstMoves = cashMoves(invoices, bookings, 'nijmegen', checks[0].start).slice(0, 3);
  checks[0].included = firstMoves.map((m) => m.id);

  const seed: BillingSeed = { invoices, claims, bookings, checks, strips: seedStrips(today), giftUses: seedGiftUses(seedGiftCards(today)) };
  cache = { key, seed };
  return seed;
}

function seedBookings(today: Date): CashBooking[] {
  const out: CashBooking[] = [];
  const r = rng('pk-cash');
  const plan: [CashBooking['kind'], CashCategory, number, number][] = [
    ['expense', 'supplies', 12.4, -1],
    ['expense', 'flowers', 24.95, -2],
    ['expense', 'cleaning', 18.7, -4],
    ['expense', 'postage', 9.6, -5],
    ['deposit', 'deposit', 400, -3],
    ['income', 'change', 50, -6],
    ['expense', 'supplies', 8.35, -8],
    ['deposit', 'deposit', 350, -10],
  ];
  for (const locationId of ['nijmegen', 'uden'] as LocationId[]) {
    plan.forEach(([kind, category, amount, offset], i) => {
      let day = addDays(today, offset);
      while (!openingHours(day, locationId)) day = addDays(day, -1);
      const at = new Date(day);
      at.setHours(between(r, 10, 16), pick(r, [0, 15, 30, 45]));
      out.push({
        id: `cb-${locationId}-${i}`,
        locationId,
        date: at,
        kind,
        category,
        text: null,
        method: kind === 'deposit' ? 'cash' : r() < 0.8 ? 'cash' : 'bank',
        amount: locationId === 'uden' ? round2(amount * 0.6) : amount,
      });
    });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

function seedStrips(today: Date): StripCard[] {
  const r = rng('pk-strips');
  const plans: [string, LocationId, TreatmentId][] = [
    ['Noor K.', 'nijmegen', 'acne'],
    ['Lina V.', 'nijmegen', 'epilation'],
    ['Fleur de V.', 'uden', 'deepclean'],
    ['Amira S.', 'nijmegen', 'massage'],
  ];
  return plans.map(([short, locationId, treatment], i) => {
    const client = clientFor(short, locationId, today);
    return {
      id: `strip-${i}`,
      clientId: client.id,
      short,
      client: `${client.first} ${client.last}`,
      treatment,
      strips: 8,
      used: between(r, 1, 7),
      bought: addDays(today, -between(r, 20, 140)),
      locationId,
    };
  });
}

function seedGiftUses(cards: GiftCard[]): Record<string, GiftUse[]> {
  const uses: Record<string, GiftUse[]> = {};
  cards.forEach((c, i) => {
    const spent = c.amount - c.balance;
    if (spent > 0) uses[c.code] = [{ date: addDays(c.issued, 9 + (i % 5) * 6), amount: spent, invoice: `2026-${String(700 + i * 9).padStart(4, '0')}` }];
  });
  return uses;
}

/** A fresh eight-digit code that is not on any card yet. */
export function newGiftCode(cards: GiftCard[]): string {
  for (;;) {
    const code = String(10000000 + Math.floor(Math.random() * 90000000));
    if (!cards.some((c) => c.code === code)) return code;
  }
}

/** 1234 5678, easier to read out at the desk. */
export const groupCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
