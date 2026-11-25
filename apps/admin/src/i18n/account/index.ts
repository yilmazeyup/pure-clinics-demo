import type { Locale } from '@pure-clinics/shared';

import { ar } from './ar';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { nl } from './nl';

/** Signing in and the pages of team members and clients; small, so it loads with the panel. */
export type AccountKey = keyof typeof nl;

export const ACCOUNT_TEXTS: Record<Locale, Record<AccountKey, string>> = { nl, en, de, fr, es, it, ar };
