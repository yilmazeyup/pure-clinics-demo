import { dateKey, LOCATIONS, PRODUCTS, sameDay, type LocationId } from '@pure-clinics/shared';
import { useMemo, useRef, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { agendaDay, clientFor } from '../../data/core';
import { byBarcode, lineFor, nextNumber, PACKAGE_EAN, PACKAGE_ZONES, packageTotal, PAY_METHODS, PRODUCT_EAN, round2, totals, type Invoice, type InvoiceLine, type LineRef } from '../../data/billing';
import { PkIcon } from '../../icons';
import { Card, Chip, Empty, Seg, TableWrap, isolate, useMoney } from '../../kit';
import { METHOD_KEY, useLineLabel } from './format';
import { PaymentPanel } from './PaymentPanel';
import type { Billing } from './state';

const sameRef = (a: LineRef, b: LineRef) =>
  a.type === b.type && ((a.type === 'product' && b.type === 'product' && a.id === b.id) || (a.type === 'package' && b.type === 'package' && a.zone === b.zone));

/**
 * The till: products and laser packages by barcode or by tile, paid at once on a product-only invoice that takes the
 * units off the shelf. Below it, the end-of-day closing per location.
 */
export function KassaTab({ billing, onPreview }: { billing: Billing; onPreview: (inv: Invoice) => void }) {
  const { t, text } = useI18n();
  const { today, now, demo } = usePraktijk();
  const money = useMoney();
  const label = useLineLabel();
  const [location, setLocation] = useState<LocationId>('nijmegen');
  const [basket, setBasket] = useState<InvoiceLine[]>([]);
  const [code, setCode] = useState('');
  const [unknown, setUnknown] = useState(false);
  const scanner = useRef<HTMLInputElement>(null);
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of agendaDay(today)) if (a.clinic === location && !seen.has(a.client)) seen.set(a.client, a.client);
    return [...seen.keys()];
  }, [today, location]);
  const [buyer, setBuyer] = useState('');
  const who = clients.includes(buyer) ? buyer : (clients[0] ?? 'Emma B.');
  const levels = billing.stock[location];

  const add = (ref: LineRef) => {
    setBasket((list) => {
      const found = list.find((l) => sameRef(l.ref, ref));
      return found ? list.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l)) : [...list, lineFor(ref)];
    });
  };

  const scan = (value = code) => {
    const ref = byBarcode(value);
    setUnknown(!ref);
    if (ref) {
      add(ref);
      setCode('');
    }
    scanner.current?.focus();
  };

  /** A demo scan: the code of a random product that is in stock appears in the field and is added. */
  const simulate = () => {
    const pool = PRODUCTS.filter((p) => !p.soldOut && (levels[p.id] ?? 0) > 0);
    const product = pool[Math.floor(Math.random() * pool.length)];
    if (!product) return;
    setCode(PRODUCT_EAN[product.id]);
    window.setTimeout(() => scan(PRODUCT_EAN[product.id]), 350);
  };

  const sale: Invoice = { ...billing.newInvoice('products', location, who, basket), id: 'basket' };
  const sum = totals(sale).total;

  const checkout = (payments: Invoice['payments'], onAccount: boolean) => {
    const number = nextNumber(billing.invoices, today.getFullYear());
    const invoice: Invoice = { ...billing.newInvoice('products', location, who, basket), number, date: now, status: 'open' };
    billing.setInvoices((list) => [...list, invoice]);
    // Paying through the shared action also takes a gift card's part off its balance.
    billing.pay(invoice.id, payments, onAccount, number);
    billing.moveStock(location, basket, -1);
    setBasket([]);
    demo(t('pk.facturen.kassa.done', { number }));
    onPreview({ ...invoice, payments, status: onAccount ? 'open' : 'paid' });
  };

  return (
    <div className="pk-grid">
      <Card
        className="span-7"
        eyebrow={t('pk.facturen.kassa.eyebrow')}
        title={t('pk.facturen.kassa.title')}
        help={t('pk.facturen.kassa.help')}
        feature="i.products"
        actions={
          <Seg
            value={location}
            onChange={(l) => {
              setLocation(l);
              setBasket([]);
            }}
            label={t('pk.common.location')}
            options={LOCATIONS.map((l) => ({ value: l.id, label: l.city }))}
          />
        }
      >
        <div className="pk-bi-scan" data-feature="m.barcode">
          <label className="pk-search">
            <PkIcon name="barcode" size={16} />
            <input
              ref={scanner}
              className="pk-input pk-mono"
              inputMode="numeric"
              placeholder={t('pk.facturen.kassa.barcode')}
              aria-label={t('pk.facturen.kassa.barcode')}
              aria-invalid={unknown}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setUnknown(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && scan()}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={simulate}>
            <PkIcon name="scan" size={16} />
            {t('pk.facturen.kassa.scan')}
          </button>
          {unknown ? <Chip tone="bad">{t('pk.facturen.kassa.unknown')}</Chip> : <span className="pk-small pk-muted">{t('pk.facturen.kassa.scanHelp')}</span>}
        </div>

        <h3 className="pk-subtitle">{t('pk.facturen.kassa.products')}</h3>
        <div className="pk-bi-tiles">
          {PRODUCTS.map((p) => {
            const left = levels[p.id] ?? 0;
            return (
              <button key={p.id} type="button" className="pk-bi-tile" disabled={left <= 0} onClick={() => add({ type: 'product', id: p.id })}>
                <small className="pk-muted">{p.brand ?? 'Pure Clinics'}</small>
                <strong>{text(p.name)}</strong>
                <span className="pk-bi-tile-foot">
                  <span className="pk-num">{money(p.price)}</span>
                  <Chip tone={left <= 0 ? 'bad' : left < 4 ? 'warn' : 'outline'}>{left <= 0 ? t('shop.soldOut') : t('pk.facturen.kassa.left', { n: left })}</Chip>
                </span>
                <small className="pk-mono pk-muted">{PRODUCT_EAN[p.id]}</small>
              </button>
            );
          })}
        </div>

        <div data-feature="l.packages">
          <h3 className="pk-subtitle">{t('pk.facturen.kassa.packages')}</h3>
          <p className="help">{t('pk.facturen.kassa.packagesHelp')}</p>
          <div className="pk-bi-tiles">
            {PACKAGE_ZONES.map((z) => (
              <button key={z.id} type="button" className="pk-bi-tile pk-bi-tile--package" onClick={() => add({ type: 'package', zone: z.id })}>
                <small className="pk-muted">{t('pk.facturen.kassa.packageKind')}</small>
                <strong>{text(z.name)}</strong>
                <span className="pk-bi-tile-foot">
                  <span className="pk-num">{money(packageTotal(z.id))}</span>
                  <span className="pk-small pk-muted">{t('pk.facturen.kassa.perTime', { amount: money(round2(packageTotal(z.id) / 6)) })}</span>
                </span>
                <small className="pk-mono pk-muted">{PACKAGE_EAN[z.id]}</small>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <section className="card pk-card span-5 pk-bi-basket">
        <div className="card-head">
          <div>
            <span className="eyebrow">{t('pk.facturen.kassa.basketEyebrow')}</span>
            <h2 className="card-title">{t('pk.facturen.kassa.basket')}</h2>
          </div>
          <span className="pk-chip pk-chip--brand">{t('pk.facturen.kind.products')}</span>
        </div>
        <label className="pk-field">
          <span className="pk-field-label">{t('pk.common.client')}</span>
          <select className="pk-input" value={who} onChange={(e) => setBuyer(e.target.value)}>
            {clients.map((c) => {
              const file = clientFor(c, location, today);
              return (
                <option key={c} value={c}>
                  {file.first} {file.last}
                </option>
              );
            })}
          </select>
        </label>
        {basket.length ? (
          <ul className="pk-bi-lines">
            {basket.map((l) => (
              <li key={l.key}>
                <span className="pk-bi-line-name">{label(l.ref)}</span>
                <span className="pk-bi-qty">
                  <button type="button" aria-label={t('pk.facturen.editor.less')} onClick={() => setBasket((list) => list.flatMap((x) => (x.key !== l.key ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])))}>
                    <PkIcon name="minus" size={14} />
                  </button>
                  <span className="pk-num">{l.qty}</span>
                  <button type="button" aria-label={t('pk.facturen.editor.more')} onClick={() => setBasket((list) => list.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)))}>
                    <PkIcon name="plus" size={14} />
                  </button>
                </span>
                <strong className="pk-num pk-bi-line-total">{money(l.qty * l.unit)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('pk.facturen.kassa.empty')}</Empty>
        )}
        <dl className="pk-bi-sums">
          <dt>{t('pk.facturen.doc.vat21')}</dt>
          <dd>{money(totals(sale).vat21)}</dd>
          <dt className="pk-bi-total">{t('pk.common.total')}</dt>
          <dd className="pk-bi-total">{money(sum)}</dd>
        </dl>
        <PaymentPanel amount={sum} disabled={!basket.length} onPay={checkout} />
      </section>

      <Closing billing={billing} />
    </div>
  );
}

/** End of the day: what came in per payment method at each location, then the day is closed. */
function Closing({ billing }: { billing: Billing }) {
  const { t, clock } = useI18n();
  const { now, demo } = usePraktijk();
  const money = useMoney();
  const key = dateKey(now);
  return (
    <Card className="span-12" eyebrow={t('pk.facturen.closing.eyebrow')} title={t('pk.facturen.closing.title')} help={t('pk.facturen.closing.help')} feature="m.closing">
      <div className="pk-bi-closing">
        {LOCATIONS.map((l) => {
          const payments = billing.invoices.filter((i) => i.locationId === l.id).flatMap((i) => i.payments.filter((p) => sameDay(p.at, now)));
          const closed = billing.closures.find((c) => c.locationId === l.id && c.day === key);
          const total = payments.reduce((s, p) => s + p.amount, 0);
          return (
            <div key={l.id} className="pk-bi-closing-loc">
              <div className="pk-row pk-row--between">
                <h3 className="pk-subtitle">{l.city}</h3>
                {closed ? <Chip tone="good" icon="lock">{t('pk.facturen.closing.closedAt', { time: clock(closed.at) })}</Chip> : <Chip tone="outline">{t('pk.facturen.closing.openDay')}</Chip>}
              </div>
              <TableWrap label={l.city}>
                <table className="pk-table">
                  <thead>
                    <tr>
                      <th>{t('pk.facturen.pay.title')}</th>
                      <th className="end">{t('pk.facturen.closing.count')}</th>
                      <th className="end">{t('pk.common.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...PAY_METHODS.filter((m) => m !== 'account'), 'gift' as const].map((m) => {
                      const list = payments.filter((p) => p.method === m);
                      return (
                        <tr key={m}>
                          <td>{t(METHOD_KEY[m])}</td>
                          <td className="end">{list.length}</td>
                          <td className="end">{money(list.reduce((s, p) => s + p.amount, 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>{t('pk.common.total')}</td>
                      <td className="end">{payments.length}</td>
                      <td className="end">{money(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(closed)}
                onClick={() => {
                  billing.setClosures((list) => [...list, { locationId: l.id, day: key, at: now }]);
                  demo(t('pk.facturen.closing.done', { city: isolate(l.city), amount: money(total) }));
                }}
              >
                <PkIcon name="lock" size={16} />
                {t('pk.facturen.closing.close', { city: l.city })}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
