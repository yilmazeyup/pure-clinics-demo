import { addDays, LOCATIONS, startOfDay, treatmentById, PRODUCTS, type LocationId, type TreatmentCategory } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { CATEGORY_COLOR } from '../../components/ClinicsView';
import { Accent, useI18n } from '../../i18n';
import { Stage } from '../../three/stage';
import { usePraktijk, useShared } from '../context';
import { onlineBookings, seedAgenda, waitingList, type AgendaState } from '../data/agenda';
import { totals } from '../data/billing';
import { staffById } from '../data/core';
import { apptsOn, byCategory, comingWeeks, forecast, isoWeek, periodRange, realisedSample, realisedTotal, staffPerformance, weekStartOf } from '../data/reports';
import { seedProductInfo } from '../data/stock';
import { EXTRAS, FEATURES } from '../features';
import { PkIcon, type PkIconName } from '../icons';
import { Avatar, Card, Chip, Seg, useDecimal } from '../kit';
import { SCREENS, type ScreenId } from '../nav';
import { useBilling } from '../screens/billing/state';
import { BarList, ColumnChart, LOCATION_COLOR, useChartFormat } from '../screens/reports/charts';
import { HEAT_COMPACT, HEAT_WIDE, HeatScene } from '../three/heat';
import { Donut, Sparkline, TrendChart, type Share } from './charts';
import { busyMap, change, dailyTreatments, HEAT_DAYS, HEAT_FROM, HEAT_TO, newClients, occupancyTrend, weeklyRevenue, weekOccupancy, type HeatCell } from './data';
import './overview.css';

// Overzicht: the practice at a glance. Everything comes from the module's own seeded test world (data/*.ts and the
// shared state the other screens change), so a figure here leads to the same figure on the screen behind it.

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const COMPACT_QUERY = '(max-width: 760px)';

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

export function OverviewScreen() {
  const i18n = useI18n();
  const { t, eur, num, pct, text, clock, weekdayShort, monthYear } = i18n;
  const { today, now, go } = usePraktijk();
  const fmt = useChartFormat();
  const billing = useBilling();
  const [agenda] = useShared<AgendaState>('agenda', () => seedAgenda(today));
  const stock = billing.stock;

  /* ---------- Figures ---------- */

  const revenue = useMemo(() => {
    const start = monthStart(today);
    const tomorrow = addDays(startOfDay(today), 1);
    const nowValue = realisedTotal(start, tomorrow, today);
    const prevStart = monthStart(addDays(start, -1));
    const elapsed = Math.round((tomorrow.getTime() - start.getTime()) / 86400000);
    const before = realisedTotal(prevStart, addDays(prevStart, elapsed), today);
    return { value: nowValue, change: change(nowValue, before), spark: weeklyRevenue(today, 10) };
  }, [today]);

  const treatments = useMemo(() => {
    const list = apptsOn(today);
    return { count: list.length, done: list.filter((a) => a.end <= now).length, spark: dailyTreatments(today, 14) };
  }, [today, now]);

  const occupancy = useMemo(() => {
    const spark = occupancyTrend(today, 8);
    const value = weekOccupancy(weekStartOf(today));
    return { value, change: spark.length > 1 ? value - spark[spark.length - 2] : 0, spark };
  }, [today]);

  const clients = useMemo(() => newClients(today, 8), [today]);

  const online = useMemo(() => {
    const list = onlineBookings(today, now, agenda);
    const end = startOfDay(today).getTime() + 86400000;
    const perWeek = [3, 2, 1, 0].map((k) => list.filter((b) => b.bookedAt.getTime() >= end - (k + 1) * 7 * 86400000 && b.bookedAt.getTime() < end - k * 7 * 86400000).length);
    return { count: list.length, perWeek };
  }, [today, now, agenda]);

  const open = useMemo(() => {
    const list = billing.invoices.filter((i) => i.status === 'open');
    return { count: list.length, amount: list.reduce((s, i) => s + totals(i).open, 0), concepts: billing.invoices.filter((i) => i.status === 'concept').length };
  }, [billing.invoices]);

  const trend = useMemo(
    () =>
      forecast(today).map((m) => ({
        key: m.month.toISOString(),
        label: fmt.month(m.month),
        long: monthYear(m.month),
        value: m.value,
        low: m.low,
        high: m.high,
        forecast: m.forecast,
      })),
    [today, fmt, monthYear],
  );

  const mix = useMemo(() => {
    const range = periodRange('month', today);
    const sample = realisedSample(range.start, range.end, today);
    const rows = byCategory(sample.list).map((c) => ({ ...c, revenue: c.revenue * sample.scale }));
    return rows
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .map(
        (r): Share => ({
          key: r.category,
          label: t(`cat.${r.category}` as const),
          value: r.revenue,
          color: r.category === 'consult' ? '#e6dccf' : r.category === 'beauty' ? '#e3d3bf' : CATEGORY_COLOR[r.category as TreatmentCategory],
          display: fmt.compact(r.revenue),
        }),
      );
  }, [today, t, fmt]);

  const staff = useMemo(() => staffPerformance(periodRange('month', today), today).filter((s) => s.count > 0), [today]);
  const coming = useMemo(() => comingWeeks(today, 6), [today]);

  const actions = useMemo(() => {
    const info = seedProductInfo();
    let low = 0;
    for (const l of LOCATIONS) for (const p of PRODUCTS) if (!p.soldOut && (stock[l.id]?.[p.id] ?? 0) < info[p.id].min[l.id]) low++;
    const claims = billing.claims.filter((c) => c.status === 'rejected' || c.status === 'partial').length;
    const items: { key: string; icon: PkIconName; screen: ScreenId; title: string; sub: string; tone: 'warn' | 'bad' | 'neutral' }[] = [];
    if (open.count) items.push({ key: 'open', icon: 'euro', screen: 'facturen', title: t('pk.ov.act.open', { n: open.count }), sub: eur(open.amount), tone: 'warn' });
    if (open.concepts) items.push({ key: 'concept', icon: 'file', screen: 'facturen', title: t('pk.ov.act.concept', { n: open.concepts }), sub: t('pk.ov.act.conceptSub'), tone: 'neutral' });
    if (claims) items.push({ key: 'claims', icon: 'shieldCheck', screen: 'declaraties', title: t('pk.ov.act.claims', { n: claims }), sub: t('pk.ov.act.claimsSub'), tone: 'bad' });
    if (low) items.push({ key: 'stock', icon: 'box', screen: 'voorraad', title: t('pk.ov.act.stock', { n: low }), sub: t('pk.ov.act.stockSub'), tone: 'warn' });
    const waiting = waitingList(today).length;
    if (waiting) items.push({ key: 'wait', icon: 'clock', screen: 'planner', title: t('pk.ov.act.waiting', { n: waiting }), sub: t('pk.ov.act.waitingSub'), tone: 'neutral' });
    return items;
  }, [billing.claims, stock, open, today, t, eur]);

  const upcoming = useMemo(() => {
    const list = apptsOn(today).sort((a, b) => a.start.getTime() - b.start.getTime());
    const next = list.findIndex((a) => a.end > now);
    const from = next < 0 ? Math.max(0, list.length - 6) : next;
    return list.slice(from, from + 6);
  }, [today, now]);

  const total = FEATURES.length + EXTRAS.length;
  const signed = (n: number | null, asPct = true) => (n === null ? '' : `${n >= 0 ? '+' : '−'}${asPct ? pct(Math.abs(n)) : num(Math.abs(n))}`);

  return (
    <div className="pk-grid pk-ov">
      <section className="card pk-ov-hero span-12 rise">
        <div className="pk-ov-hero-top">
          <div>
            <span className="eyebrow">{t('pk.head.eyebrow')}</span>
            <h1 className="pk-ov-title">
              <Accent text={t('pk.ov.title')} />
            </h1>
            <p className="help">{t('pk.ov.help', { day: i18n.dayLong(today) })}</p>
          </div>
          <div className="pk-ov-hero-side">
            <Chip tone="good" icon="check">
              {t('pk.head.active')}
            </Chip>
            <button type="button" className="pk-ov-features" onClick={() => go('functies')}>
              <strong>{t('pk.head.features', { n: total, screens: SCREENS.length - 1 })}</strong>
              <span>
                {t('pk.head.all')}
                <PkIcon name="arrow" size={14} />
              </span>
            </button>
          </div>
        </div>

        <div className="pk-ov-kpis">
          <Kpi
            icon="euro"
            label={t('pk.ov.kpi.revenue')}
            value={eur(revenue.value)}
            delta={signed(revenue.change)}
            up={(revenue.change ?? 0) >= 0}
            sub={t('pk.ov.kpi.revenueSub')}
            spark={<Sparkline values={revenue.spark} label={t('pk.ov.kpi.revenueSpark')} />}
            onClick={() => go('rapportages')}
          />
          <Kpi
            icon="calendar"
            label={t('pk.ov.kpi.today')}
            value={num(treatments.count)}
            sub={t('pk.ov.kpi.todaySub', { n: treatments.done })}
            spark={<Sparkline values={treatments.spark} tone="now" label={t('pk.ov.kpi.todaySpark')} />}
            onClick={() => go('agenda')}
          />
          <Kpi
            icon="chart"
            label={t('pk.ov.kpi.occupancy')}
            value={pct(occupancy.value)}
            delta={signed(occupancy.change)}
            up={occupancy.change >= 0}
            sub={t('pk.ov.kpi.occupancySub')}
            spark={<Sparkline values={occupancy.spark} label={t('pk.ov.kpi.occupancySpark')} />}
            onClick={() => go('rapportages')}
          />
          <Kpi
            icon="users"
            label={t('pk.ov.kpi.clients')}
            value={num(clients.last28)}
            sub={t('pk.ov.kpi.clientsSub')}
            spark={<Sparkline values={clients.perWeek} tone="now" label={t('pk.ov.kpi.clientsSpark')} />}
            onClick={() => go('clienten')}
          />
          <Kpi
            icon="globe"
            label={t('pk.ov.kpi.online')}
            value={num(online.count)}
            sub={t('pk.ov.kpi.onlineSub')}
            spark={<Sparkline values={online.perWeek} label={t('pk.ov.kpi.onlineSpark')} />}
            onClick={() => go('portaal')}
          />
          <Kpi
            icon="file"
            label={t('pk.ov.kpi.open')}
            value={eur(open.amount)}
            sub={t('pk.ov.kpi.openSub', { n: open.count })}
            tone={open.count ? 'warn' : undefined}
            onClick={() => go('facturen')}
          />
        </div>
        <p className="pk-demo-line">
          <PkIcon name="info" size={15} />
          {t('pk.head.demo')}
        </p>
      </section>

      <Card className="span-8 pk-ov-trend-card" eyebrow={t('pk.ov.trend.eyebrow')} title={t('pk.ov.trend.title')} help={t('pk.ov.trend.help')}>
        <div className="pk-ov-keys">
          <span>
            <i className="pk-ov-key-line" />
            {t('pk.ov.trend.realised')}
          </span>
          <span>
            <i className="pk-ov-key-ahead" />
            {t('pk.ov.trend.forecast')}
          </span>
        </div>
        <TrendChart points={trend} format={fmt.compact} ariaLabel={t('pk.ov.trend.title')} />
      </Card>

      <Card className="span-4" eyebrow={t('pk.ov.mix.eyebrow')} title={t('pk.ov.mix.title')}>
        <Donut shares={mix} total={fmt.compact(mix.reduce((s, m) => s + m.value, 0))} totalLabel={t('pk.ov.mix.total')} ariaLabel={t('pk.ov.mix.title')} />
      </Card>

      <BusyCard />

      <Card className="span-6" eyebrow={t('pk.ov.staff.eyebrow')} title={t('pk.ov.staff.title')} actions={<LinkButton onClick={() => go('team')} label={t('pk.ov.toTeam')} />}>
        <BarList
          rows={staff.map((s) => ({
            key: s.specialist.id,
            label: s.specialist.name,
            value: s.revenue,
            display: eur(s.revenue),
            sub: t('pk.ov.staff.sub', { n: s.count, pct: pct(s.scheduled ? Math.min(1, s.treated / s.scheduled) : 0) }),
          }))}
        />
      </Card>

      <Card className="span-6" eyebrow={t('pk.ov.coming.eyebrow')} title={t('pk.ov.coming.title')} help={t('pk.ov.coming.help')}>
        <div className="pk-rp-legend">
          <span>
            <i style={{ background: LOCATION_COLOR.nijmegen }} />
            {t('pk.ov.coming.booked')}
          </span>
          <span>
            <i className="pk-rp-key-expected" />
            {t('pk.ov.coming.expected')}
          </span>
        </div>
        <ColumnChart
          format={fmt.compact}
          height={190}
          columns={coming.map((w) => ({
            key: w.start.toISOString(),
            label: t('pk.rapportages.week', { n: isoWeek(w.start) }),
            title: `${eur(w.booked)} · ${eur(w.expected)}`,
            stacks: [{ value: w.booked, color: LOCATION_COLOR.nijmegen }],
            expected: w.expected,
          }))}
        />
      </Card>

      <Card className="span-5" eyebrow={t('pk.ov.act.eyebrow')} title={t('pk.ov.act.title')}>
        {actions.length ? (
          <ul className="pk-ov-actions">
            {actions.map((a) => (
              <li key={a.key}>
                <button type="button" className={`pk-ov-action pk-ov-action--${a.tone}`} onClick={() => go(a.screen)}>
                  <span className="pk-ov-action-icon">
                    <PkIcon name={a.icon} size={18} />
                  </span>
                  <span className="pk-ov-action-text">
                    <strong>{a.title}</strong>
                    <small>{a.sub}</small>
                  </span>
                  <PkIcon name="chevronEnd" size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">{t('pk.ov.act.none')}</p>
        )}
      </Card>

      <Card
        className="span-7"
        eyebrow={t('pk.ov.today.eyebrow')}
        title={t('pk.ov.today.title')}
        actions={<LinkButton onClick={() => go('agenda')} label={t('pk.ov.toAgenda')} />}
      >
        <ol className="pk-ov-today">
          {upcoming.map((a) => {
            const member = staffById(a.specialist.id);
            const state = a.end <= now ? 'done' : a.start <= now ? 'now' : 'later';
            return (
              <li key={a.id} className={`is-${state}`}>
                <time>
                  {clock(a.start)}
                  <small>{clock(a.end)}</small>
                </time>
                <span className="pk-ov-today-dot" aria-hidden="true" />
                <span className="pk-ov-today-text">
                  <strong>{text(treatmentById(a.treatment.id).name)}</strong>
                  <small>
                    {a.client} · {LOCATIONS.find((l) => l.id === a.clinic)?.city}
                  </small>
                </span>
                <span className="pk-ov-today-who">
                  <Avatar staff={member} size={28} />
                  <span>{member.name}</span>
                </span>
                {state === 'now' ? <Chip tone="now">{t('pk.ov.today.now')}</Chip> : null}
              </li>
            );
          })}
        </ol>
        <p className="pk-ov-foot">{t('pk.ov.today.foot', { n: treatments.count, day: weekdayShort(today) })}</p>
      </Card>
    </div>
  );
}

function LinkButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="pk-ov-link" onClick={onClick}>
      {label}
      <PkIcon name="arrow" size={14} />
    </button>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  delta,
  up,
  spark,
  tone,
  onClick,
}: {
  icon: PkIconName;
  label: string;
  value: string;
  sub: string;
  delta?: string;
  up?: boolean;
  spark?: ReactNode;
  tone?: 'warn';
  onClick: () => void;
}) {
  return (
    <button type="button" className={`pk-ov-kpi ${tone ? `pk-ov-kpi--${tone}` : ''}`} onClick={onClick}>
      <span className="pk-ov-kpi-head">
        <span className="pk-ov-kpi-icon">
          <PkIcon name={icon} size={16} />
        </span>
        <span className="eyebrow">{label}</span>
      </span>
      <span className="pk-ov-kpi-value">
        <strong>{value}</strong>
        {delta ? <em className={up ? 'is-up' : 'is-down'}>{delta}</em> : null}
      </span>
      <span className="pk-ov-kpi-foot">
        <small>{sub}</small>
        {spark}
      </span>
    </button>
  );
}

/* ---------- When it is busy, in 3D ---------- */

type Where = LocationId | 'all';

function BusyCard() {
  const i18n = useI18n();
  const { t, weekdayLong, weekdayShort } = i18n;
  const decimal = useDecimal();
  const { today } = usePraktijk();
  const compact = useCompact();
  const [where, setWhere] = useState<Where>('all');
  const [hover, setHover] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<HeatScene | null>(null);
  const cells = useMemo(() => busyMap(today, where), [today, where]);
  const cols = HEAT_TO - HEAT_FROM;
  const weekStart = weekStartOf(today);
  const dayOf = (weekday: number) => addDays(weekStart, weekday - 1);
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

  useEffect(() => {
    const layout = compact ? HEAT_COMPACT : HEAT_WIDE;
    const stage = new Stage(host.current!, {
      camera: layout.camera,
      target: layout.target,
      intro: layout.intro,
      fov: 30,
      minDistance: 6,
      maxDistance: 20,
      minPolarAngle: 0.35,
      maxPolarAngle: 1.3,
      minAzimuthAngle: -0.9,
      maxAzimuthAngle: 0.9,
      fitAspect: layout.fitAspect,
      sway: 0.05,
    });
    const heat = new HeatScene(
      stage,
      cols,
      HEAT_DAYS.length,
      HEAT_DAYS.map((d) => {
        const name = weekdayShort(dayOf(d));
        return name.charAt(0).toLocaleUpperCase(i18n.locale) + name.slice(1);
      }),
      Array.from({ length: cols }, (_, c) => ((HEAT_FROM + c) % (compact ? 3 : 2) === 0 ? String(HEAT_FROM + c) : '')),
      busyMap(today, where),
      setHover,
    );
    scene.current = heat;
    return () => {
      heat.dispose();
      stage.dispose();
      scene.current = null;
    };
    // Rebuilt for a new layout or language; a new location only moves the columns (next effect).
  }, [compact, i18n.locale]);

  useEffect(() => {
    scene.current?.update(cells);
  }, [cells]);

  const open = cells.map((c, i) => ({ c, i })).filter(({ c }) => c.open);
  const busiest = [...open].sort((a, b) => b.c.value - a.c.value).slice(0, 3);
  const quietest = [...open].filter(({ c }) => c.hour < HEAT_TO - 1).sort((a, b) => a.c.value - b.c.value).slice(0, 3);
  const shown: HeatCell | null = hover !== null ? cells[hover] : busiest[0]?.c ?? null;
  const describe = (c: HeatCell) => `${weekdayLong(dayOf(c.weekday))} ${hourLabel(c.hour)}–${hourLabel(c.hour + 1)}`;
  const pick = (i: number) => {
    setHover(i);
    scene.current?.point(i);
  };

  return (
    <Card
      className="span-12 pk-ov-busy"
      eyebrow={t('pk.ov.busy.eyebrow')}
      title={t('pk.ov.busy.title')}
      help={t('pk.ov.busy.help')}
      actions={
        <Seg<Where>
          label={t('pk.ov.busy.where')}
          value={where}
          onChange={setWhere}
          options={[{ value: 'all', label: t('pk.ov.busy.all') }, ...LOCATIONS.map((l) => ({ value: l.id, label: l.city }))]}
        />
      }
    >
      <div className="pk-ov-busy-body">
        <div className="scene-host pk-ov-heat" ref={host} role="img" aria-label={t('pk.ov.busy.help')}>
          <span className="scene-hint">{t('pk.ov.busy.hint')}</span>
        </div>
        <aside className="pk-ov-busy-side">
          {shown ? (
            <div className="pk-ov-busy-now" aria-live="polite">
              <span className="eyebrow">{hover !== null ? t('pk.ov.busy.pointed') : t('pk.ov.busy.peak')}</span>
              <strong>{describe(shown)}</strong>
              <p>
                {shown.open
                  ? t('pk.ov.busy.value', { n: decimal(shown.value) })
                  : t('pk.ov.busy.closed')}
              </p>
            </div>
          ) : null}
          <div className="pk-ov-busy-list">
            <span className="eyebrow">{t('pk.ov.busy.busiest')}</span>
            <ul>
              {busiest.map(({ c, i }) => (
                <li key={i}>
                  <button type="button" onClick={() => pick(i)} onPointerEnter={() => pick(i)}>
                    <span>{describe(c)}</span>
                    <strong>{decimal(c.value)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="pk-ov-busy-list">
            <span className="eyebrow">{t('pk.ov.busy.quietest')}</span>
            <ul>
              {quietest.map(({ c, i }) => (
                <li key={i}>
                  <button type="button" onClick={() => pick(i)} onPointerEnter={() => pick(i)}>
                    <span>{describe(c)}</span>
                    <strong>{decimal(c.value)}</strong>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="pk-ov-scale" aria-hidden="true">
            <span>{t('pk.ov.busy.calm')}</span>
            <i />
            <span>{t('pk.ov.busy.full')}</span>
          </div>
        </aside>
      </div>
    </Card>
  );
}
