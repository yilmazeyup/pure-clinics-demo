import type { Locale } from '@pure-clinics/shared';

import type { nl } from './nl';
import { shell as arShell } from './ar/shell';
import { shell as deShell } from './de/shell';
import { shell as enShell } from './en/shell';
import { shell as esShell } from './es/shell';
import { shell as frShell } from './fr/shell';
import { shell as itShell } from './it/shell';
import { shell as nlShell } from './nl/shell';

/** The texts of Campagnes, the Mailchimp module; merged into the panel's own dictionaries when it opens. */
export type CampagnesKey = keyof typeof nl;
export type CampagnesMessages = Record<CampagnesKey, string>;

/** The names of its parts stand under Campagnes in the panel's menu on every page, so they load with the panel. */
export const CAMPAGNES_SHELL: Record<Locale, Partial<CampagnesMessages>> = {
  nl: nlShell,
  en: enShell,
  es: esShell,
  fr: frShell,
  de: deShell,
  it: itShell,
  ar: arShell,
};

/**
 * The sidebar word ("Campagnes") is one of the panel's own texts; the rest loads when the module opens, one language at
 * a time. The campaigns themselves stay Dutch in every language: that is what goes out to clients.
 */
const LOADERS: Record<Locale, () => Promise<CampagnesMessages>> = {
  nl: () => import('./nl').then((m) => m.nl),
  en: () => import('./en').then((m) => m.en),
  es: () => import('./es').then((m) => m.es),
  fr: () => import('./fr').then((m) => m.fr),
  de: () => import('./de').then((m) => m.de),
  it: () => import('./it').then((m) => m.it),
  ar: () => import('./ar').then((m) => m.ar),
};
export const loadCampagnesTexts = (locale: Locale) => LOADERS[locale]();
