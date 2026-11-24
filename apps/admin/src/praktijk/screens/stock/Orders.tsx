import { LOCATIONS, startOfDay, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { addWorkdays, type StockOrder, type SupplierId } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Card, Chip, Empty, Modal, TableWrap } from '../../kit';
import { cityOf, useProductName, useStock } from './common';

type Line = { product: ProductId; locationId: LocationId; level: number; min: number; onWay: number; suggested: number };

const lineKey = (l: { product: ProductId; locationId: LocationId }) => `${l.product}@${l.locationId}`;

/** The order list that fills itself from the minimums, the orders on their way, and receiving a delivery. */
export function Orders() {
  const { t, dayMonth } = useI18n();
  const { now, today, demo } = usePraktijk();
  const name = useProductName();
  const { stock, info, suppliers, orders, setOrders, book, products } = useStock();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState<StockOrder | null>(null);

  const open = orders.filter((o) => !o.receivedAt);
  const onWay = (p: ProductId, l: LocationId) =>
    open.reduce((s, o) => s + o.lines.filter((x) => x.product === p && x.locationId === l).reduce((n, x) => n + x.qty, 0), 0);

  // Below the minimum, counting what is already on its way: order up to twice the minimum.
  const lines: Line[] = [];
  for (const p of products) {
    if (p.soldOut) continue;
    for (const l of LOCATIONS) {
      const level = stock[l.id][p.id];
      const min = info[p.id].min[l.id];
      const coming = onWay(p.id, l.id);
      if (level + coming < min) lines.push({ product: p.id, locationId: l.id, level, min, onWay: coming, suggested: min * 2 - level - coming });
    }
  }
  const bySupplier = suppliers
    .map((s) => ({ supplier: s, lines: lines.filter((l) => info[l.product].supplier === s.id) }))
    .filter((g) => g.lines.length);
  const unavailable = products.filter((p) => p.soldOut);

  const place = (supplier: SupplierId, list: Line[]) => {
    const s = suppliers.find((x) => x.id === supplier)!;
    const number = `B-2026-${119 + orders.length}`;
    const order: StockOrder = {
      id: `o-${Date.now()}`,
      number,
      supplier,
      lines: list.map((l) => ({ product: l.product, locationId: l.locationId, qty: qty[lineKey(l)] ?? l.suggested })).filter((l) => l.qty > 0),
      placed: new Date(now),
      expected: addWorkdays(now, s.leadDays),
      receivedAt: null,
    };
    if (!order.lines.length) return;
    setOrders((o) => [order, ...o]);
    demo(t('pk.voorraad.order.placed', { number, supplier: s.name }));
  };

  const supplierName = (id: SupplierId) => suppliers.find((s) => s.id === id)?.name ?? id;
  const received = orders.filter((o) => o.receivedAt).slice(0, 6);

  return (
    <div className="pk-stack">
      <Card eyebrow={t('pk.voorraad.order.eyebrow')} title={t('pk.voorraad.order.title')} help={t('pk.voorraad.order.help')} feature="n.order">
        {bySupplier.length ? (
          <div className="pk-stack">
            {bySupplier.map(({ supplier, lines: list }) => (
              <div key={supplier.id} className="pk-st-supplier-order">
                <div className="pk-row pk-row--between">
                  <span className="pk-row">
                    <strong className="pk-subtitle pk-st-inline">{supplier.name}</strong>
                    <Chip tone="outline" icon="truck">
                      {t('pk.voorraad.order.lead', { n: supplier.leadDays })}
                    </Chip>
                  </span>
                  <button className="btn btn-primary btn-small" onClick={() => place(supplier.id, list)}>
                    <PkIcon name="send" size={14} />
                    {t('pk.voorraad.order.place')}
                  </button>
                </div>
                <TableWrap label={supplier.name}>
                  <table className="pk-table pk-cards">
                    <thead>
                      <tr>
                        <th>{t('pk.voorraad.levels.product')}</th>
                        <th>{t('pk.common.location')}</th>
                        <th className="end">{t('pk.voorraad.order.level')}</th>
                        <th className="end">{t('pk.voorraad.order.onWay')}</th>
                        <th className="end">{t('pk.voorraad.order.suggested')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((l) => (
                        <tr key={lineKey(l)}>
                          <td className="pk-cell-main">{name(l.product)}</td>
                          <td className="pk-cell-inline">{cityOf(l.locationId)}</td>
                          <td className="end nowrap pk-cell-half" data-label={t('pk.voorraad.order.level')}>
                            <span className={l.level ? 'pk-st-level pk-st-level--low' : 'pk-st-level pk-st-level--out'}>{l.level}</span>
                            <small className="pk-muted pk-st-min">{t('pk.voorraad.levels.min', { n: l.min })}</small>
                          </td>
                          <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.order.onWay')}>
                            {l.onWay || '–'}
                          </td>
                          <td className="end" data-label={t('pk.voorraad.order.suggested')}>
                            <input
                              type="number"
                              min={0}
                              className="pk-input pk-st-qty"
                              aria-label={`${t('pk.voorraad.order.suggested')} · ${name(l.product)}`}
                              value={qty[lineKey(l)] ?? l.suggested}
                              onChange={(e) => setQty((q) => ({ ...q, [lineKey(l)]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t('pk.voorraad.order.allGood')}</Empty>
        )}
        {unavailable.map((p) => (
          <p key={p.id} className="pk-muted pk-small pk-st-note">
            <PkIcon name="info" size={14} /> {t('pk.voorraad.order.unavailable', { product: name(p.id) })}
          </p>
        ))}
      </Card>

      <Card eyebrow={t('pk.voorraad.onway.eyebrow')} title={t('pk.voorraad.onway.title')}>
        {open.length ? (
          <TableWrap label={t('pk.voorraad.onway.title')}>
            <table className="pk-table pk-cards">
              <thead>
                <tr>
                  <th>{t('pk.voorraad.onway.number')}</th>
                  <th>{t('pk.voorraad.onway.supplier')}</th>
                  <th>{t('pk.voorraad.onway.placed')}</th>
                  <th>{t('pk.voorraad.onway.expected')}</th>
                  <th>{t('pk.voorraad.onway.contents')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((o) => {
                  const late = startOfDay(o.expected).getTime() < startOfDay(today).getTime();
                  return (
                    <tr key={o.id}>
                      <td className="pk-mono pk-cell-main">{o.number}</td>
                      <td className="pk-cell-inline">{supplierName(o.supplier)}</td>
                      <td className="nowrap pk-cell-half" data-label={t('pk.voorraad.onway.placed')}>
                        {dayMonth(o.placed, now)}
                      </td>
                      <td className="nowrap pk-cell-half" data-label={t('pk.voorraad.onway.expected')}>
                        {dayMonth(o.expected, now)} {late ? <Chip tone="warn">{t('pk.voorraad.onway.late')}</Chip> : null}
                      </td>
                      <td className="pk-st-contents pk-cell-full">
                        {o.lines.map((l) => (
                          <span key={lineKey(l)}>
                            {l.qty}× {name(l.product)} · {cityOf(l.locationId)}
                          </span>
                        ))}
                      </td>
                      <td className="end pk-cell-full">
                        <button className="btn btn-ghost btn-small" onClick={() => setReceiving(o)}>
                          <PkIcon name="inbox" size={14} />
                          {t('pk.voorraad.onway.receive')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <Empty>{t('pk.voorraad.onway.none')}</Empty>
        )}
      </Card>

      <Card eyebrow={t('pk.voorraad.history.eyebrow')} title={t('pk.voorraad.history.title')}>
        <ul className="pk-list">
          {received.map((o) => {
            const short = o.lines.reduce((s, l) => s + (l.qty - (l.received ?? l.qty)), 0);
            return (
              <li key={o.id}>
                <PkIcon name="box" size={18} />
                <span className="pk-st-history">
                  <strong>
                    <span className="pk-mono">{o.number}</span> · {supplierName(o.supplier)}
                  </strong>
                  <small className="pk-muted">
                    {t('pk.voorraad.history.receivedOn', { date: { date: o.receivedAt! } })} ·{' '}
                    {o.lines.map((l) => `${l.received ?? l.qty}× ${name(l.product)}`).join(', ')}
                  </small>
                </span>
                {short > 0 ? <Chip tone="warn">{t('pk.voorraad.history.short', { n: short })}</Chip> : <Chip tone="good">{t('pk.voorraad.history.complete')}</Chip>}
              </li>
            );
          })}
        </ul>
      </Card>

      {receiving ? (
        <Receive
          order={receiving}
          onClose={() => setReceiving(null)}
          onConfirm={(counted) => {
            book(
              receiving.lines
                .map((l) => ({ product: l.product, locationId: l.locationId, qty: counted[lineKey(l)] ?? l.qty, reason: 'received' as const, by: 'husna' as const }))
                .filter((m) => m.qty > 0),
            );
            setOrders((list) =>
              list.map((o) =>
                o.id === receiving.id
                  ? { ...o, receivedAt: new Date(now), lines: o.lines.map((l) => ({ ...l, received: counted[lineKey(l)] ?? l.qty })) }
                  : o,
              ),
            );
            demo(t('pk.voorraad.receive.done', { number: receiving.number }));
            setReceiving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Receive({ order, onClose, onConfirm }: { order: StockOrder; onClose: () => void; onConfirm: (counted: Record<string, number>) => void }) {
  const { t } = useI18n();
  const name = useProductName();
  const [counted, setCounted] = useState<Record<string, number>>({});
  return (
    <Modal
      open
      title={t('pk.voorraad.receive.title', { number: order.number })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(counted)}>
            <PkIcon name="check" size={15} />
            {t('pk.voorraad.receive.confirm')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.voorraad.receive.help')}</p>
      <TableWrap>
        <table className="pk-table pk-cards">
          <thead>
            <tr>
              <th>{t('pk.voorraad.levels.product')}</th>
              <th>{t('pk.common.location')}</th>
              <th className="end">{t('pk.voorraad.receive.ordered')}</th>
              <th className="end">{t('pk.voorraad.receive.counted')}</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={lineKey(l)}>
                <td className="pk-cell-main">{name(l.product)}</td>
                <td className="pk-cell-inline">{cityOf(l.locationId)}</td>
                <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.receive.ordered')}>
                  {l.qty}
                </td>
                <td className="end pk-cell-half" data-label={t('pk.voorraad.receive.counted')}>
                  <input
                    type="number"
                    min={0}
                    className="pk-input pk-st-qty"
                    aria-label={`${t('pk.voorraad.receive.counted')} · ${name(l.product)}`}
                    value={counted[lineKey(l)] ?? l.qty}
                    onChange={(e) => setCounted((c) => ({ ...c, [lineKey(l)]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Modal>
  );
}
