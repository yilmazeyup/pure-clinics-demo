import { LOCATIONS, productById, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useI18n, type MessageKey } from '../../../i18n';
import { usePraktijk } from '../../context';
import { soldIn } from '../../data/stock';
import { PkIcon, type PkIconName } from '../../icons';
import { Chip, Seg, useMoney } from '../../kit';
import { cityOf, LevelChip, levelOf, RunOutChip, Stars, useDaysLeft, useProductName, useStock, useStockUi } from './common';

// The screen's own side panel, in the look of the module's detail panel (details.css): a product with its stock per
// clinic, what it sold, when it runs out, its supplier and its reviews; and, from the request list, the request e-mail.

/** The sliding panel itself: backdrop, close button, Escape, focus in and back out. */
export function SidePanel({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  // Keep the content on screen while the panel slides out.
  const [shown, setShown] = useState<ReactNode>(children);
  useEffect(() => {
    if (open) setShown(children);
  }, [open, children]);
  useEffect(() => {
    if (open) return;
    const id = window.setTimeout(() => setShown(null), 260);
    return () => window.clearTimeout(id);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);
  const host = document.querySelector('.app');
  if (!host || (!open && !shown)) return null;
  return createPortal(
    <div className={`pk-dt-layer ${open ? 'is-open' : ''}`}>
      <div className="pk-dt-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={box} className="pk-dt" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="pk-dt-top">
          <span />
          <button type="button" className="pk-dt-icon" onClick={onClose} aria-label={t('pk.common.close')}>
            <PkIcon name="close" size={20} />
          </button>
        </div>
        {open ? children : shown}
      </div>
    </div>,
    host,
  );
}

function Lines({ rows }: { rows: { icon: PkIconName; label: string; value: ReactNode }[] }) {
  return (
    <dl className="pk-dt-lines">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>
            <PkIcon name={r.icon} size={16} />
            {r.label}
          </dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children, count }: { title: string; children: ReactNode; count?: ReactNode }) {
  return (
    <section className="pk-dt-section">
      <h3>
        {title}
        {count !== undefined ? <small>{count}</small> : null}
      </h3>
      {children}
    </section>
  );
}

/** Everything about one product, with its supplier to change and a button to put it on the request list. */
export function ProductView({ id }: { id: ProductId }) {
  const i18n = useI18n();
  const { t, dayMonth, text } = i18n;
  const { today, now } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const daysLeft = useDaysLeft();
  const { ask } = useStockUi();
  const { stock, info, setInfo, suppliers, forecast, moves, reviews, requests } = useStock();
  const product = productById(id);
  const [where, setWhere] = useState<LocationId>(() => forecast.find((f) => f.product === id)?.locationId ?? 'nijmegen');
  const week = useMemo(() => soldIn(moves, today, 7, 'all')[id], [moves, today, id]);
  const month = useMemo(() => soldIn(moves, today, 30, 'all')[id], [moves, today, id]);
  if (!product) return null;
  const d = info[id];
  const supplier = suppliers.find((s) => s.id === d.supplier);
  const own = reviews.filter((r) => r.product === id);
  const average = own.length ? own.reduce((s, r) => s + r.rating, 0) / own.length : 0;
  const rows = forecast.filter((f) => f.product === id);
  const asked = requests.some((r) => r.product === id && r.locationId === where);

  return (
    <>
      <div className="pk-dt-body">
        <header className="pk-dt-head">
          <span className="eyebrow">{product.brand ?? t(`pk.voorraad.cat.${product.category}`)}</span>
          <h2>{product.brand ? text(product.name) : name(id)}</h2>
          <p className="pk-dt-sub">
            {money(d.price)} · {t(`pk.voorraad.cat.${product.category}`)}
          </p>
          <div className="pk-dt-chips">
            {product.soldOut ? <Chip tone="outline">{t('pk.voorraad.status.unavailable')}</Chip> : null}
            {own.length ? (
              <Chip tone="neutral">
                <Stars rating={average} label={t('pk.voorraad.rev.average', { n: average.toFixed(1) })} /> {own.length}
              </Chip>
            ) : null}
          </div>
        </header>

        <Section title={t('pk.voorraad.panel.stock')}>
          <ul className="pk-st-panel-loc">
            {LOCATIONS.map((l) => {
              const f = rows.find((x) => x.locationId === l.id);
              const level = stock[l.id][id];
              return (
                <li key={l.id}>
                  <span>
                    <strong>{l.city}</strong>
                    <small className="pk-muted">
                      {t('pk.voorraad.levels.min', { n: d.min[l.id] })}
                      {f?.onWay ? ` · ${t('pk.voorraad.panel.onWay', { n: f.onWay })}` : ''}
                    </small>
                  </span>
                  <span className={`pk-st-level pk-st-level--${levelOf(level, d.min[l.id], product.soldOut)}`}>{level}</span>
                  {f ? (
                    <span className="pk-st-panel-run">
                      <RunOutChip bucket={f.bucket} />
                      <small className="pk-muted">
                        {daysLeft(f)}
                        {f.orderBy ? ` · ${t('pk.voorraad.panel.orderBy', { date: dayMonth(f.orderBy, now) })}` : ''}
                      </small>
                    </span>
                  ) : (
                    <LevelChip level={levelOf(level, d.min[l.id], product.soldOut)} />
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={t('pk.voorraad.panel.sold')}>
          <Lines
            rows={[
              { icon: 'chart', label: t('pk.voorraad.sales.week'), value: week.desk + week.webshop },
              { icon: 'chart', label: t('pk.voorraad.sales.month'), value: month.desk + month.webshop },
              { icon: 'building', label: t('pk.voorraad.sales.desk'), value: month.desk },
              { icon: 'globe', label: t('pk.voorraad.sales.webshop'), value: month.webshop },
              { icon: 'syringe', label: t('pk.voorraad.sales.treatment'), value: month.treatment },
            ]}
          />
        </Section>

        <Section title={t('pk.voorraad.panel.supplier')}>
          <label className="pk-field">
            <span className="pk-field-label">{t('pk.voorraad.onway.supplier')}</span>
            <select
              className="pk-input"
              value={d.supplier}
              onChange={(e) => setInfo((all) => ({ ...all, [id]: { ...all[id], supplier: e.target.value } }))}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {supplier ? (
            <Lines
              rows={[
                { icon: 'truck', label: t('pk.voorraad.suppliers.lead'), value: supplier.leadDays },
                { icon: 'mail', label: t('pk.voorraad.suppliers.email'), value: <span className="pk-mono">{supplier.email}</span> },
                { icon: 'send', label: t('pk.voorraad.mode.label'), value: supplier.auto ? t('pk.voorraad.mode.auto') : t('pk.voorraad.mode.manual') },
              ]}
            />
          ) : null}
        </Section>

        <Section title={t('pk.voorraad.rev.title')} count={own.length}>
          {own.length ? (
            <ul className="pk-st-reviews pk-st-reviews--panel">
              {own.slice(0, 3).map((r) => (
                <li key={r.id}>
                  <span className="pk-st-review-head">
                    <Stars rating={r.rating} label={t('pk.voorraad.rev.stars', { n: r.rating })} />
                    <strong>{r.name}</strong>
                    <small className="pk-muted">{dayMonth(r.at, now)}</small>
                  </span>
                  <p>{t(`pk.voorraad.rev.t.${product.category}.${r.text}` as MessageKey)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pk-muted pk-small">{t('pk.voorraad.rev.none')}</p>
          )}
          <p className="pk-muted pk-small">{t('pk.voorraad.rev.demo')}</p>
        </Section>
      </div>
      {product.soldOut ? null : (
        <div className="pk-dt-foot pk-st-panel-foot">
          <Seg
            label={t('pk.common.location')}
            value={where}
            onChange={setWhere}
            options={LOCATIONS.map((l) => ({ value: l.id, label: l.city }))}
          />
          {asked ? (
            <span className="pk-st-asked">
              <PkIcon name="check" size={14} />
              {t('pk.voorraad.ask.doneIn', { city: cityOf(where) })}
            </span>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => ask(id, where)}>
              <PkIcon name="plus" size={15} />
              {t('pk.voorraad.ask.button')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
