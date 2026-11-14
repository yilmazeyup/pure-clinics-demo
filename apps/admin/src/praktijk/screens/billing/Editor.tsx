import { PRODUCTS, treatmentById } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { clientFor, insurerById, staffById } from '../../data/core';
import { lineFor, PACKAGE_ZONES, round2, totals, type Invoice, type LineRef, type Payer } from '../../data/billing';
import { PkIcon } from '../../icons';
import { Chip, Empty, Seg, isolate, useMoney } from '../../kit';
import type { Billing } from './state';
import { InvoiceStatus, KIND_KEY, useLineLabel } from './format';
import { parseAmount, PaymentPanel } from './PaymentPanel';

type Props = { invoice: Invoice | null; billing: Billing; onPreview: (inv: Invoice) => void; onCredit: (inv: Invoice) => void };

/**
 * The invoice being made at the desk: lines from the agenda plus products, a discount in % or €, who pays, then
 * concept → final → paid. An insured invoice made final goes to Declaraties as a Vecozo claim.
 */
export function Editor({ invoice, billing, onPreview, onCredit }: Props) {
  const { t, text } = useI18n();
  const { today, demo, go } = usePraktijk();
  const money = useMoney();
  const label = useLineLabel();
  const [adding, setAdding] = useState('');

  if (!invoice) {
    return (
      <section className="card pk-card pk-bi-editor" data-feature="i.draft i.combined i.restitutie">
        <span className="eyebrow">{t('pk.facturen.editor.eyebrow')}</span>
        <h2 className="card-title">{t('pk.facturen.editor.none')}</h2>
        <Empty>{t('pk.facturen.editor.noneHelp')}</Empty>
      </section>
    );
  }

  const concept = invoice.status === 'concept';
  const sums = totals(invoice);
  const client = clientFor(invoice.short, invoice.locationId, today);
  const insurer = insurerById(client.insurer);
  const insurable = invoice.lines.some((l) => l.ref.type === 'treatment' && treatmentById(l.ref.id).insurable);
  const set = (change: (inv: Invoice) => Invoice) => billing.update(invoice.id, change);

  const payers: { value: Payer; label: string }[] = [
    { value: 'client', label: t('pk.facturen.payer.client') },
    ...(insurable ? [{ value: 'restitutie' as Payer, label: t('pk.facturen.payer.restitutie') }] : []),
    ...(insurable && insurer.contracted ? [{ value: 'insurer' as Payer, label: t('pk.facturen.payer.insurer') }] : []),
  ];

  const add = (value: string) => {
    if (!value) return;
    const [type, id] = value.split(':');
    const ref: LineRef = type === 'package' ? { type: 'package', zone: id } : { type: 'product', id: id as (typeof PRODUCTS)[number]['id'] };
    set((inv) => ({ ...inv, lines: [...inv.lines, lineFor(ref)] }));
    setAdding('');
  };

  const finalize = () => {
    const final = billing.finalize(invoice.id);
    if (!final) return;
    if (final.payer === 'insurer') demo(t('pk.facturen.editor.toClaims', { insurer: insurer.name }));
    else demo(t('pk.facturen.editor.finalized', { number: final.number ?? '' }));
  };

  // Features that only show in some states point at the editor itself otherwise, so a jump always lands here.
  const payLater = concept && invoice.payer !== 'insurer';
  const shown = [...(concept ? ['i.combined', 'i.restitutie'] : []), ...(payLater ? ['i.methods', 'i.split', 'i.giftpay'] : []), ...(invoice.status === 'open' ? ['i.methods', 'i.split', 'i.giftpay'] : [])];
  const elsewhere = ['i.combined', 'i.restitutie', 'i.methods', 'i.split', 'i.giftpay'].filter((f) => !shown.includes(f)).join(' ');

  return (
    <section className="card pk-card pk-bi-editor" aria-live="polite" data-feature={elsewhere || undefined}>
      <div className="card-head">
        <div>
          <span className="eyebrow">{t(KIND_KEY[invoice.kind])}</span>
          <h2 className="card-title">{invoice.number ? <span className="pk-mono pk-bi-number">{invoice.number}</span> : t('pk.facturen.status.concept')}</h2>
        </div>
        <InvoiceStatus invoice={invoice} />
      </div>

      <div className="pk-bi-editor-who">
        <strong>{invoice.client}</strong>
        <span className="pk-muted pk-small">
          {invoice.practitioner ? `${staffById(invoice.practitioner).name} · ` : ''}
          {insurer.name} · {isolate(client.policy)}
        </span>
        {invoice.episode ? (
          <Chip tone="brand" icon="layers">
            {t('pk.facturen.editor.episode', { condition: { msg: `pk.cond.${invoice.episode.condition}` }, zt: invoice.episode.zt })}
          </Chip>
        ) : null}
      </div>

      {concept ? (
        <div className="pk-bi-payer" data-feature="i.restitutie">
          <span className="pk-field-label">{t('pk.facturen.payer.label')}</span>
          {payers.length > 1 ? (
            <Seg value={invoice.payer} options={payers} onChange={(payer) => set((inv) => ({ ...inv, payer }))} label={t('pk.facturen.payer.label')} />
          ) : (
            <span>
              <Chip tone="outline">{t('pk.facturen.payer.client')}</Chip>
            </span>
          )}
          <small className="pk-muted">
            {payers.length > 1 ? t(`pk.facturen.payer.${invoice.payer}Help`, { insurer: insurer.name }) : t('pk.facturen.payer.notInsured')}
          </small>
        </div>
      ) : null}

      <ul className="pk-bi-lines">
        {invoice.lines.map((l) => (
          <li key={l.key} data-feature={l.unit === 0 && l.ref.type === 'treatment' ? 'i.free' : undefined}>
            <span className="pk-bi-line-name">
              {label(l.ref)}
              {l.unit === 0 && l.ref.type === 'treatment' ? <Chip tone="good">{t('pk.facturen.editor.free')}</Chip> : null}
              <small className="pk-muted">{t('pk.facturen.editor.vat', { n: l.vat })}</small>
            </span>
            {concept && l.ref.type !== 'treatment' ? (
              <span className="pk-bi-qty">
                <button type="button" aria-label={t('pk.facturen.editor.less')} onClick={() => set((inv) => ({ ...inv, lines: inv.lines.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x)) }))}>
                  <PkIcon name="minus" size={14} />
                </button>
                <span className="pk-num">{l.qty}</span>
                <button type="button" aria-label={t('pk.facturen.editor.more')} onClick={() => set((inv) => ({ ...inv, lines: inv.lines.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)) }))}>
                  <PkIcon name="plus" size={14} />
                </button>
              </span>
            ) : (
              <span className="pk-num pk-muted">{l.qty} ×</span>
            )}
            {concept ? (
              <input
                className="pk-input pk-num pk-bi-price"
                inputMode="decimal"
                aria-label={t('pk.common.price')}
                value={String(l.unit).replace('.', ',')}
                onChange={(e) => set((inv) => ({ ...inv, lines: inv.lines.map((x) => (x.key === l.key ? { ...x, unit: round2(parseAmount(e.target.value)) } : x)) }))}
              />
            ) : (
              <span className="pk-num">{money(l.unit)}</span>
            )}
            <strong className="pk-num pk-bi-line-total">{money(l.qty * l.unit)}</strong>
            {concept && invoice.lines.length > 1 ? (
              <button type="button" className="icon-button small" aria-label={t('pk.common.delete')} onClick={() => set((inv) => ({ ...inv, lines: inv.lines.filter((x) => x.key !== l.key) }))}>
                <PkIcon name="trash" size={16} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {concept ? (
        <div className="pk-bi-editor-tools">
          <label className="pk-field" data-feature="i.combined">
            <span className="pk-field-label">{t('pk.facturen.editor.addProduct')}</span>
            <select className="pk-input" value={adding} onChange={(e) => add(e.target.value)}>
              <option value="">{t('pk.facturen.editor.choose')}</option>
              <optgroup label={t('pk.facturen.kassa.products')}>
                {PRODUCTS.filter((p) => !p.soldOut).map((p) => (
                  <option key={p.id} value={`product:${p.id}`}>
                    {p.brand ? `${p.brand} ${text(p.name)}` : text(p.name)} · {money(p.price)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('pk.facturen.kassa.packages')}>
                {PACKAGE_ZONES.map((z) => (
                  <option key={z.id} value={`package:${z.id}`}>
                    {label({ type: 'package', zone: z.id })}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="pk-field">
            <span className="pk-field-label">{t('pk.facturen.editor.discount')}</span>
            <div className="pk-row pk-bi-discount">
              <Seg
                value={invoice.discount.mode}
                options={[
                  { value: 'pct', label: '%' },
                  { value: 'eur', label: '€' },
                ]}
                onChange={(mode) => set((inv) => ({ ...inv, discount: { ...inv.discount, mode } }))}
                label={t('pk.facturen.editor.discount')}
              />
              <input
                className="pk-input pk-num"
                inputMode="decimal"
                aria-label={t('pk.facturen.editor.discount')}
                value={invoice.discount.value ? String(invoice.discount.value).replace('.', ',') : ''}
                placeholder="0"
                onChange={(e) => set((inv) => ({ ...inv, discount: { ...inv.discount, value: Math.max(0, parseAmount(e.target.value)) } }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      <dl className="pk-bi-sums">
        {sums.discount ? (
          <>
            <dt>{t('pk.facturen.doc.subtotal')}</dt>
            <dd>{money(sums.gross)}</dd>
            <dt>{t('pk.facturen.doc.discount')}</dt>
            <dd>− {money(sums.discount)}</dd>
          </>
        ) : null}
        <dt>{t('pk.facturen.doc.vat21')}</dt>
        <dd>{money(sums.vat21)}</dd>
        <dt className="pk-bi-total">{t('pk.common.total')}</dt>
        <dd className="pk-bi-total">{money(sums.total)}</dd>
        {sums.paid && invoice.kind !== 'credit' ? (
          <>
            <dt>{t('pk.facturen.editor.paid')}</dt>
            <dd>{money(sums.paid)}</dd>
          </>
        ) : null}
        {sums.open ? (
          <>
            <dt>{t('pk.facturen.editor.open')}</dt>
            <dd>{money(sums.open)}</dd>
          </>
        ) : null}
      </dl>

      <div className="pk-bi-editor-actions" data-feature="i.draft">
        {concept ? (
          <>
            <button type="button" className="btn btn-primary" onClick={finalize}>
              <PkIcon name="check" size={16} />
              {t('pk.facturen.editor.finalize')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onPreview(invoice)}>
              <PkIcon name="eye" size={16} />
              {t('pk.facturen.editor.preview')}
            </button>
            <span className="pk-small pk-muted">{t('pk.facturen.editor.conceptHelp')}</span>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => demo(t('pk.facturen.editor.mailed', { email: client.email }))}>
              <PkIcon name="mail" size={16} />
              {t('pk.common.mail')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onPreview(invoice)}>
              <PkIcon name="printer" size={16} />
              {t('pk.common.print')}
            </button>
            {invoice.kind !== 'credit' && invoice.status !== 'credited' && invoice.payer !== 'insurer' ? (
              <button type="button" className="btn btn-ghost" onClick={() => onCredit(invoice)}>
                <PkIcon name="undo" size={16} />
                {t('pk.facturen.credit.action')}
              </button>
            ) : null}
            {invoice.payer === 'insurer' ? (
              <button type="button" className="btn btn-ghost" onClick={() => go('declaraties')}>
                <PkIcon name="shieldCheck" size={16} />
                {t('pk.facturen.editor.toClaimsBtn')}
              </button>
            ) : null}
          </>
        )}
      </div>

      {payLater ? (
        <div className="pk-bi-paylater">
          <PaymentPanel amount={sums.total} disabled onPay={() => undefined} />
          <small className="pk-muted">{t('pk.facturen.pay.afterFinal')}</small>
        </div>
      ) : null}

      {invoice.status === 'open' && sums.open > 0 ? (
        <PaymentPanel
          amount={sums.open}
          onPay={(payments, onAccount) => {
            billing.pay(invoice.id, payments, onAccount);
            demo(onAccount && !payments.length ? t('pk.facturen.pay.accountDone') : t('pk.facturen.pay.done'));
          }}
        />
      ) : null}
    </section>
  );
}
