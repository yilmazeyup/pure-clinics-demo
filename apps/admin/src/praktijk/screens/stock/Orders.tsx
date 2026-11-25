import { LOCATIONS, startOfDay, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { addWorkdays, requestMail, suggestedQty, type StockOrder, type Supplier, type SupplierId } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Card, Chip, Empty, Field, Modal, TableWrap, Toggle } from '../../kit';
import { SidePanel } from './Panel';
import { cityOf, useProductName, useStock } from './common';

type Line = { product: ProductId; locationId: LocationId; level: number; min: number; onWay: number; suggested: number; manual: boolean };

const lineKey = (l: { product: ProductId; locationId: LocationId }) => `${l.product}@${l.locationId}`;

/** When an automatic request goes out: today at five, or the next working morning once five has passed. */
function autoMoment(now: Date): Date {
  const at = new Date(now);
  if (now.getHours() < 17 && now.getDay() !== 0 && now.getDay() !== 6) {
    at.setHours(17, 0, 0, 0);
    return at;
  }
  const next = addWorkdays(now, 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

/**
 * The request list: what drops below its minimum comes on by itself, and anything can be put on it by hand. Per
 * supplier a request e-mail is drafted from it; a supplier set to automatic gets it by itself, the others wait for a
 * look and a click. Then the orders on their way, and receiving a delivery.
 */
export function Orders() {
  const { t, dayMonth } = useI18n();
  const { now, today, demo } = usePraktijk();
  const name = useProductName();
  const { stock, info, suppliers, setSuppliers, orders, setOrders, book, products, requests, setRequests } = useStock();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState<StockOrder | null>(null);
  const [mailFor, setMailFor] = useState<SupplierId | null>(null);

  const open = orders.filter((o) => !o.receivedAt);
  const onWay = (p: ProductId, l: LocationId) =>
    open.reduce((s, o) => s + o.lines.filter((x) => x.product === p && x.locationId === l).reduce((n, x) => n + x.qty, 0), 0);
  const isAsked = (p: ProductId, l: LocationId) => requests.some((r) => r.product === p && r.locationId === l);

  // Below the minimum, counting what is already on its way: order up to twice the minimum.
  const lines: Line[] = [];
  for (const p of products) {
    if (p.soldOut) continue;
    for (const l of LOCATIONS) {
      const level = stock[l.id][p.id];
      const min = info[p.id].min[l.id];
      const coming = onWay(p.id, l.id);
      if (level + coming < min)
        lines.push({ product: p.id, locationId: l.id, level, min, onWay: coming, suggested: min * 2 - level - coming, manual: isAsked(p.id, l.id) });
    }
  }
  // And what was put on the list by hand.
  for (const r of requests) {
    if (lines.some((l) => l.product === r.product && l.locationId === r.locationId)) continue;
    const p = products.find((x) => x.id === r.product);
    if (!p || p.soldOut) continue;
    const level = stock[r.locationId][r.product];
    const min = info[r.product].min[r.locationId];
    const coming = onWay(r.product, r.locationId);
    lines.push({ product: r.product, locationId: r.locationId, level, min, onWay: coming, suggested: suggestedQty(level, coming, min), manual: true });
  }
  const bySupplier = suppliers
    .map((s) => ({ supplier: s, lines: lines.filter((l) => info[l.product].supplier === s.id) }))
    .filter((g) => g.lines.length);
  const unavailable = products.filter((p) => p.soldOut);
  const qtyOf = (l: Line) => qty[lineKey(l)] ?? l.suggested;

  const remove = (l: Line) => setRequests((list) => list.filter((r) => !(r.product === l.product && r.locationId === l.locationId)));

  const place = (supplier: Supplier, list: Line[], mail: { to: string; subject: string }) => {
    const number = `B-2026-${119 + orders.length}`;
    const order: StockOrder = {
      id: `o-${Date.now()}`,
      number,
      supplier: supplier.id,
      lines: list.map((l) => ({ product: l.product, locationId: l.locationId, qty: qtyOf(l) })).filter((l) => l.qty > 0),
      placed: new Date(now),
      expected: addWorkdays(now, supplier.leadDays),
      receivedAt: null,
      mail: { ...mail, auto: false },
    };
    if (!order.lines.length) return;
    setOrders((o) => [order, ...o]);
    // What was ordered leaves the request list.
    setRequests((r) => r.filter((x) => !list.some((l) => l.product === x.product && l.locationId === x.locationId)));
    setMailFor(null);
    demo(t('pk.voorraad.mail.sent', { number, email: mail.to }));
  };

  const mailing = bySupplier.find((g) => g.supplier.id === mailFor) ?? null;
  const when = autoMoment(now);
  const supplierName = (id: SupplierId) => suppliers.find((s) => s.id === id)?.name ?? id;
  const received = orders.filter((o) => o.receivedAt).slice(0, 6);

  return (
    <div className="pk-stack">
      <Card eyebrow={t('pk.voorraad.order.eyebrow')} title={t('pk.voorraad.order.title')} help={t('pk.voorraad.order.help')} feature="n.order more.request">
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
                    {supplier.auto ? (
                      <Chip tone="good" icon="send">
                        {t('pk.voorraad.mode.auto')}
                      </Chip>
                    ) : (
                      <Chip tone="neutral" icon="clock">
                        {t('pk.voorraad.mode.waiting')}
                      </Chip>
                    )}
                  </span>
                  <button className="btn btn-primary btn-small" onClick={() => setMailFor(supplier.id)}>
                    <PkIcon name="mail" size={14} />
                    {supplier.auto ? t('pk.voorraad.mail.now') : t('pk.voorraad.mail.open')}
                  </button>
                </div>
                {supplier.auto ? (
                  <p className="pk-muted pk-small pk-st-note">
                    <PkIcon name="info" size={14} /> {t('pk.voorraad.mode.autoNote', { day: { date: when }, time: when, email: supplier.email })}
                  </p>
                ) : null}
                <TableWrap label={supplier.name}>
                  <table className="pk-table pk-cards">
                    <thead>
                      <tr>
                        <th>{t('pk.voorraad.levels.product')}</th>
                        <th>{t('pk.common.location')}</th>
                        <th className="end">{t('pk.voorraad.order.level')}</th>
                        <th className="end">{t('pk.voorraad.order.onWay')}</th>
                        <th className="end">{t('pk.voorraad.order.suggested')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((l) => (
                        <tr key={lineKey(l)}>
                          <td className="pk-cell-main">
                            {name(l.product)}
                            {l.manual ? (
                              <small className="pk-st-block">
                                <Chip tone="brand">{t('pk.voorraad.ask.manual')}</Chip>
                              </small>
                            ) : null}
                          </td>
                          <td className="pk-cell-inline">{cityOf(l.locationId)}</td>
                          <td className="end nowrap pk-cell-half" data-label={t('pk.voorraad.order.level')}>
                            <span className={l.level >= l.min ? 'pk-st-level' : l.level ? 'pk-st-level pk-st-level--low' : 'pk-st-level pk-st-level--out'}>{l.level}</span>
                            <small className="pk-muted pk-st-min">{t('pk.voorraad.levels.min', { n: l.min })}</small>
                          </td>
                          <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.order.onWay')}>
                            {l.onWay || '–'}
                          </td>
                          <td className="end pk-cell-half" data-label={t('pk.voorraad.order.suggested')}>
                            <input
                              type="number"
                              min={0}
                              className="pk-input pk-st-qty"
                              aria-label={`${t('pk.voorraad.order.suggested')} · ${name(l.product)}`}
                              value={qtyOf(l)}
                              onChange={(e) => setQty((q) => ({ ...q, [lineKey(l)]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                            />
                          </td>
                          <td className="end pk-cell-half">
                            {l.manual && l.level + l.onWay >= l.min ? (
                              <button type="button" className="icon-button small" aria-label={t('pk.voorraad.ask.remove', { product: name(l.product) })} onClick={() => remove(l)}>
                                <PkIcon name="close" size={15} />
                              </button>
                            ) : null}
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
                      <td className="pk-cell-main">
                        <span className="pk-mono">{o.number}</span>
                        {o.mail ? (
                          <small className="pk-muted pk-st-block">
                            <PkIcon name="mail" size={12} /> {o.mail.auto ? t('pk.voorraad.mail.byItself') : t('pk.voorraad.mail.byMail')}
                          </small>
                        ) : null}
                      </td>
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

      <SidePanel open={mailing !== null} onClose={() => setMailFor(null)} label={t('pk.voorraad.mail.eyebrow')}>
        {mailing ? (
          <MailView
            key={`${mailing.supplier.id}-${mailing.lines.map((l) => `${lineKey(l)}:${qtyOf(l)}`).join(',')}`}
            supplier={mailing.supplier}
            lines={mailing.lines.map((l) => ({ product: l.product, locationId: l.locationId, qty: qtyOf(l) })).filter((l) => l.qty > 0)}
            onAuto={(auto) => setSuppliers((list) => list.map((x) => (x.id === mailing.supplier.id ? { ...x, auto } : x)))}
            onSend={(mail) => place(mailing.supplier, mailing.lines, mail)}
          />
        ) : null}
      </SidePanel>

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

/** The request e-mail to one supplier, drafted from the list; it can be changed before it goes. */
function MailView({
  supplier,
  lines,
  onAuto,
  onSend,
}: {
  supplier: Supplier;
  lines: { product: ProductId; locationId: LocationId; qty: number }[];
  onAuto: (auto: boolean) => void;
  onSend: (mail: { to: string; subject: string }) => void;
}) {
  const { t } = useI18n();
  const [mail, setMail] = useState(() => requestMail(supplier, lines));
  return (
    <>
      <div className="pk-dt-body">
        <header className="pk-dt-head">
          <span className="eyebrow">{t('pk.voorraad.mail.eyebrow')}</span>
          <h2>{supplier.name}</h2>
          <p className="pk-dt-sub">{t('pk.voorraad.mail.sub')}</p>
        </header>
        <div className="pk-form pk-st-mail">
          <Field label={t('pk.voorraad.mail.to')}>
            <input className="pk-input pk-mono" type="email" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
          </Field>
          <Field label={t('pk.voorraad.mail.subject')}>
            <input className="pk-input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
          </Field>
          <Field label={t('pk.voorraad.mail.body')} hint={t('pk.voorraad.mail.dutch')} wide>
            <textarea className="pk-input pk-st-mail-body" rows={14} value={mail.body} dir="ltr" lang="nl" onChange={(e) => setMail({ ...mail, body: e.target.value })} />
          </Field>
        </div>
        <section className="pk-dt-section">
          <Toggle checked={supplier.auto} onChange={onAuto} label={t('pk.voorraad.mode.toggle')} hint={t('pk.voorraad.mode.toggleHint')} />
        </section>
        <p className="pk-muted pk-small">{t('pk.voorraad.mail.demo')}</p>
      </div>
      <div className="pk-dt-foot">
        <button type="button" className="btn btn-primary" disabled={!lines.length || !mail.to.includes('@')} onClick={() => onSend({ to: mail.to, subject: mail.subject })}>
          <PkIcon name="send" size={15} />
          {t('pk.voorraad.mail.send')}
        </button>
      </div>
    </>
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
