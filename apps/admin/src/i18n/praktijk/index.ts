import type { Locale } from '@pure-clinics/shared';

import type { nl } from './nl';
import { shell as arShell } from './ar/shell';
import { shell as deShell } from './de/shell';
import { shell as enShell } from './en/shell';
import { shell as esShell } from './es/shell';
import { shell as frShell } from './fr/shell';
import { shell as itShell } from './it/shell';
import { shell as nlShell } from './nl/shell';

/** The texts of Pure Praktijk, the practice module; merged into the panel's own dictionaries. */
export type PraktijkKey = keyof typeof nl;
export type PraktijkMessages = Record<PraktijkKey, string>;

/** The module frame's words (the sidebar entry and its chip) are needed on every page, so they load with the panel. */
export const PRAKTIJK_SHELL: Record<Locale, Partial<PraktijkMessages>> = {
  nl: nlShell,
  en: enShell,
  es: esShell,
  fr: frShell,
  de: deShell,
  it: itShell,
  ar: arShell,
};

/** The rest, about 3,000 texts per language, loads only when the module opens, one language at a time. */
const LOADERS: Record<Locale, () => Promise<PraktijkMessages>> = {
  nl: () => import('./nl').then((m) => m.nl),
  en: () => import('./en').then((m) => m.en),
  es: () => import('./es').then((m) => m.es),
  fr: () => import('./fr').then((m) => m.fr),
  de: () => import('./de').then((m) => m.de),
  it: () => import('./it').then((m) => m.it),
  ar: () => import('./ar').then((m) => m.ar),
};
export const loadPraktijkTexts = (locale: Locale) => LOADERS[locale]();
