import { LOCATIONS, addDays, sameDay, treatmentById, type TreatmentCategory } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { CATEGORY_COLOR } from '../../../components/ClinicsView';
import { useI18n } from '../../../i18n';
import { usePraktijk, useShared } from '../../context';
import { staffById } from '../../data/core';
import {
  byCategory,
  comingWeeks,
  forecast,
  isoWeek,
  PARTNER_TREATMENTS,
  partnerMonths,
  periodRange,
  realisedSample,
  realisedTotal,
  revenueByBucket,
  staffPerformance,
  stamp,
  type Period,
} from '../../data/reports';
import { seedGiftCards, type GiftCard } from '../../data/shared';
import { PkIcon } from '../../icons';
import { Avatar, Bar, Card, Chip, Stat, TableWrap, isolate, useDecimal, useMoney } from '../../kit';
import { BarList, ColumnChart, ForecastChart, LOCATION_COLOR, useChartFormat } from './charts';
import { ExportButton } from './ExportButton';

/** Light category colours get a darker edge in the bar list, so white (the free intake) still shows. */
const barColor = (c: TreatmentCategory) => (c === 'consult' ? '#e6dccf' : CATEGORY_COLOR[c]);

/** Financieel: revenue, what the agenda still promises, the forecast, staff, gift cards and the doctor's share. */
export function Finance({ period }: { period: Period }) {
  const i18n = useI18n();
  const { t, eur, pct, dayMonth, text } = i18n;
  const { today, now, go } = usePraktijk();
  const money = useMoney();
  const dec = useDecimal();
  const fmt = useChartFormat();

  const range = useMemo(() => periodRange(period, today), [period, today]);
  const buckets = useMemo(() => revenueByBucket(range, today), [range, today]);
  const sample = useMemo(() => realisedSample(range.start, range.end, today), [range, today]);
  const done = useMemo(() => realisedTotal(range.start, range.end, today), [range, today]);
  // The previous period over as many days as this one has had so far.
  const previous = useMemo(() => {
    const prev = periodRange(period, today, 1);
    const elapsed = Math.round((today.getTime() - range.start.getTime()) / 86400000);
    return realisedTotal(prev.start, addDays(prev.start, elapsed + 1), today);
  }, [period, today, range]);
  const coming = useMemo(() => comingWeeks(today), [today]);
  const months = useMemo(() => forecast(today), [today]);
  const staff = useMemo(() => staffPerformance(range, today), [range, today]);
  const partner = useMemo(() => partnerMonths(today), [today]);
  const [cards] = useShared<GiftCard[]>('giftcards', () => seedGiftCards(today));
  const [share, setShare] = useState(35);

  const realised = done;
  const booked = buckets.reduce((s, b) => s + b.booked, 0);
  const expected = buckets.reduce((s, b) => s + b.expected, 0);
  const versus = previous ? realised / previous - 1 : 0;
  // Shares by kind of treatment come from the real diary of the last weeks, scaled to the whole period.
  const categories = byCategory(sample.list).map((c) => ({ ...c, revenue: c.revenue * sample.scale, count: Math.round(c.count * sample.scale) }));

  const label = (b: (typeof buckets)[number]) => (b.bucket.kind === 'month' ? fmt.month(b.bucket.start) : t('pk.rapportages.week', { n: isoWeek(b.bucket.start) }));
  const issued = cards.reduce((s, c) => s + c.amount, 0);
  const open = cards.filter((c) => c.final).reduce((s, c) => s + c.balance, 0);
  const giftStatus = (c: GiftCard) => (!c.final ? 'draft' : c.balance === 0 ? 'used' : c.balance < c.amount ? 'partly' : 'active');
  const next = months.find((m) => m.forecast && m.month > today);

  return (
    <div className="pk-grid">
      <div className="pk-stats">
        <Stat label={t('pk.rapportages.stat.realised')} value={eur(realised)} sub={t('pk.rapportages.stat.realisedSub')} />
        <Stat label={t('pk.rapportages.stat.booked')} value={eur(booked)} sub={t('pk.rapportages.stat.bookedSub')} />
        <Stat label={t('pk.rapportages.stat.forecast')} value={eur(realised + booked + expected)} sub={t('pk.rapportages.stat.forecastSub')} />
        <Stat
          label={t('pk.rapportages.stat.versus')}
          value={isolate(`${versus >= 0 ? '+' : '−'}${pct(Math.abs(versus))}`)}
          sub={t('pk.rapportages.stat.versusSub', { amount: eur(previous) })}
          tone={versus >= 0 ? 'good' : 'bad'}
        />
      </div>

      <Card
        className="span-8"
        feature="p.revenue"
        eyebrow={t('pk.rapportages.revenue.eyebrow')}
        title={t(period === 'year' ? 'pk.rapportages.revenue.titleMonth' : 'pk.rapportages.revenue.title')}
        help={t('pk.rapportages.revenue.help')}
        actions={
          <ExportButton
            file={`pure-omzet-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.rapportages.period'), ...LOCATIONS.map((l) => l.city), t('pk.rapportages.legend.booked'), t('pk.rapportages.legend.expected')],
              ...buckets.map((b) => [label(b), ...LOCATIONS.map((l) => Math.round(b.actual[l.id])), Math.round(b.booked), Math.round(b.expected)]),
            ]}
          />
        }
      >
        <div className="pk-rp-legend">
          {LOCATIONS.map((l) => (
            <span key={l.id}>
              <i style={{ background: LOCATION_COLOR[l.id] }} />
              {l.city}
            </span>
          ))}
          <span>
            <i className="pk-rp-key-booked" />
            {t('pk.rapportages.legend.booked')}
          </span>
          <span>
            <i className="pk-rp-key-expected" />
            {t('pk.rapportages.legend.expected')}
          </span>
        </div>
        <ColumnChart
          format={fmt.compact}
          columns={buckets.map((b) => {
            const real = b.actual.nijmegen + b.actual.uden;
            const parts = [
              t('pk.rapportages.col.realised', { amount: eur(real) }),
              b.booked ? t('pk.rapportages.col.booked', { amount: eur(b.booked) }) : '',
              b.expected ? t('pk.rapportages.col.expected', { amount: eur(b.expected) }) : '',
            ].filter(Boolean);
            return {
              key: String(b.bucket.start.getTime()),
              label: label(b),
              title: `${label(b)} · ${parts.join(' · ')}`,
              stacks: LOCATIONS.map((l) => ({ value: b.actual[l.id], color: LOCATION_COLOR[l.id] })),
              booked: b.booked,
              expected: b.expected,
              current: b.current,
            };
          })}
        />
      </Card>

      <Card className="span-4" feature="p.revenue" eyebrow={t('pk.rapportages.categories.eyebrow')} title={t('pk.rapportages.categories.title')}>
        <BarList
          rows={categories.map((c) => ({
            key: c.category,
            label: t(`cat.${c.category}`),
            value: c.revenue,
            display: eur(c.revenue),
            sub: t('pk.rapportages.categories.count', { n: c.count }),
            color: barColor(c.category),
          }))}
        />
      </Card>

      <Card
        className="span-6"
        feature="p.expected"
        eyebrow={t('pk.rapportages.expected.eyebrow')}
        title={t('pk.rapportages.expected.title')}
        help={t('pk.rapportages.expected.help')}
        actions={
          <ExportButton
            file={`pure-verwachte-omzet-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.common.date'), t('pk.rapportages.legend.booked'), t('pk.rapportages.legend.expected')],
              ...coming.map((w) => [stamp(w.start), Math.round(w.booked), Math.round(w.expected)]),
            ]}
          />
        }
      >
        <div className="pk-stats pk-rp-stats-tight">
          <Stat label={t('pk.rapportages.expected.next4')} value={eur(coming.slice(0, 4).reduce((s, w) => s + w.booked, 0))} />
          <Stat label={t('pk.rapportages.expected.likely')} value={eur(coming.reduce((s, w) => s + w.booked + w.expected, 0))} sub={t('pk.rapportages.expected.from', { date: { date: coming[0].start } })} />
        </div>
        <ColumnChart
          height={170}
          format={fmt.compact}
          columns={coming.map((w) => ({
            key: String(w.start.getTime()),
            label: dayMonth(w.start, now),
            title: `${dayMonth(w.start, now)} · ${t('pk.rapportages.col.booked', { amount: eur(w.booked) })} · ${t('pk.rapportages.col.expected', { amount: eur(w.expected) })}`,
            stacks: [{ value: w.booked, color: LOCATION_COLOR.nijmegen }],
            expected: w.expected,
          }))}
        />
      </Card>

      <Card
        className="span-6"
        feature="o.forecast"
        eyebrow={t('pk.rapportages.forecast.eyebrow')}
        title={t('pk.rapportages.forecast.title')}
        help={t('pk.rapportages.forecast.help')}
        actions={next ? <Chip tone="brand">{`${t('pk.rapportages.forecast.next', { month: fmt.month(next.month) })} · ${fmt.compact(next.value)}`}</Chip> : null}
      >
        <div className="pk-rp-legend">
          <span>
            <i style={{ background: LOCATION_COLOR.nijmegen }} />
            {t('pk.rapportages.forecast.actual')}
          </span>
          <span>
            <i className="pk-rp-key-expected" />
            {t('pk.rapportages.forecast.forecast')}
          </span>
          <span>
            <i className="pk-rp-key-band" />
            {t('pk.rapportages.forecast.band')}
          </span>
        </div>
        <ForecastChart
          format={fmt.compact}
          points={months.map((m) => ({
            key: String(m.month.getTime()),
            label: fmt.month(m.month),
            value: m.value,
            low: m.low,
            high: m.high,
            forecast: m.forecast,
            title:
              m.low !== undefined
                ? t('pk.rapportages.forecast.range', { month: fmt.monthYear(m.month), amount: eur(m.value), low: eur(m.low), high: eur(m.high!) })
                : t('pk.rapportages.forecast.point', { month: fmt.monthYear(m.month), amount: eur(m.value) }),
          }))}
        />
      </Card>

      <Card
        feature="p.staff"
        eyebrow={t('pk.rapportages.staff.eyebrow')}
        title={t('pk.rapportages.staff.title')}
        help={t('pk.rapportages.staff.help')}
        actions={
          <ExportButton
            file={`pure-medewerkers-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.common.employee'), t('pk.rapportages.staff.scheduled'), t('pk.rapportages.staff.treated'), t('pk.rapportages.staff.treatments'), t('pk.rapportages.staff.revenue'), t('pk.rapportages.staff.followUp')],
              ...staff.map((s) => [s.specialist.name, Math.round(s.scheduled), Math.round(s.treated), s.count, Math.round(s.revenue), `${Math.round(s.followUp * 100)}%`]),
            ]}
          />
        }
      >
        <TableWrap label={t('pk.rapportages.staff.title')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.common.employee')}</th>
                <th className="end">{t('pk.rapportages.staff.scheduled')}</th>
                <th className="end">{t('pk.rapportages.staff.treated')}</th>
                <th className="end">{t('pk.rapportages.staff.treatments')}</th>
                <th className="end">{t('pk.rapportages.staff.revenue')}</th>
                <th className="end">{t('pk.rapportages.staff.perHour')}</th>
                <th>{t('pk.rapportages.staff.followUp')}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.specialist.id}>
                  <td>
                    <span className="pk-rp-person">
                      <Avatar staff={staffById(s.specialist.id)} size={30} />
                      <span>
                        <strong>{s.specialist.name}</strong>
                        <small className="pk-muted">
                          {t(`role.${s.specialist.role}`)} · {LOCATIONS.find((l) => l.id === s.specialist.locationId)?.city}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td className="end nowrap">{t('pk.rapportages.staff.hours', { n: dec(s.scheduled) })}</td>
                  <td className="end nowrap">{t('pk.rapportages.staff.hours', { n: dec(s.treated) })}</td>
                  <td className="end">{s.count}</td>
                  <td className="end nowrap">{eur(s.revenue)}</td>
                  <td className="end nowrap">{s.treated ? eur(s.revenue / s.treated) : '–'}</td>
                  <td>
                    <span className="pk-rp-follow">
                      <Bar value={s.followUp} tone={s.followUp >= 0.7 ? 'good' : undefined} />
                      <b>{pct(s.followUp)}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        className="span-7"
        feature="p.gift l.report"
        eyebrow={t('pk.rapportages.gift.eyebrow')}
        title={t('pk.rapportages.gift.title')}
        actions={
          <>
            <button className="btn btn-ghost btn-small" onClick={() => go('facturen', { feature: 'l.gift' })}>
              {t('pk.rapportages.gift.toBilling')}
              <PkIcon name="arrow" size={14} />
            </button>
            <ExportButton
              file={`pure-cadeaubonnen-${stamp(today)}.csv`}
              rows={() => [
                [t('pk.rapportages.gift.code'), t('pk.rapportages.gift.issuedOn'), t('pk.rapportages.gift.value'), t('pk.rapportages.gift.balance'), t('pk.common.status'), t('pk.rapportages.gift.buyer')],
                ...cards.map((c) => [c.code, stamp(c.issued), c.amount, c.balance, t(`pk.rapportages.gift.status.${giftStatus(c)}`), c.buyer]),
              ]}
            />
          </>
        }
      >
        <div className="pk-stats pk-rp-stats-tight">
          <Stat label={t('pk.rapportages.gift.issued')} value={money(issued)} sub={t('pk.rapportages.gift.count', { n: cards.length })} />
          <Stat label={t('pk.rapportages.gift.redeemed')} value={money(cards.reduce((s, c) => s + c.amount - c.balance, 0))} />
          <Stat label={t('pk.rapportages.gift.open')} value={money(open)} />
        </div>
        <TableWrap label={t('pk.rapportages.gift.title')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.rapportages.gift.code')}</th>
                <th>{t('pk.rapportages.gift.issuedOn')}</th>
                <th>{t('pk.common.location')}</th>
                <th className="end">{t('pk.rapportages.gift.value')}</th>
                <th className="end">{t('pk.rapportages.gift.balance')}</th>
                <th>{t('pk.common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {cards.slice(0, 8).map((c) => {
                const status = giftStatus(c);
                return (
                  <tr key={c.code}>
                    <td className="pk-mono">{c.code.replace(/(\d{4})(\d{4})/, '$1 $2')}</td>
                    <td className="nowrap">{dayMonth(c.issued, now)}</td>
                    <td>{LOCATIONS.find((l) => l.id === c.locationId)?.city}</td>
                    <td className="end nowrap">{money(c.amount)}</td>
                    <td className="end nowrap">{money(c.balance)}</td>
                    <td>
                      <Chip tone={status === 'active' ? 'good' : status === 'partly' ? 'brand' : status === 'draft' ? 'warn' : 'outline'}>
                        {t(`pk.rapportages.gift.status.${status}`)}
                      </Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        className="span-5"
        feature="p.share"
        eyebrow={t('pk.rapportages.share.eyebrow')}
        title={t('pk.rapportages.share.title')}
        help={t('pk.rapportages.share.help')}
        actions={
          <ExportButton
            file={`pure-omzetdeling-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.rapportages.share.month'), t('pk.rapportages.share.count'), t('pk.rapportages.share.revenue'), t('pk.rapportages.share.toDoctor'), t('pk.rapportages.share.toPure')],
              ...partner.map((m) => [fmt.monthYear(m.month), m.count, m.revenue, Math.round((m.revenue * share) / 100), Math.round((m.revenue * (100 - share)) / 100)]),
            ]}
          />
        }
      >
        <div className="pk-rp-doctor">
          <span className="pk-avatar pk-avatar--initial" style={{ width: 36, height: 36, fontSize: 16 }} aria-hidden="true">
            MH
          </span>
          <span>
            <strong>{isolate('dr. M. Hoekstra')}</strong>
            <small className="pk-muted">{t('pk.rapportages.share.doctor')}</small>
          </span>
          <label className="pk-rp-share-input">
            <span className="pk-field-label">{t('pk.rapportages.share.percent')}</span>
            <input
              type="number"
              min={0}
              max={100}
              className="pk-input"
              value={share}
              onChange={(e) => setShare(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
            />
          </label>
        </div>
        <TableWrap label={t('pk.rapportages.share.title')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.rapportages.share.month')}</th>
                <th className="end">{t('pk.rapportages.share.count')}</th>
                <th className="end">{t('pk.rapportages.share.toDoctor')}</th>
                <th className="end">{t('pk.rapportages.share.toPure')}</th>
              </tr>
            </thead>
            <tbody>
              {partner.slice(0, 6).map((m) => (
                <tr key={m.month.getTime()} aria-selected={sameDay(m.month, new Date(today.getFullYear(), today.getMonth(), 1))}>
                  <td className="nowrap">{fmt.monthYear(m.month)}</td>
                  <td className="end">{m.count}</td>
                  <td className="end nowrap">{money((m.revenue * share) / 100)}</td>
                  <td className="end nowrap">{money((m.revenue * (100 - share)) / 100)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('pk.common.total')}</td>
                <td className="end">{partner.reduce((s, m) => s + m.count, 0)}</td>
                <td className="end nowrap">{money(partner.reduce((s, m) => s + m.revenue, 0) * (share / 100))}</td>
                <td className="end nowrap">{money(partner.reduce((s, m) => s + m.revenue, 0) * ((100 - share) / 100))}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
        <p className="pk-muted pk-small pk-rp-note">{PARTNER_TREATMENTS.map((id) => text(treatmentById(id).name)).join(' · ')}</p>
      </Card>
    </div>
  );
}
