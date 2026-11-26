import {
  addDays,
  formatDayLong,
  formatDayShort,
  formatEuro,
  formatTime,
  inSentence,
  isRTL,
  pick,
  sameDay,
  translate,
  translatePlural,
  weekdayShort,
  type L10n,
  type MessageKey,
  type PluralKey,
  type Vars,
} from '@pure-clinics/shared';
import { useMemo } from 'react';

import { useApp } from './state/app';
import { LIVE_STRINGS, type LiveKey } from './strings';

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (vars[name] === undefined ? match : String(vars[name])));
}

/** Locale tags for dates and numbers, with Western digits in Arabic like the rest of the app. */
export const INTL_LOCALE: Record<string, string> = { nl: 'nl-NL', en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ar: 'ar-u-nu-latn' };

export function useI18n() {
  const { locale, now } = useApp();
  return useMemo(() => {
    // The shared messages, and the live app's own words (signing in, requests, orders, the scan).
    const t = (key: MessageKey | LiveKey, vars?: Vars) =>
      key in LIVE_STRINGS.nl ? fill(LIVE_STRINGS[locale][key as LiveKey] ?? LIVE_STRINGS.nl[key as LiveKey], vars) : translate(locale, key as MessageKey, vars);
    const dayShort = (date: Date) => formatDayShort(date, locale);
    return {
      locale,
      rtl: isRTL(locale),
      t,
      tp: (key: PluralKey, count: number, vars?: Vars) => translatePlural(locale, key, count, vars),
      dayShort,
      dayLong: (date: Date) => formatDayLong(date, locale),
      weekday: (date: Date) => weekdayShort(date, locale),
      time: formatTime,
      euro: (amount: number) => formatEuro(amount, locale),
      /** A whole number with the language's grouping, in Western digits (also in Arabic, like the rest of the app). */
      num: (value: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale).format(value),
      text: (value: L10n) => pick(value, locale),
      /** A text from Huidly, where only Dutch is sure to be filled in. */
      textOf: (value: Partial<L10n> | undefined, fallback = '') => value?.[locale] || value?.nl || fallback,
      /** "vrijdag 4 december" for a YYYY-MM-DD day. */
      dateLong: (day: string) =>
        new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day.slice(0, 10)}T12:00:00`)),
      /** "4 dec" for a YYYY-MM-DD day or an ISO time. */
      dateShort: (day: string) =>
        new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', ...(day.length > 10 ? { timeZone: 'Europe/Amsterdam' } : {}) }).format(
          new Date(day.length === 10 ? `${day}T12:00:00` : day),
        ),
      /** "14:30" for a confirmed time, in the clinic's own time zone. */
      clockTime: (iso: string) =>
        `\u200E${new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(iso))}`,
      /** "vrijdag 4 december, 14:30" for a confirmed time, in the clinic's own time zone. */
      dateTime: (iso: string) =>
        new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(new Date(iso)),
      /** "1 december" for a campaign's last day, in Amsterdam. */
      untilDay: (iso: string) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso)),
      /** "Vandaag", "Morgen" or "do 29 okt". */
      relativeDay: (date: Date) => {
        if (sameDay(date, now)) return t('common.today');
        if (sameDay(date, addDays(now, 1))) return t('common.tomorrow');
        return dayShort(date);
      },
      /** Like relativeDay, but "morgen" rather than "Morgen", for use mid-sentence. */
      relativeDayInline: (date: Date) => {
        if (sameDay(date, now) || sameDay(date, addDays(now, 1))) {
          return inSentence(sameDay(date, now) ? t('common.today') : t('common.tomorrow'), locale);
        }
        return dayShort(date);
      },
      /** "over 19 uur", "over 2 dagen". */
      fromNow: (date: Date) => {
        const minutes = Math.max(0, Math.round((date.getTime() - now.getTime()) / 60000));
        if (minutes < 60) return t('time.inMinutes', { n: minutes });
        const hours = Math.round(minutes / 60);
        if (hours < 36) return translatePlural(locale, 'time.inHours', hours);
        return translatePlural(locale, 'time.inDays', Math.round(hours / 24));
      },
    };
  }, [locale, now]);
}
