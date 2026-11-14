import { LOCATIONS, treatmentById, type LocationId, type TreatmentId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { clientFor, dmy, practiceClients } from '../../data/core';
import { groupCode, lineFor, newGiftCode, nextNumber, type Invoice } from '../../data/billing';
import type { GiftCard } from '../../data/shared';
import { PkIcon } from '../../icons';
import { Bar, Card, Chip, Empty, Field, Kv, Seg, TableWrap, useMoney } from '../../kit';
import { parseAmount } from './PaymentPanel';
import type { Billing } from './state';

const AMOUNTS = [25, 50, 75, 100, 150];
const STRIP_TREATMENTS: TreatmentId[] = ['acne', 'epilation', 'deepclean', 'massage', 'facial'];

/** Gift cards with their eight-digit code and balance, and strip cards: eight treatments for the price of seven. */
export function GiftTab({ billing }: { billing: Billing }) {
  return (
    <div className="pk-grid">
      <GiftCards billing={billing} />
      <StripCards billing={billing} />
    </div>
  );
}

function cardState(c: GiftCard): 'pending' | 'valid' | 'used' {
  if (!c.final) return 'pending';
  return c.balance > 0.004 ? 'valid' : 'used';
}

function GiftCards({ billing }: { billing: Billing }) {
  const { t } = useI18n();
  const { today, now, demo } = usePraktijk();
  const money = useMoney();
  const clients = useMemo(() => practiceClients(today).slice(0, 80), [today]);
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState('');
  const [buyer, setBuyer] = useState(clients[0]?.short ?? '');
  const [location, setLocation] = useState<LocationId>('nijmegen');
  const [lookup, setLookup] = useState('');
  const [found, setFound] = useState<string | null>(null);
  const value = custom ? Math.max(5, Math.round(parseAmount(custom))) : amount;
  const { giftcards } = billing;
  const shown = found ? giftcards.find((c) => c.code === found) : null;

  /** A new card and its concept invoice; the card becomes valid once that invoice is final and paid. */
  const sell = () => {
    const code = newGiftCode(giftcards);
    const client = clientFor(buyer, location, today);
    const invoice: Invoice = billing.newInvoice('invoice', location, buyer, [{ ...lineFor({ type: 'giftcard', code }), unit: value }]);
    billing.setInvoices((list) => [...list, invoice]);
    billing.setGiftcards((cards) => [
      { code, amount: value, balance: value, issued: now, invoice: '', final: false, buyer: `${client.first} ${client.last}`, locationId: location },
      ...cards,
    ]);
    setFound(code);
    setLookup(groupCode(code));
    demo(t('pk.facturen.gift.sold', { code: groupCode(code) }));
  };

  const makeFinal = (code: string) => {
    const invoice = billing.invoices.find((i) => i.status === 'concept' && i.lines.some((l) => l.ref.type === 'giftcard' && l.ref.code === code));
    if (!invoice) return;
    const card = giftcards.find((c) => c.code === code);
    const final = billing.finalize(invoice.id);
    if (final && card) billing.pay(final.id, [{ method: 'pin', amount: card.amount, at: now }], false, final.number ?? '');
    demo(t('pk.facturen.gift.valid', { code: groupCode(code) }));
  };

  return (
    <Card className="span-7" eyebrow={t('pk.facturen.gift.eyebrow')} title={t('pk.facturen.gift.title')} help={t('pk.facturen.gift.help')} feature="l.gift">
      <div className="pk-bi-giftgrid">
        <div className="pk-stack">
          <h3 className="pk-subtitle">{t('pk.facturen.gift.sell')}</h3>
          <div className="pk-row">
            {AMOUNTS.map((a) => (
              <button key={a} type="button" className={`pk-bi-amount ${!custom && amount === a ? 'on' : ''}`} onClick={() => (setAmount(a), setCustom(''))}>
                {money(a)}
              </button>
            ))}
          </div>
          <div className="pk-form">
            <Field label={t('pk.facturen.gift.other')}>
              <input className="pk-input pk-num" inputMode="decimal" value={custom} placeholder="0" onChange={(e) => setCustom(e.target.value)} />
            </Field>
            <Field label={t('pk.facturen.gift.buyer')}>
              <select className="pk-input" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.short}>
                    {c.first} {c.last}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('pk.common.location')}>
              <select className="pk-input" value={location} onChange={(e) => setLocation(e.target.value as LocationId)}>
                {LOCATIONS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.city}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" className="btn btn-primary" onClick={sell}>
            <PkIcon name="gift" size={16} />
            {t('pk.facturen.gift.sellBtn', { amount: money(value) })}
          </button>
        </div>

        <div className="pk-stack">
          <h3 className="pk-subtitle">{t('pk.facturen.gift.lookup')}</h3>
          <div className="pk-row">
            <input
              className="pk-input pk-mono pk-bi-codeinput"
              inputMode="numeric"
              placeholder="0000 0000"
              aria-label={t('pk.facturen.gift.code')}
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setFound(lookup.replace(/\D/g, ''))}
            />
            <button type="button" className="btn btn-ghost" onClick={() => setFound(lookup.replace(/\D/g, ''))}>
              <PkIcon name="search" size={16} />
              {t('pk.facturen.gift.check')}
            </button>
          </div>
          {shown ? (
            <div className="pk-bi-giftcard">
              <div className="pk-bi-giftcard-face">
                <span className="pk-bi-doc-mark">
                  <b>PURE</b>CLINICS
                </span>
                <span className="pk-mono">{groupCode(shown.code)}</span>
                <strong>{money(shown.balance)}</strong>
                <small>{t('pk.facturen.gift.of', { amount: money(shown.amount) })}</small>
              </div>
              <Kv
                rows={[
                  [t('pk.common.status'), <GiftState key="s" card={shown} />],
                  [t('pk.facturen.gift.buyer'), shown.buyer],
                  [t('pk.facturen.gift.issued'), dmy(shown.issued)],
                  [t('pk.facturen.doc.number'), shown.invoice ? <span className="pk-mono">{shown.invoice}</span> : '—'],
                ]}
              />
              {!shown.final ? (
                <button type="button" className="btn btn-primary btn-small" onClick={() => makeFinal(shown.code)}>
                  <PkIcon name="check" size={15} />
                  {t('pk.facturen.gift.makeFinal')}
                </button>
              ) : null}
              <h4 className="pk-field-label">{t('pk.facturen.gift.history')}</h4>
              {(billing.giftUses[shown.code] ?? []).length ? (
                <ul className="pk-list pk-small">
                  {billing.giftUses[shown.code].map((u, i) => (
                    <li key={i}>
                      <span>{dmy(u.date)}</span>
                      <span className="pk-mono pk-muted">{u.invoice}</span>
                      <strong className="pk-num pk-bi-push">− {money(u.amount)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pk-small pk-muted">{t('pk.facturen.gift.unused')}</p>
              )}
            </div>
          ) : found ? (
            <Chip tone="bad">{t('pk.facturen.gift.unknown')}</Chip>
          ) : (
            <Empty>{t('pk.facturen.gift.lookupHelp')}</Empty>
          )}
        </div>
      </div>

      <TableWrap label={t('pk.facturen.gift.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.facturen.gift.codeCol')}</th>
              <th>{t('pk.facturen.gift.buyer')}</th>
              <th>{t('pk.facturen.gift.balanceCol')}</th>
              <th>{t('pk.common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {giftcards.map((c) => (
              <tr key={c.code} className="pk-bi-row" aria-selected={c.code === found} onClick={() => (setFound(c.code), setLookup(groupCode(c.code)))}>
                <td className="pk-mono nowrap">{groupCode(c.code)}</td>
                <td className="nowrap">
                  {c.buyer}
                  <small className="pk-bi-mixed">{t('pk.facturen.gift.issuedOn', { date: dmy(c.issued) })}</small>
                </td>
                <td>
                  <span className="pk-bi-balance">
                    <Bar value={c.balance} max={c.amount} tone="brand" />
                    <span className="pk-num nowrap">
                      {money(c.balance)} <small className="pk-muted">/ {money(c.amount)}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <GiftState card={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function GiftState({ card }: { card: GiftCard }) {
  const { t } = useI18n();
  const state = cardState(card);
  return (
    <Chip tone={state === 'valid' ? 'good' : state === 'pending' ? 'warn' : 'neutral'}>
      {t(state === 'valid' ? 'pk.facturen.gift.stateValid' : state === 'pending' ? 'pk.facturen.gift.statePending' : 'pk.facturen.gift.stateUsed')}
    </Chip>
  );
}

function StripCards({ billing }: { billing: Billing }) {
  const { t, text } = useI18n();
  const { today, now, demo } = usePraktijk();
  const money = useMoney();
  const clients = useMemo(() => practiceClients(today).slice(0, 80), [today]);
  const [client, setClient] = useState(clients[3]?.short ?? '');
  const [treatment, setTreatment] = useState<TreatmentId>('acne');
  const [size, setSize] = useState<'8' | '10'>('8');
  const strips = Number(size);
  const price = treatmentById(treatment).priceFrom;

  const sell = () => {
    const file = clientFor(client, 'nijmegen', today);
    const number = nextNumber(billing.invoices, today.getFullYear());
    const invoice: Invoice = {
      ...billing.newInvoice('invoice', file.locationId, client, [lineFor({ type: 'strip', id: treatment, strips })]),
      number,
      status: 'paid',
      payments: [{ method: 'pin', amount: price * (strips - 1), at: now }],
    };
    billing.setInvoices((list) => [...list, invoice]);
    billing.setStrips((list) => [
      { id: `strip-${Date.now()}`, clientId: file.id, short: client, client: `${file.first} ${file.last}`, treatment, strips, used: 0, bought: now, locationId: file.locationId },
      ...list,
    ]);
    demo(t('pk.facturen.strip.sold', { client: `${file.first} ${file.last}`, number }));
  };

  return (
    <Card className="span-5" eyebrow={t('pk.facturen.strip.eyebrow')} title={t('pk.facturen.strip.title')} help={t('pk.facturen.strip.help')} feature="l.strip">
      <div className="pk-form">
        <Field label={t('pk.common.client')}>
          <select className="pk-input" value={client} onChange={(e) => setClient(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.short}>
                {c.first} {c.last}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.common.treatment')}>
          <select className="pk-input" value={treatment} onChange={(e) => setTreatment(e.target.value as TreatmentId)}>
            {STRIP_TREATMENTS.map((id) => (
              <option key={id} value={id}>
                {text(treatmentById(id).name)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="pk-row pk-bi-stripsell">
        <Seg
          value={size}
          onChange={setSize}
          label={t('pk.facturen.strip.size')}
          options={[
            { value: '8', label: t('pk.facturen.strip.deal', { n: 8, paid: 7 }) },
            { value: '10', label: t('pk.facturen.strip.deal', { n: 10, paid: 9 }) },
          ]}
        />
        <span className="pk-small pk-muted">{t('pk.facturen.strip.price', { amount: money(price * (strips - 1)), saved: money(price) })}</span>
      </div>
      <button type="button" className="btn btn-primary" onClick={sell}>
        <PkIcon name="ticket" size={16} />
        {t('pk.facturen.strip.sell')}
      </button>

      <ul className="pk-list pk-bi-strips">
        {billing.strips.map((s) => {
          const full = s.used >= s.strips;
          return (
            <li key={s.id}>
              <span className="pk-bi-who">
                <strong>{s.client}</strong>
                <small className="pk-muted">
                  {text(treatmentById(s.treatment).name)} · {t('pk.facturen.strip.left', { n: s.strips - s.used, total: s.strips })}
                </small>
                <span className="pk-bi-holes" aria-hidden="true">
                  {Array.from({ length: s.strips }, (_, i) => (
                    <i key={i} className={i < s.used ? 'used' : ''} />
                  ))}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={full}
                onClick={() => {
                  billing.setStrips((list) => list.map((x) => (x.id === s.id ? { ...x, used: x.used + 1 } : x)));
                  demo(t('pk.facturen.strip.usedToast', { client: s.client, n: s.strips - s.used - 1 }));
                }}
              >
                {full ? t('pk.facturen.strip.full') : t('pk.facturen.strip.use')}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
