import { LOCATIONS, productById, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { HISTORY_START, levelsOn, type Move, type MoveReason } from '../../data/stock';
import { staffById } from '../../data/core';
import { PkIcon } from '../../icons';
import { Card, Chip, Field, Modal, Seg, TableWrap, isolate, useMoney } from '../../kit';
import { cityOf, fromIsoDay, isoDay, LevelChip, levelOf, useProductName, useStock, useStockUi } from './common';

type Where = 'all' | LocationId;
type Adjusting = { product: ProductId; locationId: LocationId; direction: 'in' | 'out' };

const REASONS: Record<'in' | 'out', MoveReason[]> = {
  in: ['received', 'correction', 'return'],
  out: ['sale', 'treatment', 'correction', 'return'],
};

/** The levels per location, today or on any day of the last ten weeks, with manual bookings and the movements log. */
export function Levels() {
  const i18n = useI18n();
  const { t, dayMonth, clock } = i18n;
  const { today, now } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const { stock, info, products, seeded, booked, book, requests } = useStock();
  const { openProduct, ask } = useStockUi();
  const [where, setWhere] = useState<Where>('all');
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(isoDay(today));
  const [adjusting, setAdjusting] = useState<Adjusting | null>(null);
  const [more, setMore] = useState(false);

  const past = day !== isoDay(today);
  const shown = useMemo(() => (past ? levelsOn(fromIsoDay(day), seeded) : stock), [past, day, seeded, stock]);
  const locations = where === 'all' ? LOCATIONS : LOCATIONS.filter((l) => l.id === where);
  const list = products.filter((p) => name(p.id).toLowerCase().includes(query.trim().toLowerCase()));

  const moves = useMemo(
    () => [...booked, ...seeded].filter((m) => where === 'all' || m.locationId === where).slice(0, more ? 40 : 12),
    [booked, seeded, where, more],
  );

  return (
    <div className="pk-stack">
      <Card
        eyebrow={t('pk.voorraad.levels.eyebrow')}
        title={t('pk.voorraad.levels.title')}
        help={t('pk.voorraad.levels.help')}
        feature="n.location"
        actions={past ? <Chip tone="brand" icon="history">{t('pk.voorraad.past.chip', { date: { date: fromIsoDay(day) } })}</Chip> : null}
      >
        <div className="pk-st-toolbar">
          <Seg
            label={t('pk.voorraad.levels.locations')}
            value={where}
            onChange={setWhere}
            options={[{ value: 'all', label: t('pk.common.allLocations') }, ...LOCATIONS.map((l) => ({ value: l.id, label: l.city }))]}
          />
          <label className="pk-search pk-st-search">
            <PkIcon name="search" size={16} />
            <input className="pk-input" value={query} placeholder={t('pk.voorraad.levels.search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="pk-st-past" data-feature="n.past">
            <Field label={t('pk.voorraad.past.label')}>
              <input
                type="date"
                className="pk-input"
                value={day}
                min={isoDay(HISTORY_START(today))}
                max={isoDay(today)}
                onChange={(e) => e.target.value && setDay(e.target.value)}
              />
            </Field>
            {past ? (
              <button className="btn btn-ghost btn-small" onClick={() => setDay(isoDay(today))}>
                {t('pk.voorraad.past.back')}
              </button>
            ) : (
              <small className="pk-muted pk-small">{t('pk.voorraad.past.hint')}</small>
            )}
          </div>
        </div>

        <TableWrap label={t('pk.voorraad.levels.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.voorraad.levels.product')}</th>
                {locations.map((l) => (
                  <th key={l.id} className="end">
                    {l.city}
                  </th>
                ))}
                {past ? <th className="end">{t('pk.voorraad.past.diff')}</th> : null}
                <th>{t('pk.common.status')}</th>
                <th className="end">{t('pk.voorraad.levels.purchase')}</th>
                <th className="end">{t('pk.voorraad.levels.sale')}</th>
                {past ? null : <th className="end">{t('pk.voorraad.levels.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const d = info[p.id];
                const worst = locations
                  .map((l) => levelOf(shown[l.id][p.id], d.min[l.id], p.soldOut))
                  .sort((a, b) => RANK[b] - RANK[a])[0];
                const diff = locations.reduce((s, l) => s + stock[l.id][p.id] - shown[l.id][p.id], 0);
                return (
                  <tr key={p.id}>
                    <td className="pk-cell-main">
                      <button type="button" className="pk-st-product pk-st-link" onClick={() => openProduct(p.id)}>
                        <strong>{name(p.id)}</strong>
                        <small className="pk-muted">{t(`pk.voorraad.cat.${p.category}`)}</small>
                      </button>
                    </td>
                    {locations.map((l) => {
                      const level = shown[l.id][p.id];
                      const state = levelOf(level, d.min[l.id], p.soldOut);
                      return (
                        <td key={l.id} className="end nowrap pk-cell-half" data-label={l.city}>
                          <span className={`pk-st-level pk-st-level--${state}`}>{level}</span>
                          <small className="pk-muted pk-st-min">{t('pk.voorraad.levels.min', { n: d.min[l.id] })}</small>
                        </td>
                      );
                    })}
                    {past ? (
                      <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.past.diff')}>
                        <span dir="ltr" className={diff > 0 ? 'pk-st-plus' : diff < 0 ? 'pk-st-minus' : 'pk-muted'}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      </td>
                    ) : null}
                    <td className="pk-cell-side">
                      <LevelChip level={worst} />
                    </td>
                    <td className="end nowrap pk-cell-half" data-label={t('pk.voorraad.levels.purchase')}>
                      {money(d.purchase)}
                    </td>
                    <td className="end nowrap pk-cell-half" data-label={t('pk.voorraad.levels.sale')}>
                      {money(d.price)}
                    </td>
                    {past ? null : (
                      <td className="end pk-cell-full">
                        <span className="pk-st-actions">
                          {p.soldOut ? null : requests.some((r) => r.product === p.id && (where === 'all' || r.locationId === where)) ? (
                            <span className="pk-st-asked">
                              <PkIcon name="check" size={13} />
                              {t('pk.voorraad.ask.done')}
                            </span>
                          ) : (
                            <button className="btn btn-ghost btn-small" onClick={() => ask(p.id, where === 'all' ? undefined : where)}>
                              <PkIcon name="truck" size={14} />
                              {t('pk.voorraad.ask.button')}
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-small"
                            onClick={() => setAdjusting({ product: p.id, locationId: where === 'all' ? 'nijmegen' : where, direction: 'in' })}
                          >
                            <PkIcon name="plus" size={14} />
                            {t('pk.voorraad.levels.in')}
                          </button>
                          <button
                            className="btn btn-ghost btn-small"
                            onClick={() => setAdjusting({ product: p.id, locationId: where === 'all' ? 'nijmegen' : where, direction: 'out' })}
                          >
                            <PkIcon name="minus" size={14} />
                            {t('pk.voorraad.levels.out')}
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
              {list.length ? null : (
                <tr>
                  <td colSpan={8} className="pk-muted">
                    {t('pk.voorraad.levels.none')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card eyebrow={t('pk.voorraad.moves.eyebrow')} title={t('pk.voorraad.moves.title')} help={t('pk.voorraad.moves.help')}>
        <TableWrap label={t('pk.voorraad.moves.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.voorraad.moves.when')}</th>
                <th>{t('pk.voorraad.levels.product')}</th>
                <th>{t('pk.common.location')}</th>
                <th className="end">{t('pk.voorraad.moves.qty')}</th>
                <th>{t('pk.voorraad.adjust.reason')}</th>
                <th>{t('pk.voorraad.moves.by')}</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m: Move) => (
                <tr key={m.id} className={m.id.startsWith('d-') ? 'pk-st-fresh' : ''}>
                  <td className="nowrap pk-cell-inline">
                    {dayMonth(m.at, now)} · {clock(m.at)}
                  </td>
                  <td className="pk-st-wide pk-cell-main">{name(m.product)}</td>
                  <td className="pk-cell-inline">{cityOf(m.locationId)}</td>
                  <td className="end pk-num pk-cell-side">
                    <span dir="ltr" className={m.qty > 0 ? 'pk-st-plus' : 'pk-st-minus'}>
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </span>
                  </td>
                  <td className="pk-cell-inline">
                    <Chip tone={m.qty > 0 ? 'good' : 'neutral'}>{t(`pk.voorraad.reason.${m.reason}`)}</Chip>
                  </td>
                  <td className="pk-mono pk-cell-inline">{m.channel === 'webshop' ? 'WEB' : staffById(m.by).code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <div className="pk-st-more">
          <button className="btn btn-ghost btn-small" onClick={() => setMore((m) => !m)}>
            {more ? t('pk.voorraad.moves.less') : t('pk.voorraad.moves.more')}
          </button>
        </div>
      </Card>

      <AdjustModal
        adjusting={adjusting}
        onClose={() => setAdjusting(null)}
        onBook={(a, qty, reason) => {
          const signed = a.direction === 'in' ? qty : -qty;
          book([{ product: a.product, locationId: a.locationId, qty: signed, reason, by: 'husna' }]);
          setAdjusting(null);
          return t('pk.voorraad.adjust.done', { product: name(a.product), qty: isolate(signed > 0 ? `+${signed}` : String(signed)), city: cityOf(a.locationId) });
        }}
        levelOf={(p, l) => stock[l][p]}
      />
    </div>
  );
}

const RANK = { ok: 0, unavailable: 1, low: 2, out: 3 } as const;

function AdjustModal({
  adjusting,
  onClose,
  onBook,
  levelOf: current,
}: {
  adjusting: Adjusting | null;
  onClose: () => void;
  onBook: (a: Adjusting, qty: number, reason: MoveReason) => string;
  levelOf: (product: ProductId, location: LocationId) => number;
}) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const name = useProductName();
  const [form, setForm] = useState<{ key: string; direction: 'in' | 'out'; locationId: LocationId; qty: number; reason: MoveReason } | null>(null);
  const key = adjusting ? `${adjusting.product}-${adjusting.direction}-${adjusting.locationId}` : '';
  // A fresh form for every product and direction the dialog opens with.
  const f =
    form && form.key === key
      ? form
      : adjusting
        ? { key, direction: adjusting.direction, locationId: adjusting.locationId, qty: 1, reason: REASONS[adjusting.direction][0] }
        : null;
  if (!adjusting || !f) return null;
  const level = current(adjusting.product, f.locationId);
  const tooMany = f.direction === 'out' && f.qty > level;
  const after = level + (f.direction === 'in' ? f.qty : -f.qty);
  const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });

  return (
    <Modal
      open
      title={t('pk.voorraad.adjust.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={tooMany || f.qty < 1}
            onClick={() => demo(onBook({ ...adjusting, direction: f.direction, locationId: f.locationId }, f.qty, f.reason))}
          >
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <p className="pk-subtitle">{name(adjusting.product)}</p>
      <div className="pk-form">
        <div className="pk-field">
          <span className="pk-field-label">{t('pk.voorraad.adjust.direction')}</span>
          <Seg
            label={t('pk.voorraad.adjust.direction')}
            value={f.direction}
            onChange={(direction) => set({ direction, reason: REASONS[direction][0] })}
            options={[
              { value: 'in', label: t('pk.voorraad.levels.in'), icon: 'plus' },
              { value: 'out', label: t('pk.voorraad.levels.out'), icon: 'minus' },
            ]}
          />
        </div>
        <Field label={t('pk.common.location')}>
          <select className="pk-input" value={f.locationId} onChange={(e) => set({ locationId: e.target.value as LocationId })}>
            {LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={t('pk.voorraad.adjust.qty')}
          hint={tooMany ? t('pk.voorraad.adjust.tooMany', { n: level }) : t('pk.voorraad.adjust.after', { n: Math.max(0, after) })}
        >
          <input
            type="number"
            min={1}
            className="pk-input"
            aria-invalid={tooMany}
            value={f.qty}
            onChange={(e) => set({ qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
          />
        </Field>
        <Field label={t('pk.voorraad.adjust.reason')}>
          <select className="pk-input" value={f.reason} onChange={(e) => set({ reason: e.target.value as MoveReason })}>
            {REASONS[f.direction].map((r) => (
              <option key={r} value={r}>
                {t(`pk.voorraad.reason.${r}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="pk-muted pk-small pk-st-note">
        {t('pk.voorraad.adjust.current', { n: level })}
        {productById(adjusting.product)?.soldOut ? ` · ${t('pk.voorraad.status.unavailable')}` : ''}
      </p>
    </Modal>
  );
}
