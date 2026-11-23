import type { Locale } from '@pure-clinics/shared';
import { useMemo, type CSSProperties } from 'react';

import { useI18n } from '../../../i18n';

// Charts for the reports, drawn with HTML and a little SVG so they follow the page: columns reflow on a phone and
// the time axis runs right to left in Arabic, like the text around it.

const INTL: Record<Locale, string> = { nl: 'nl-NL', en: 'en-GB', ar: 'ar-u-nu-latn', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES' };

/** Short month names, compact amounts (€ 12K) for axes and marks with one decimal. */
export function useChartFormat() {
  const { locale } = useI18n();
  return useMemo(() => {
    const month = new Intl.DateTimeFormat(INTL[locale], { month: 'short' });
    const monthYear = new Intl.DateTimeFormat(INTL[locale], { month: 'short', year: '2-digit' });
    const compact = new Intl.NumberFormat(INTL[locale], { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
    const one = new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return {
      /** A mark with one decimal, also when it is round: 9,0. */
      one: (n: number) => one.format(n),
      month: (d: Date) => month.format(d).replace('.', ''),
      monthYear: (d: Date) => monthYear.format(d).replace('.', ''),
      compact: (n: number) => compact.format(n),
    };
  }, [locale]);
}

/** A round number just above the maximum, so the grid lines land on readable values. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => s * power >= value) ?? 10) * power;
}

export type Segment = { value: number; color: string };
export type Column = {
  key: string;
  label: string;
  /** The tooltip: what the column adds up to. */
  title: string;
  stacks: Segment[];
  /** Booked but not yet given: drawn hatched on top. */
  booked?: number;
  /** Likely still to come: a dashed outline on top. */
  expected?: number;
  current?: boolean;
};

/** Stacked columns with grid lines; realised in full colour, booked hatched, expected as a dashed outline. */
export function ColumnChart({ columns, format, height = 220 }: { columns: Column[]; format: (n: number) => string; height?: number }) {
  const top = niceMax(Math.max(...columns.map((c) => c.stacks.reduce((s, x) => s + x.value, 0) + (c.booked ?? 0) + (c.expected ?? 0)), 1));
  const pct = (n: number) => `${(n / top) * 100}%`;
  return (
    <div className={`pk-rp-chart ${columns.length > 8 ? 'pk-rp-chart--dense' : ''}`}>
      <div className="pk-rp-plot" style={{ height }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="pk-rp-grid" style={{ bottom: `${i * 25}%` }}>
            <small>{format((top * i) / 4)}</small>
          </span>
        ))}
        <div className="pk-rp-cols">
          {columns.map((c) => (
            <div key={c.key} className={`pk-rp-col ${c.current ? 'is-current' : ''}`} title={c.title}>
              {c.expected ? <i className="pk-rp-expected" style={{ height: pct(c.expected) }} /> : null}
              {c.booked ? <i className="pk-rp-booked" style={{ height: pct(c.booked) }} /> : null}
              {[...c.stacks].reverse().map((s, i) =>
                s.value > 0 ? <i key={i} className="pk-rp-stack" style={{ height: pct(s.value), background: s.color }} /> : null,
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="pk-rp-axis" aria-hidden="true">
        {columns.map((c) => (
          <span key={c.key} className={c.current ? 'is-current' : ''}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type LinePoint = { key: string; label: string; value: number; low?: number; high?: number; forecast: boolean; title: string };

/**
 * A line of realised months that turns into a dashed forecast with a widening band. The SVG stretches to the card;
 * the strokes keep their width, and the dots and labels are HTML so they stay round and readable.
 */
export function ForecastChart({ points, format, height = 210 }: { points: LinePoint[]; format: (n: number) => string; height?: number }) {
  const top = niceMax(Math.max(...points.map((p) => p.high ?? p.value)));
  const x = (i: number) => ((i + 0.5) / points.length) * 1000;
  const y = (v: number) => 300 - (v / top) * 300;
  const firstForecast = points.findIndex((p) => p.forecast);
  const actual = points.slice(0, firstForecast < 0 ? points.length : firstForecast + 1);
  const ahead = firstForecast < 0 ? [] : points.slice(Math.max(0, firstForecast - 1));
  const path = (list: LinePoint[], offset: number) => list.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const band = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.low !== undefined && p.high !== undefined);
  const bandPath = band.length
    ? `M${band.map(({ p, i }) => `${x(i).toFixed(1)} ${y(p.high!).toFixed(1)}`).join(' L')} L${[...band]
        .reverse()
        .map(({ p, i }) => `${x(i).toFixed(1)} ${y(p.low!).toFixed(1)}`)
        .join(' L')} Z`
    : '';
  return (
    <div className="pk-rp-chart">
      <div className="pk-rp-plot pk-rp-line" style={{ height }}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="pk-rp-grid" style={{ bottom: `${i * 25}%` }}>
            <small>{format((top * i) / 4)}</small>
          </span>
        ))}
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
          {bandPath ? <path className="pk-rp-band" d={bandPath} /> : null}
          <path className="pk-rp-path" d={path(actual, 0)} vectorEffect="non-scaling-stroke" />
          {ahead.length ? <path className="pk-rp-path pk-rp-path--ahead" d={path(ahead, Math.max(0, firstForecast - 1))} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {points.map((p, i) => (
          <span
            key={p.key}
            className={`pk-rp-dot ${p.forecast ? 'is-forecast' : ''}`}
            title={p.title}
            style={{ insetInlineStart: `${(x(i) / 1000) * 100}%`, bottom: `${(p.value / top) * 100}%` } as CSSProperties}
          />
        ))}
      </div>
      <div className="pk-rp-axis pk-rp-axis--line" aria-hidden="true">
        {points.map((p) => (
          <span key={p.key} className={p.forecast ? 'is-forecast' : ''}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A label, a bar and a value per row: shares of revenue, sources, ratings. */
export function BarList({ rows }: { rows: { key: string; label: string; value: number; display: string; sub?: string; color?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="pk-rp-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="pk-rp-bars-label">
            {r.color ? <i style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="pk-rp-bars-track">
            <i style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </span>
          <span className="pk-rp-bars-value">
            <b>{r.display}</b>
            {r.sub ? <small>{r.sub}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The colours of the two locations in every chart: Pure's warm brown and its stone taupe. */
export const LOCATION_COLOR = { nijmegen: '#8a4b55', uden: '#cfb2ac' } as const;
