import { locationById, type LocationId } from '@pure-clinics/shared';

import { rng } from '../../data/random';
import { SCREENS, type ScreenId } from '../nav';
import { STAFF, type StaffId, type StaffRole } from './core';

// Team & rechten: who works here, what each profile may do, the login attempts and the weekly schedules. The team is
// Pure's own (data/core.ts); profiles, logins, attempts and the bookkeeper are demo values.

/* ---------- Permission profiles ---------- */

export type ProfileId = 'admin' | 'therapist' | 'reception' | 'beauty' | 'bookkeeper';
export const PROFILE_IDS: ProfileId[] = ['admin', 'therapist', 'reception', 'beauty', 'bookkeeper'];

/** Every part of the module a profile can be given rights to: the screens, without the feature overview. */
export type ModuleId = Exclude<ScreenId, 'functies'>;
export const MODULES = SCREENS.map((s) => s.id).filter((id): id is ModuleId => id !== 'functies');

export type Right = 'view' | 'add' | 'edit';
export const RIGHTS: Right[] = ['view', 'add', 'edit'];

export type Rights = Record<ModuleId, Record<Right, boolean>>;

/** Level 0 has every right; the higher the number, the fewer rights. Nobody edits a profile above her own level. */
export type Profile = { id: ProfileId; level: number; rights: Rights };

/** Rights written short: "v" view, "a" add, "e" edit, per module. */
function rights(short: Partial<Record<ModuleId, string>>): Rights {
  return Object.fromEntries(
    MODULES.map((m) => {
      const s = short[m] ?? '';
      return [m, { view: s.includes('v'), add: s.includes('a'), edit: s.includes('e') }];
    }),
  ) as Rights;
}

const ALL = 'vae';

export function seedProfiles(): Profile[] {
  return [
    { id: 'admin', level: 0, rights: rights(Object.fromEntries(MODULES.map((m) => [m, ALL]))) },
    {
      id: 'therapist',
      level: 2,
      rights: rights({
        agenda: ALL,
        planner: ALL,
        clienten: ALL,
        dossier: ALL,
        facturen: 'va',
        declaraties: 'v',
        voorraad: 'va',
        berichten: 'va',
        rapportages: 'v',
      }),
    },
    {
      id: 'reception',
      level: 3,
      rights: rights({
        agenda: ALL,
        planner: ALL,
        portaal: 'v',
        clienten: ALL,
        dossier: 'v',
        facturen: ALL,
        declaraties: 'va',
        voorraad: 'va',
        berichten: ALL,
        rapportages: 'v',
      }),
    },
    { id: 'beauty', level: 4, rights: rights({ agenda: 'vae', clienten: 'va', dossier: 'v', facturen: 'va', voorraad: 'v', berichten: 'v' }) },
    { id: 'bookkeeper', level: 5, rights: rights({ facturen: 'v', declaraties: 'v', rapportages: 'v' }) },
  ];
}

/* ---------- Members ---------- */

export type Member = {
  id: string;
  /** The team member in data/core.ts; null for someone added in the demo. */
  staffId: StaffId | null;
  name: string;
  role: StaffRole;
  locationId: LocationId;
  code: string;
  agb: string;
  email: string;
  days: number[];
  photo: boolean;
  profile: ProfileId;
  twofa: boolean;
  active: boolean;
  /** Calendar sync: the agenda also shows in her own Google or Outlook calendar. */
  google: boolean;
  outlook: boolean;
};

const PROFILE_OF: Record<StaffId, ProfileId> = {
  margot: 'admin',
  loubna: 'therapist',
  maud: 'therapist',
  nadila: 'therapist',
  sam: 'therapist',
  hawin: 'beauty',
  husna: 'reception',
};

export function seedMembers(): Member[] {
  return STAFF.map((s) => {
    const r = rng(`pk-member-${s.id}`);
    return {
      id: s.id,
      staffId: s.id,
      name: s.name,
      role: s.role,
      locationId: s.locationId,
      code: s.code,
      agb: s.agb,
      email: s.email,
      days: s.days,
      photo: s.photo,
      profile: PROFILE_OF[s.id],
      twofa: s.id !== 'hawin' && s.id !== 'sam',
      active: true,
      google: r() < 0.5,
      outlook: s.id === 'husna',
    };
  });
}

/** Three capitals from a name, the way the agenda abbreviates: "Lotte" becomes LOT. */
export const codeFor = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');

/* ---------- Work schedules ---------- */

/** The working days of the week the schedule shows: Monday to Saturday (Date#getDay values). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6];

export type Slot = { on: boolean; from: number; to: number };
export type Schedule = Record<number, Slot>;

/** A member's week from her working days and her location's opening hours; outside those, the default 9 to 17. */
export function scheduleOf(m: Member): Schedule {
  const hours = locationById(m.locationId).hours;
  return Object.fromEntries(
    WEEKDAYS.map((d) => {
      const open = hours[d];
      return [d, { on: m.days.includes(d) && open !== null, from: open?.open ?? 9, to: open?.close ?? 17 }];
    }),
  );
}

/* ---------- Logins ---------- */

export type Attempt = { id: string; minutesAgo: number; email: string; result: 'ok' | 'failed' | 'locked'; ip: string; device: 'desktop' | 'tablet' | 'phone' };

/** Recent logins; Sam's account locked itself after five wrong passwords this morning. Addresses are documentation ranges. */
export function seedAttempts(): Attempt[] {
  const list: Omit<Attempt, 'id'>[] = [
    { minutesAgo: 4, email: 'husna@pureclinics.nl', result: 'ok', ip: '192.0.2.14', device: 'desktop' },
    { minutesAgo: 12, email: 'sam@pureclinics.nl', result: 'locked', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 13, email: 'sam@pureclinics.nl', result: 'failed', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 14, email: 'sam@pureclinics.nl', result: 'failed', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 14, email: 'sam@pureclinics.nl', result: 'failed', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 15, email: 'sam@pureclinics.nl', result: 'failed', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 16, email: 'sam@pureclinics.nl', result: 'failed', ip: '198.51.100.7', device: 'phone' },
    { minutesAgo: 41, email: 'margot@pureclinics.nl', result: 'ok', ip: '192.0.2.31', device: 'desktop' },
    { minutesAgo: 58, email: 'maud@pureclinics.nl', result: 'ok', ip: '192.0.2.18', device: 'tablet' },
    { minutesAgo: 95, email: 'hawin@pureclinics.nl', result: 'ok', ip: '192.0.2.22', device: 'phone' },
    { minutesAgo: 186, email: 'loubna@pureclinics.nl', result: 'ok', ip: '192.0.2.19', device: 'desktop' },
  ];
  return list.map((a, i) => ({ ...a, id: `attempt-${i}` }));
}

/** The external bookkeeper: a fictional office with read-only access to the finance screens. */
export const BOOKKEEPER = { name: 'Ruben Verhoef', firm: 'Verhoef Administratie', email: 'ruben@verhoef-administratie.example' };

/**
 * A QR-like pattern for the authenticator set-up: three finder squares and seeded modules. It only looks like a code;
 * nothing in the demo can be scanned.
 */
export function qrPattern(seed: string, size = 25): boolean[][] {
  const r = rng(`pk-qr-${seed}`);
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => r() < 0.48));
  const finder = (x0: number, y0: number) => {
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++) {
        const gx = x0 + x;
        const gy = y0 + y;
        if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
        const ring = x === -1 || y === -1 || x === 7 || y === 7;
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[gy][gx] = !ring && (edge || core);
      }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  return grid;
}
