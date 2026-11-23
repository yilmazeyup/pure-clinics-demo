import { addDays, SPECIALISTS, type LocationId, type SpecialistId, type TreatmentId } from '@pure-clinics/shared';

import type { ConditionId } from './core';

// The client portal of Pure Praktijk: what clients may book online and under which rules. Demo values; the portal
// itself is the same booking flow as the member app, on the demo domain.

/** The demo domain where the booking portal lives; never a real booking address. */
export const PORTAL_URL = 'https://pureclinics.savastana.com/boeken/';

export type PriceMode = 'free' | 'from' | 'text';

export type IntakeOption = {
  id: string;
  /** A title the clinic typed itself; without one the portal shows the treatment (and condition, for an intake). */
  title: string | null;
  condition: ConditionId;
  treatment: TreatmentId;
  practitioner: SpecialistId | 'any';
  price: PriceMode;
  /** Own price text, e.g. "€ 35 per zone", when `price` is 'text'. */
  priceText: string;
  featured: boolean;
  visible: boolean;
};

export const SEED_OPTIONS: IntakeOption[] = [
  { id: 'intake-acne', title: null, condition: 'acne', treatment: 'consult', practitioner: 'any', price: 'free', priceText: '', featured: true, visible: true },
  { id: 'laser', title: null, condition: 'hirsutism', treatment: 'laser', practitioner: 'any', price: 'from', priceText: '', featured: true, visible: true },
  { id: 'intake-hirsutism', title: null, condition: 'hirsutism', treatment: 'consult', practitioner: 'any', price: 'free', priceText: '', featured: false, visible: true },
  { id: 'couperose', title: null, condition: 'couperose', treatment: 'couperose', practitioner: 'margot', price: 'from', priceText: '', featured: false, visible: true },
  { id: 'pigment', title: null, condition: 'pigment', treatment: 'pigment', practitioner: 'any', price: 'from', priceText: '', featured: false, visible: true },
  { id: 'intake-scars', title: null, condition: 'scars', treatment: 'consult', practitioner: 'any', price: 'free', priceText: '', featured: false, visible: true },
  { id: 'brows', title: null, condition: 'beauty', treatment: 'brows', practitioner: 'hawin', price: 'from', priceText: '', featured: false, visible: true },
  { id: 'tattoo', title: null, condition: 'tattoo', treatment: 'tattoo', practitioner: 'any', price: 'from', priceText: '', featured: false, visible: false },
];

export type PortalRules = {
  /** Booking window: at least this many hours ahead, at most this many weeks ahead. */
  minHours: number;
  maxWeeks: number;
  /** Self-service deadlines before the appointment, in hours. */
  rescheduleHours: number;
  cancelHours: number;
  allowReschedule: boolean;
  allowCancel: boolean;
};

export const SEED_RULES: PortalRules = { minHours: 12, maxWeeks: 12, rescheduleHours: 24, cancelHours: 24, allowReschedule: true, allowCancel: true };

export type StaffSetting = { excluded: boolean; hidden: boolean };
export type StaffOrder = 'fixed' | 'random';

export const SEED_STAFF: Record<SpecialistId, StaffSetting> = Object.fromEntries(
  SPECIALISTS.map((s) => [s.id, { excluded: false, hidden: false }]),
) as Record<SpecialistId, StaffSetting>;

export type Brand = { primary: string; accent: string; logo: string | null; addresses: 'all' | 'selected' };
export const SEED_BRAND: Brand = { primary: '#3F3128', accent: '#D6C2A8', logo: null, addresses: 'all' };

export type Deposit = { on: boolean; mode: 'amount' | 'percent'; value: number };
/** Pure asks no deposit (every Treatment.deposit is 0); the switch shows what Mollie makes possible. */
export const SEED_DEPOSIT: Deposit = { on: false, mode: 'amount', value: 25 };

export type PortalEmail = 'confirmNew' | 'confirmExisting' | 'cancel' | 'password';
export const PORTAL_EMAILS: PortalEmail[] = ['confirmNew', 'confirmExisting', 'cancel', 'password'];

/** A booking the sample client in the preview already has; she can move or cancel it within the rules. */
export type PreviewBooking = { id: string; treatment: TreatmentId; specialist: SpecialistId; location: LocationId; start: Date; title?: string };

/** The day at a time such as "10:30". */
export function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Two coming visits for the preview: one tomorrow morning (inside the 24-hour rule) and one next week. */
export function seedBookings(today: Date): PreviewBooking[] {
  let later = addDays(today, 4);
  while (![2, 3, 5].includes(later.getDay())) later = addDays(later, 1);
  let soon = addDays(today, 1);
  while (soon.getDay() === 0) soon = addDays(soon, 1);
  return [
    { id: 'b-soon', treatment: 'laser', specialist: 'maud', location: 'nijmegen', start: atTime(soon, '10:00') },
    { id: 'b-later', treatment: 'acne', specialist: 'loubna', location: 'nijmegen', start: atTime(later, '14:30') },
  ];
}

/** Pure's listing in the HuidzorgZoeker.nl directory; rating and review count are demo values. */
export const DIRECTORY = { rating: 4.8, reviews: 126, url: 'https://www.huidzorgzoeker.nl/praktijk/pure-clinics' };
