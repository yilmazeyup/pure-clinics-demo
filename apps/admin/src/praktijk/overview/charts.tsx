import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { niceMax } from '../screens/reports/charts';

// The Overzicht's charts: a sparkline for a figure, a trend with a forecast band, and a ring of shares. Plain SVG that
// measures its own width, so it is sharp at every size; lines draw in once, and a finger or pointer on the trend shows
// the value under it. In Arabic the time axis runs right to left, like the text.

const rtl = () => document.documentElement.dir === 'rtl';

/** The width of an element, kept up to date. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A smooth line through points (monotone cubic), so it never overshoots between two months. */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return points.length ? `M${points[0][0]},${points[0][1]}` : '';
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / (dx[i] || 1));
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/* ---------- Sparkline ---------- */

/** A small line with a soft fill under it; the last point is marked. */
export function Sparkline({ values, tone = 'brand', label }: { values: number[]; tone?: 'brand' | 'now' | 'muted'; label?: string }) {
  const id = useId().replace(/:/g, '');
  const w = 120;
  const h = 36;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 8)] as [number, number]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  return (
    <svg className={`pk-ov-spark pk-ov-spark--${tone}`} viewBox={`0 0 ${w} ${h}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 ? <path d={`${line} L${last[0]},${h} L${pts[0][0]},${h} Z`} fill={`url(#sg${id})`} /> : null}
      <path className="pk-ov-draw" d={line} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r="2.6" fill="currentColor" /> : null}
    </svg>
  );
}

/* ---------- Trend with forecast ---------- */

export type TrendPoint = { key: string; label: string; long: string; value: number; low?: number; high?: number; forecast: boolean };

/**
 * Months behind as a filled line, months ahead dashed inside the band they will likely fall in. Grid lines on round
 * values; every label fits, thinned out on a narrow screen.
 */
export function TrendChart({ points, format, height = 250, ariaLabel }: { points: TrendPoint[]; format: (n: number) => string; height?: number; ariaLabel: string }) {
  const id = useId().replace(/:/g, '');
  const [box, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const flip = rtl();
  const pad = { top: 14, right: 12, bottom: 30, left: width < 480 ? 46 : 58 };
  const w = Math.max(width, 280);
  const plotW = w - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const top = niceMax(Math.max(...points.map((p) => p.high ?? p.value), 1));
  const xAt = (i: number) => {
    const x = pad.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
    return flip ? w - x : x;
  };
  const yAt = (v: number) => pad.top + plotH - (v / top) * plotH;
  const firstAhead = points.findIndex((p) => p.forecast);
  const behind = points.slice(0, firstAhead < 0 ? points.length : firstAhead + 1).map((p, i) => [xAt(i), yAt(p.value)] as [number, number]);
  const aheadStart = firstAhead < 0 ? points.length : Math.max(0, firstAhead);
  const ahead = points.slice(aheadStart).map((p, j) => [xAt(aheadStart + j), yAt(p.value)] as [number, number]);
  const band = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.forecast && p.low !== undefined && p.high !== undefined);
  const bandPath = band.length
    ? `${band.map(({ p, i }, k) => `${k ? 'L' : 'M'}${xAt(i)},${yAt(p.high!)}`).join(' ')} ${band
        .slice()
        .reverse()
        .map(({ p, i }) => `L${xAt(i)},${yAt(p.low!)}`)
        .join(' ')} Z`
    : '';
  const behindLine = smooth(behind);
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotW / 54))));

  const pick = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    let x = event.clientX - rect.left;
    if (flip) x = w - x;
    const i = Math.round(((x - pad.left) / plotW) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const shown = hover ?? (firstAhead > 0 ? firstAhead : points.length - 1);
  const sp = points[shown];

  return (
    <div className="pk-ov-trend" ref={box}>
      {width > 0 ? (
        <svg
          width={w}
          height={height}
          viewBox={`0 0 ${w} ${height}`}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`tg${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c9a882" stopOpacity="0.5" />
              <stop offset="1" stopColor="#d6c2a8" stopOpacity="0.04" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((g) => {
            const v = (top * g) / 4;
            const y = yAt(v);
            return (
              <g key={g} className="pk-ov-grid">
                <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} />
                <text x={flip ? w - pad.left + 8 : pad.left - 8} y={y + 4} textAnchor={flip ? 'start' : 'end'}>
                  {format(v)}
                </text>
              </g>
            );
          })}
          {bandPath ? <path d={bandPath} className="pk-ov-band" /> : null}
          {behind.length > 1 ? (
            <path d={`${behindLine} L${behind[behind.length - 1][0]},${yAt(0)} L${behind[0][0]},${yAt(0)} Z`} fill={`url(#tg${id})`} />
          ) : null}
          <path d={behindLine} className="pk-ov-line pk-ov-draw" pathLength={1} />
          {ahead.length > 1 ? <path d={smooth(ahead)} className="pk-ov-line pk-ov-line--ahead" /> : null}
          {points.map((p, i) =>
            i % step === 0 || i === points.length - 1 ? (
              <text key={p.key} className="pk-ov-xlabel" x={xAt(i)} y={height - 8} textAnchor="middle">
                {p.label}
              </text>
            ) : null,
          )}
          {sp ? (
            <g className="pk-ov-focus">
              <line x1={xAt(shown)} x2={xAt(shown)} y1={pad.top} y2={yAt(0)} />
              <circle cx={xAt(shown)} cy={yAt(sp.value)} r="5" />
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {sp && width > 0 ? (
        <div
          className="pk-ov-tip"
          style={{ insetInlineStart: Math.min(Math.max(flip ? w - xAt(shown) : xAt(shown), 70), w - 70), top: Math.max(4, yAt(sp.high ?? sp.value) - 58) }}
          aria-live="polite"
        >
          <span>{sp.long}</span>
          <strong>{format(sp.value)}</strong>
          {sp.forecast && sp.low !== undefined && sp.high !== undefined ? (
            <small>
              {format(sp.low)} – {format(sp.high)}
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Ring of shares ---------- */

export type Share = { key: string; label: string; value: number; color: string; display: string };

/** A ring with one arc per share and the total in the middle; the legend next to it lights up the arc it names. */
export function Donut({ shares, total, totalLabel, ariaLabel }: { shares: Share[]; total: string; totalLabel: string; ariaLabel: string }) {
  const [on, setOn] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const sum = shares.reduce((s, x) => s + x.value, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = shares.length > 1 ? 2.2 : 0;
  const arcs = useMemo(() => {
    let at = 0;
    return shares.map((s) => {
      const len = (s.value / sum) * c;
      const arc = { ...s, len: Math.max(0, len - gap), offset: -at };
      at += len;
      return arc;
    });
  }, [shares, sum, c, gap]);
  return (
    <div className="pk-ov-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={ariaLabel}>
        <circle cx="70" cy="70" r={r} className="pk-ov-donut-track" />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="70"
            cy="70"
            r={r}
            stroke={a.color}
            strokeDasharray={`${drawn ? a.len : 0} ${c}`}
            strokeDashoffset={a.offset}
            className={`pk-ov-donut-arc ${on && on !== a.key ? 'is-dim' : ''} ${on === a.key ? 'is-on' : ''}`}
            onPointerEnter={() => setOn(a.key)}
            onPointerLeave={() => setOn(null)}
          />
        ))}
        <text x="70" y="68" textAnchor="middle" className="pk-ov-donut-total">
          {on ? arcs.find((a) => a.key === on)?.display : total}
        </text>
        <text x="70" y="86" textAnchor="middle" className="pk-ov-donut-label">
          {on ? `${Math.round(((arcs.find((a) => a.key === on)?.value ?? 0) / sum) * 100)}%` : totalLabel}
        </text>
      </svg>
      <ul className="pk-ov-legend">
        {shares.map((s) => (
          <li key={s.key} className={on === s.key ? 'is-on' : ''} onPointerEnter={() => setOn(s.key)} onPointerLeave={() => setOn(null)}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{Math.round((s.value / sum) * 100)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
