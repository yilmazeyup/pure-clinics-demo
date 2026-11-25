import { LOCATIONS, type LocationId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { soldIn, USE_DAYS, type Forecast as Row } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Bar, Card, Chip, Seg, TableWrap, useDecimal, useMoney } from '../../kit';
import { cityOf, RunOutChip, useDaysLeft, useProductName, useStock, useStockUi } from './common';

type Where = 'all' | LocationId;

/** What sold, and when each product will run out at each clinic, with the last day to order it in time. */
export function Forecast() {
  const { t, dayMonth } = useI18n();
  const { today, now } = usePraktijk();
  const money = useMoney();
  const decimal = useDecimal();
  const name = useProductName();
  const daysLeft = useDaysLeft();
  const { openProduct, ask } = useStockUi();
  const { moves, products, info, forecast, requests } = useStock();
  const [where, setWhere] = useState<Where>('all');
  const [all, setAll] = useState(false);

  const week = useMemo(() => soldIn(moves, today, 7, where), [moves, today, where]);
  const month = useMemo(() => soldIn(moves, today, 30, where), [moves, today, where]);
  const rows = forecast.filter((f) => where === 'all' || f.locationId === where);
  const soon = rows.filter((f) => f.bucket === 'out' || f.bucket === 'week');
  const later = rows.filter((f) => f.bucket === 'month');
  const shown = all ? rows : rows.filter((f) => f.bucket === 'out' || f.bucket === 'week' || f.bucket === 'month');
  const top = Math.max(1, ...products.map((p) => month[p.id].desk + month[p.id].webshop));
  const asked = (f: Row) => requests.some((r) => r.product === f.product && r.locationId === f.locationId);
  const totals = products.reduce(
    (s, p) => ({
      units: s.units + month[p.id].desk + month[p.id].webshop,
      webshop: s.webshop + month[p.id].webshop,
      revenue: s.revenue + (month[p.id].desk + month[p.id].webshop) * info[p.id].price,
    }),
    { units: 0, webshop: 0, revenue: 0 },
  );

  const where$ = (
    <Seg
      label={t('pk.voorraad.levels.locations')}
      value={where}
      onChange={setWhere}
      options={[{ value: 'all', label: t('pk.common.allLocations') }, ...LOCATIONS.map((l) => ({ value: l.id, label: l.city }))]}
    />
  );

  return (
    <div className="pk-stack">
      <Card eyebrow={t('pk.voorraad.run.eyebrow')} title={t('pk.voorraad.run.title')} help={t('pk.voorraad.run.help', { n: USE_DAYS })} feature="more.forecast" actions={where$}>
        <div className="pk-st-run-sum">
          <div className={`pk-st-run-box ${soon.length ? 'is-soon' : ''}`}>
            <span className="eyebrow">{t('pk.voorraad.run.nextWeek')}</span>
            <strong>{soon.length}</strong>
            <small>{soon.length ? soon.slice(0, 3).map((f) => `${name(f.product)} · ${cityOf(f.locationId)}`).join(', ') : t('pk.voorraad.shelf.none')}</small>
          </div>
          <div className="pk-st-run-box">
            <span className="eyebrow">{t('pk.voorraad.run.nextMonth')}</span>
            <strong>{later.length}</strong>
            <small>{later.length ? later.slice(0, 3).map((f) => `${name(f.product)} · ${cityOf(f.locationId)}`).join(', ') : t('pk.voorraad.run.noneMonth')}</small>
          </div>
        </div>

        <TableWrap label={t('pk.voorraad.run.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.voorraad.levels.product')}</th>
                <th className="end">{t('pk.voorraad.order.level')}</th>
                <th className="end">{t('pk.voorraad.run.perWeek')}</th>
                <th>{t('pk.voorraad.run.empty')}</th>
                <th>{t('pk.voorraad.run.orderBy')}</th>
                <th>{t('pk.common.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const late = f.orderBy !== null && f.orderBy.getTime() <= today.getTime();
                return (
                  <tr key={`${f.product}@${f.locationId}`}>
                    <td className="pk-cell-main">
                      <button type="button" className="pk-st-link" onClick={() => openProduct(f.product)}>
                        <strong>{name(f.product)}</strong>
                      </button>
                      <small className="pk-muted pk-st-block">{cityOf(f.locationId)}</small>
                    </td>
                    <td className="end nowrap pk-cell-half" data-label={t('pk.voorraad.order.level')}>
                      <span className="pk-st-level">{f.level}</span>
                      {f.onWay ? <small className="pk-muted pk-st-min">{t('pk.voorraad.panel.onWay', { n: f.onWay })}</small> : null}
                    </td>
                    <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.run.perWeek')}>
                      {decimal(f.perDay * 7)}
                    </td>
                    <td className="nowrap pk-cell-half" data-label={t('pk.voorraad.run.empty')}>
                      {daysLeft(f)}
                      {f.runOut ? <small className="pk-muted pk-st-block">{dayMonth(f.runOut, now)}</small> : null}
                    </td>
                    <td className="nowrap pk-cell-half" data-label={t('pk.voorraad.run.orderBy')}>
                      {f.orderBy ? (late ? <Chip tone="warn">{t('pk.voorraad.run.orderNow')}</Chip> : dayMonth(f.orderBy, now)) : '–'}
                      <small className="pk-muted pk-st-block">{t('pk.voorraad.order.lead', { n: f.leadDays })}</small>
                    </td>
                    <td className="pk-cell-side">
                      <RunOutChip bucket={f.bucket} />
                    </td>
                    <td className="end pk-cell-full">
                      {asked(f) ? (
                        <span className="pk-st-asked">
                          <PkIcon name="check" size={13} />
                          {t('pk.voorraad.ask.done')}
                        </span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => ask(f.product, f.locationId)}>
                          <PkIcon name="plus" size={13} />
                          {t('pk.voorraad.ask.button')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shown.length ? null : (
                <tr>
                  <td colSpan={7} className="pk-muted">
                    {t('pk.voorraad.run.noneMonth')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
        {rows.length > shown.length || all ? (
          <div className="pk-st-more">
            <button className="btn btn-ghost btn-small" onClick={() => setAll((a) => !a)}>
              {all ? t('pk.voorraad.run.less') : t('pk.voorraad.run.more', { n: rows.length - shown.length })}
            </button>
          </div>
        ) : null}
      </Card>

      <Card
        eyebrow={t('pk.voorraad.sales.eyebrow')}
        title={t('pk.voorraad.sales.title')}
        help={t('pk.voorraad.sales.help')}
        feature="more.sales"
        actions={where$}
      >
        <div className="pk-stats pk-st-sales-stats">
          <div className="pk-stat">
            <span className="eyebrow">{t('pk.voorraad.sales.units')}</span>
            <strong>{totals.units}</strong>
            <small>{t('pk.voorraad.sales.unitsSub')}</small>
          </div>
          <div className="pk-stat">
            <span className="eyebrow">{t('pk.voorraad.sales.webshop')}</span>
            <strong>{totals.units ? Math.round((totals.webshop / totals.units) * 100) : 0}%</strong>
            <small>{t('pk.voorraad.sales.webshopSub', { n: totals.webshop })}</small>
          </div>
          <div className="pk-stat">
            <span className="eyebrow">{t('pk.voorraad.sales.revenue')}</span>
            <strong>{money(totals.revenue)}</strong>
            <small>{t('pk.voorraad.sales.revenueSub')}</small>
          </div>
        </div>
        <TableWrap label={t('pk.voorraad.sales.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.voorraad.levels.product')}</th>
                <th className="end">{t('pk.voorraad.sales.week')}</th>
                <th className="end">{t('pk.voorraad.sales.month')}</th>
                <th className="end">{t('pk.voorraad.sales.desk')}</th>
                <th className="end">{t('pk.voorraad.sales.webshop')}</th>
                <th className="end">{t('pk.voorraad.sales.treatment')}</th>
                <th className="pk-cell-hide" />
              </tr>
            </thead>
            <tbody>
              {[...products]
                .sort((a, b) => month[b.id].desk + month[b.id].webshop - (month[a.id].desk + month[a.id].webshop))
                .map((p) => {
                  const m = month[p.id];
                  const units = m.desk + m.webshop;
                  return (
                    <tr key={p.id}>
                      <td className="pk-cell-main">
                        <button type="button" className="pk-st-link" onClick={() => openProduct(p.id)}>
                          <strong>{name(p.id)}</strong>
                        </button>
                        {p.soldOut ? <small className="pk-muted pk-st-block">{t('pk.voorraad.status.unavailable')}</small> : null}
                      </td>
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.sales.week')}>
                        {week[p.id].desk + week[p.id].webshop}
                      </td>
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.sales.month')}>
                        <strong>{units}</strong>
                      </td>
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.sales.desk')}>
                        {m.desk}
                      </td>
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.sales.webshop')}>
                        {m.webshop}
                      </td>
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.sales.treatment')}>
                        {m.treatment}
                      </td>
                      <td className="pk-st-sales-bar pk-cell-hide">
                        <Bar value={units} max={top} tone="brand" />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
