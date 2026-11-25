import { addDays, LOCATIONS, type LocationId, type SpecialistId } from '@pure-clinics/shared';

import { between, personName, rng } from '../../data/random';
import { AGENDAS, STAFF, type StaffId } from './core';

// State that more than one screen reads and changes, through useShared(key, seed). Keep the keys and shapes here so the
// screens agree: Facturen issues gift cards that Rapportages counts, a product credit puts stock back in Voorraad, and
// Team & rechten decides which agendas show as "Bezet" in the Agenda.

/* ---------- Gift cards: useShared('giftcards', () => seedGiftCards(today)) ---------- */

export type GiftCard = {
  /** Eight digits, printed on the card. */
  code: string;
  amount: number;
  balance: number;
  issued: Date;
  /** The invoice that sold it; the card is valid once that invoice is final. */
  invoice: string;
  final: boolean;
  buyer: string;
  locationId: LocationId;
};

export function seedGiftCards(today: Date): GiftCard[] {
  const r = rng('pk-giftcards');
  return Array.from({ length: 14 }, (_, i) => {
    const amount = [25, 50, 50, 75, 100, 150][between(r, 0, 5)];
    const spent = r() < 0.55 ? Math.min(amount, between(r, 1, 4) * 25) : 0;
    // One card still waits for its invoice to be final, so nothing can have been spent on it yet.
    const used = i === 0 ? 0 : spent;
    return {
      code: String(between(r, 10000000, 99999999)),
      amount,
      balance: amount - used,
      issued: addDays(today, -between(r, 3, 330)),
      invoice: `2026-${String(180 + i * 17).padStart(4, '0')}`,
      final: i !== 0,
      buyer: personName(r),
      locationId: LOCATIONS[i % 3 === 2 ? 1 : 0].id,
    };
  }).sort((a, b) => b.issued.getTime() - a.issued.getTime());
}

/* ---------- Stock levels: useShared('stock', () => stockAt(now)) ---------- */

// The seed lives in src/data/stockSeed.ts, so the overview's webshop shelf can use it without loading this module.
export { seedStock, type StockLevels } from '../../data/stockSeed';

/* ---------- Agenda access: useShared('agendaAccess', seedAgendaAccess) ---------- */

/** Which agendas (one per room, named after its specialist) each team member may open; the rest show as "Bezet". */
export type AgendaAccess = Record<StaffId, SpecialistId[]>;

export function seedAgendaAccess(): AgendaAccess {
  const all = AGENDAS.map((a) => a.id);
  const access = {} as AgendaAccess;
  for (const s of STAFF) {
    if (s.id === 'husna') access[s.id] = all;
    // Blanche Beauty Studio sees only its own agenda; therapists see their own clinic's.
    else if (s.role === 'beauty') access[s.id] = [s.id as SpecialistId];
    else access[s.id] = AGENDAS.filter((a) => a.locationId === s.locationId).map((a) => a.id);
  }
  return access;
}
