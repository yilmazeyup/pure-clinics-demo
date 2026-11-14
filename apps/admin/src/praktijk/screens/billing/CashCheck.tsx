import { addDays, dateKey, LOCATIONS, startOfDay, type LocationId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { dmy } from '../../data/core';
import { cashMoves, round2, type CashBooking, type CashCheck, type CashMove } from '../../data/billing';
import { PkIcon } from '../../icons';
import { Card, Chip, Empty, Field, Seg, Stat, TableWrap, useMoney } from '../../kit';
import { parseAmount } from './PaymentPanel';
import type { Billing } from './state';

/**
 * The cash drawer per location: a check that looks forward from its start date (count, tick off every cash movement,
 * count again, finalise), the drawer's own income and expenses, and deposits to the bank.
 */
export function CashTab({ billing }: { billing: Billing }) {
  const { t } = useI18n();
  const [location, setLocation] = useState<LocationId>('nijmegen');
  return (
    <div className="pk-stack">
      <div className="pk-row pk-row--between">
        <Seg value={location} onChange={setLocation} label={t('pk.common.location')} options={LOCATIONS.map((l) => ({ value: l.id, label: l.city }))} />
        <span className="pk-small pk-muted">{t('pk.facturen.cash.perLocation')}</span>
      </div>
      <div className="pk-grid">
        <Check billing={billing} location={location} />
        <Bookings billing={billing} location={location} />
      </div>
    </div>
  );
}

function useMoveLabel() {
  const { t } = useI18n();
  return (m: CashMove) => {
    if (m.invoice) return t('pk.facturen.cash.moveInvoice', { number: m.invoice.number ?? '—', client: m.invoice.client });
    const b = m.booking!;
    return b.text ?? t(`pk.facturen.cash.cat.${b.category ?? 'supplies'}`);
  };
}

function Check({ billing, location }: { billing: Billing; location: LocationId }) {
  const { t } = useI18n();
  const { today, now, demo } = usePraktijk();
  const money = useMoney();
  const moveLabel = useMoveLabel();
  const active = billing.checks.find((c) => c.locationId === location && c.status === 'active');
  const history = billing.checks.filter((c) => c.locationId === location && c.status === 'final');
  const [start, setStart] = useState(dateKey(addDays(today, -1)));
  const [description, setDescription] = useState('');
  const [balance, setBalance] = useState('');
  const [recount, setRecount] = useState('');

  const create = () => {
    const check: CashCheck = {
      id: `kc-${location}-${Date.now()}`,
      locationId: location,
      start: startOfDay(new Date(`${start}T00:00`)),
      description: description.trim() || null,
      startBalance: round2(parseAmount(balance)),
      included: [],
      recount: null,
      status: 'active',
      finalisedAt: null,
      difference: null,
    };
    billing.setChecks((list) => [check, ...list]);
    setDescription('');
    setBalance('');
    demo(t('pk.facturen.cash.created'));
  };

  const patch = (change: Partial<CashCheck>) => active && billing.setChecks((list) => list.map((c) => (c.id === active.id ? { ...c, ...change } : c)));

  if (!active) {
    return (
      <Card className="span-7" eyebrow={t('pk.facturen.cash.eyebrow')} title={t('pk.facturen.cash.title')} help={t('pk.facturen.cash.help')} feature="o.cash">
        <h3 className="pk-subtitle">{t('pk.facturen.cash.new')}</h3>
        <div className="pk-form">
          <Field label={t('pk.facturen.cash.start')} hint={t('pk.facturen.cash.startHint')}>
            <input className="pk-input" type="date" value={start} max={dateKey(today)} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t('pk.facturen.cash.description')}>
            <input className="pk-input" value={description} placeholder={t('pk.facturen.cash.descriptionDefault')} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t('pk.facturen.cash.counted')} hint={t('pk.facturen.cash.countedHint')}>
            <input className="pk-input pk-num" inputMode="decimal" value={balance} placeholder="0,00" onChange={(e) => setBalance(e.target.value)} />
          </Field>
        </div>
        <div className="pk-bi-actions">
          <button type="button" className="btn btn-primary" disabled={!balance} onClick={create}>
            <PkIcon name="plus" size={16} />
            {t('pk.facturen.cash.create')}
          </button>
        </div>
        <History checks={history} />
      </Card>
    );
  }

  const moves = cashMoves(billing.invoices, billing.bookings, location, active.start).filter((m) => m.date <= now);
  const inCheck = moves.filter((m) => active.included.includes(m.id));
  const todo = moves.filter((m) => !active.included.includes(m.id));
  const system = round2(active.startBalance + inCheck.reduce((s, m) => s + m.amount, 0));
  const counted = recount ? round2(parseAmount(recount)) : null;
  const diff = counted === null ? null : round2(counted - system);

  const finalise = () => {
    patch({ status: 'final', recount: counted, finalisedAt: now, difference: diff });
    setRecount('');
    demo(diff === 0 ? t('pk.facturen.cash.finalOk') : t('pk.facturen.cash.finalDiff', { amount: money(diff ?? 0) }));
  };

  const row = (m: CashMove, into: boolean) => (
    <li key={m.id}>
      <span className="pk-bi-who">
        <strong>{moveLabel(m)}</strong>
        <small className="pk-muted">{dmy(m.date)}</small>
      </span>
      <strong className={`pk-num ${m.amount < 0 ? 'pk-bi-neg' : ''}`}>{money(m.amount)}</strong>
      <button
        type="button"
        className="icon-button small pk-bi-move"
        aria-label={into ? t('pk.facturen.cash.tick') : t('pk.facturen.cash.untick')}
        title={into ? t('pk.facturen.cash.tick') : t('pk.facturen.cash.untick')}
        onClick={() => patch({ included: into ? [...active.included, m.id] : active.included.filter((x) => x !== m.id) })}
      >
        <span className={into ? 'pk-flip' : 'pk-bi-back'}>
          <PkIcon name="arrow" size={17} />
        </span>
      </button>
    </li>
  );

  return (
    <Card
      className="span-7"
      eyebrow={t('pk.facturen.cash.eyebrow')}
      title={t('pk.facturen.cash.titleActive', { date: dmy(active.start) })}
      help={t('pk.facturen.cash.helpActive')}
      feature="o.cash"
      actions={<Chip tone="brand">{active.description ?? t('pk.facturen.cash.descriptionDefault')}</Chip>}
    >
      <div className="pk-bi-checkcols">
        <div>
          <h3 className="pk-field-label">{t('pk.facturen.cash.todo', { n: todo.length })}</h3>
          {todo.length ? <ul className="pk-list pk-bi-moves">{todo.map((m) => row(m, true))}</ul> : <Empty>{t('pk.facturen.cash.allTicked')}</Empty>}
        </div>
        <div>
          <h3 className="pk-field-label">{t('pk.facturen.cash.inCheck', { n: inCheck.length })}</h3>
          {inCheck.length ? <ul className="pk-list pk-bi-moves">{inCheck.map((m) => row(m, false))}</ul> : <Empty>{t('pk.facturen.cash.noneTicked')}</Empty>}
        </div>
      </div>

      <div className="pk-bi-checksum">
        <div className="pk-stats">
          <Stat label={t('pk.facturen.cash.startBalance')} value={money(active.startBalance)} />
          <Stat label={t('pk.facturen.cash.mutations')} value={money(system - active.startBalance)} sub={t('pk.facturen.cash.mutationsSub', { n: inCheck.length })} />
          <Stat label={t('pk.facturen.cash.system')} value={money(system)} />
        </div>
        <div className="pk-row pk-bi-recount">
          <Field label={t('pk.facturen.cash.recount')}>
            <input className="pk-input pk-num" inputMode="decimal" value={recount} placeholder="0,00" onChange={(e) => setRecount(e.target.value)} />
          </Field>
          {diff === null ? null : diff === 0 ? (
            <Chip tone="good" icon="check">
              {t('pk.facturen.cash.match')}
            </Chip>
          ) : (
            <Chip tone="bad" icon="warning">
              {t('pk.facturen.cash.diff', { amount: money(diff) })}
            </Chip>
          )}
          <button type="button" className="btn btn-primary" disabled={counted === null} onClick={finalise}>
            <PkIcon name="lock" size={16} />
            {t('pk.facturen.cash.finalise')}
          </button>
        </div>
        {todo.length && counted !== null ? <p className="pk-small pk-muted">{t('pk.facturen.cash.todoWarn', { n: todo.length })}</p> : null}
      </div>
      <History checks={history} />
    </Card>
  );
}

function History({ checks }: { checks: CashCheck[] }) {
  const { t } = useI18n();
  const money = useMoney();
  if (!checks.length) return null;
  return (
    <>
      <h3 className="pk-subtitle pk-bi-gap">{t('pk.facturen.cash.history')}</h3>
      <TableWrap label={t('pk.facturen.cash.history')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.facturen.cash.period')}</th>
              <th className="end">{t('pk.facturen.cash.startBalance')}</th>
              <th className="end">{t('pk.facturen.cash.recount')}</th>
              <th>{t('pk.common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td className="nowrap">
                  {dmy(c.start)} – {c.finalisedAt ? dmy(c.finalisedAt) : ''}
                </td>
                <td className="end">{money(c.startBalance)}</td>
                <td className="end">{c.recount === null ? '—' : money(c.recount)}</td>
                <td>
                  {c.difference ? <Chip tone="warn">{t('pk.facturen.cash.diff', { amount: money(c.difference) })}</Chip> : <Chip tone="good">{t('pk.facturen.cash.match')}</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}

function Bookings({ billing, location }: { billing: Billing; location: LocationId }) {
  const { t } = useI18n();
  const { now, demo } = usePraktijk();
  const money = useMoney();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'bank'>('cash');
  const [deposit, setDeposit] = useState('');
  const list = billing.bookings.filter((b) => b.locationId === location);
  const deposits = list.filter((b) => b.kind === 'deposit');
  const ledger = list.filter((b) => b.kind !== 'deposit');

  const add = (booking: Omit<CashBooking, 'id' | 'locationId' | 'date'>) =>
    billing.setBookings((all) => [{ ...booking, id: `cb-${Date.now()}`, locationId: location, date: now }, ...all]);

  const label = (b: CashBooking) => b.text ?? t(`pk.facturen.cash.cat.${b.category ?? 'supplies'}`);

  return (
    <div className="span-5 pk-stack">
      <Card eyebrow={t('pk.facturen.ledger.eyebrow')} title={t('pk.facturen.ledger.title')} help={t('pk.facturen.ledger.help')} feature="o.income">
        <div className="pk-form">
          <Field label={t('pk.facturen.ledger.kind')}>
            <Seg
              value={kind}
              onChange={setKind}
              label={t('pk.facturen.ledger.kind')}
              options={[
                { value: 'expense', label: t('pk.facturen.ledger.expense') },
                { value: 'income', label: t('pk.facturen.ledger.income') },
              ]}
            />
          </Field>
          <Field label={t('pk.facturen.ledger.via')}>
            <Seg
              value={method}
              onChange={setMethod}
              label={t('pk.facturen.ledger.via')}
              options={[
                { value: 'cash', label: t('pk.facturen.ledger.cash') },
                { value: 'bank', label: t('pk.facturen.ledger.bank') },
              ]}
            />
          </Field>
          <Field label={t('pk.facturen.cash.description')} wide>
            <input className="pk-input" value={text} placeholder={t('pk.facturen.ledger.placeholder')} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label={t('pk.common.amount')}>
            <input className="pk-input pk-num" inputMode="decimal" value={amount} placeholder="0,00" onChange={(e) => setAmount(e.target.value)} />
          </Field>
        </div>
        <div className="pk-bi-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={!text.trim() || !parseAmount(amount)}
            onClick={() => {
              add({ kind, category: null, text: text.trim(), method, amount: round2(Math.abs(parseAmount(amount))) });
              setText('');
              setAmount('');
              demo(t('pk.common.demoSaved'));
            }}
          >
            <PkIcon name="plus" size={15} />
            {t('pk.facturen.ledger.add')}
          </button>
        </div>
        <ul className="pk-list pk-small">
          {ledger.slice(0, 7).map((b) => (
            <li key={b.id}>
              <span className="pk-bi-who">
                <strong>{label(b)}</strong>
                <small className="pk-muted">
                  {dmy(b.date)} · {t(b.method === 'cash' ? 'pk.facturen.ledger.cash' : 'pk.facturen.ledger.bank')}
                </small>
              </span>
              <strong className={`pk-num ${b.kind === 'expense' ? 'pk-bi-neg' : ''}`}>{money(b.kind === 'expense' ? -b.amount : b.amount)}</strong>
            </li>
          ))}
        </ul>
      </Card>

      <Card eyebrow={t('pk.facturen.deposit.eyebrow')} title={t('pk.facturen.deposit.title')} help={t('pk.facturen.deposit.help')} feature="o.deposits">
        <div className="pk-row">
          <input className="pk-input pk-num pk-bi-depositinput" inputMode="decimal" aria-label={t('pk.common.amount')} value={deposit} placeholder="0,00" onChange={(e) => setDeposit(e.target.value)} />
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={!parseAmount(deposit)}
            onClick={() => {
              add({ kind: 'deposit', category: 'deposit', text: null, method: 'cash', amount: round2(Math.abs(parseAmount(deposit))) });
              setDeposit('');
              demo(t('pk.facturen.deposit.done'));
            }}
          >
            <PkIcon name="building" size={15} />
            {t('pk.facturen.deposit.add')}
          </button>
        </div>
        <ul className="pk-list pk-small">
          {deposits.map((b) => (
            <li key={b.id}>
              <span className="pk-bi-who">
                <strong>{t('pk.facturen.cash.cat.deposit')}</strong>
                <small className="pk-muted">{dmy(b.date)}</small>
              </span>
              <strong className="pk-num pk-bi-neg">{money(-b.amount)}</strong>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
