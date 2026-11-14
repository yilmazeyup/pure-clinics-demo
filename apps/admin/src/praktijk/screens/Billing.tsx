import { sameDay } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk, type ApptRef } from '../context';
import { agendaDay, clientFor, dmy, insurerById } from '../data/core';
import { totals, type Invoice } from '../data/billing';
import { PkIcon } from '../icons';
import { Card, Check, Chip, Empty, Modal, Seg, Stat, TableWrap, isolate, useMoney } from '../kit';
import { CashTab } from './billing/CashCheck';
import { Editor } from './billing/Editor';
import { InvoiceStatus, KIND_KEY, METHOD_KEY, useLineLabel } from './billing/format';
import { GiftTab } from './billing/GiftStrip';
import { InvoiceDoc } from './billing/InvoiceDoc';
import { KassaTab } from './billing/Kassa';
import { LayoutTab } from './billing/Layout';
import { daysBetween, useBilling } from './billing/state';
import './Billing.css';

type Tab = 'invoices' | 'kassa' | 'gift' | 'cash' | 'layout';
type Filter = 'all' | 'concept' | 'open' | 'paid' | 'insurer' | 'credit';

/** Which tab shows a feature, for the jump links of the feature overview. */
const FEATURE_TAB: Record<string, Tab> = {
  'i.agenda': 'invoices',
  'i.draft': 'invoices',
  'i.restitutie': 'invoices',
  'i.methods': 'invoices',
  'i.split': 'invoices',
  'i.combined': 'invoices',
  'i.free': 'invoices',
  'i.giftpay': 'invoices',
  'i.open': 'invoices',
  'j.credit': 'invoices',
  'j.restnota': 'invoices',
  'i.products': 'kassa',
  'm.barcode': 'kassa',
  'm.closing': 'kassa',
  'l.packages': 'kassa',
  'l.gift': 'gift',
  'l.strip': 'gift',
  'o.cash': 'cash',
  'o.income': 'cash',
  'o.deposits': 'cash',
  'i.layout': 'layout',
};

const PAGE = 12;

/** Facturen & kassa: invoicing from the agenda, the till, gift and strip cards, the cash check and the invoice layout. */
export function BillingScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const billing = useBilling();
  const [tab, setTab] = useState<Tab>('invoices');
  const [selected, setSelected] = useState<string | null>(() => billing.invoices.find((i) => i.status === 'concept')?.id ?? null);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [crediting, setCrediting] = useState<Invoice | null>(null);

  // A jump from the agenda brings an appointment to invoice; one from the feature overview opens the right tab.
  useEffect(() => {
    if (!target) return;
    if (target.appt) {
      setTab('invoices');
      setSelected(billing.invoiceAppt(target.appt));
    } else if (target.feature && FEATURE_TAB[target.feature]) setTab(FEATURE_TAB[target.feature]);
  }, [target?.at]);

  return (
    <>
      <Seg
        variant="tabs"
        value={tab}
        onChange={setTab}
        label={t('pk.screen.facturen')}
        options={[
          { value: 'invoices', label: t('pk.facturen.tab.invoices'), icon: 'file' },
          { value: 'kassa', label: t('pk.facturen.tab.kassa'), icon: 'barcode' },
          { value: 'gift', label: t('pk.facturen.tab.gift'), icon: 'gift' },
          { value: 'cash', label: t('pk.facturen.tab.cash'), icon: 'cash' },
          { value: 'layout', label: t('pk.facturen.tab.layout'), icon: 'edit' },
        ]}
      />
      {tab === 'invoices' ? (
        <InvoicesTab billing={billing} selected={selected} onSelect={setSelected} onPreview={setPreview} onCredit={setCrediting} />
      ) : tab === 'kassa' ? (
        <KassaTab billing={billing} onPreview={setPreview} />
      ) : tab === 'gift' ? (
        <GiftTab billing={billing} />
      ) : tab === 'cash' ? (
        <CashTab billing={billing} />
      ) : (
        <LayoutTab billing={billing} />
      )}

      <PreviewModal invoice={preview ? (billing.invoices.find((i) => i.id === preview.id) ?? preview) : null} billing={billing} onClose={() => setPreview(null)} />
      <CreditModal
        invoice={crediting}
        onClose={() => setCrediting(null)}
        onCredit={(keys) => {
          if (!crediting) return;
          const made = billing.credit(crediting.id, keys);
          setCrediting(null);
          if (made) setSelected(made.id);
        }}
      />
    </>
  );
}

type TabProps = {
  billing: ReturnType<typeof useBilling>;
  selected: string | null;
  onSelect: (id: string) => void;
  onPreview: (inv: Invoice) => void;
  onCredit: (inv: Invoice) => void;
};

function InvoicesTab({ billing, selected, onSelect, onPreview, onCredit }: TabProps) {
  const i18n = useI18n();
  const { t, text, clock } = i18n;
  const { today, now, demo } = usePraktijk();
  const money = useMoney();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openShown, setOpenShown] = useState(6);
  const editor = useRef<HTMLDivElement>(null);
  const { invoices, claims, layout } = billing;

  const invoiced = useMemo(() => new Set(invoices.flatMap((i) => i.lines.flatMap((l) => (l.appt ? [l.appt] : [])))), [invoices]);
  const waiting = useMemo(
    () => agendaDay(today).filter((a) => a.end.getTime() <= now.getTime() && !invoiced.has(a.id)),
    [today, now, invoiced],
  );

  const select = (id: string) => {
    onSelect(id);
    if (window.innerWidth < 1100) window.setTimeout(() => editor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const invoiceAppt = (ref: ApptRef) => select(billing.invoiceAppt(ref));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices
      .filter((i) => {
        if (filter === 'concept' && i.status !== 'concept') return false;
        if (filter === 'open' && i.status !== 'open') return false;
        if (filter === 'paid' && !(i.status === 'paid' && i.kind !== 'credit')) return false;
        if (filter === 'insurer' && i.payer !== 'insurer' && i.kind !== 'restitutie') return false;
        if (filter === 'credit' && i.kind !== 'credit') return false;
        return !q || i.client.toLowerCase().includes(q) || (i.number ?? '').includes(q);
      })
      .sort((a, b) => (a.status === 'concept' ? -1 : 0) - (b.status === 'concept' ? -1 : 0) || b.date.getTime() - a.date.getTime());
  }, [invoices, filter, query]);

  const open = invoices.filter((i) => i.status === 'open' && i.kind !== 'credit');
  const paidToday = invoices.flatMap((i) => i.payments).filter((p) => sameDay(p.at, now)).reduce((s, p) => s + p.amount, 0);
  const rests = claims.filter((c) => c.status === 'partial' && c.side === 'debit');
  const credits = invoices.filter((i) => i.kind === 'credit').sort((a, b) => b.date.getTime() - a.date.getTime());
  const current = invoices.find((i) => i.id === selected) ?? null;

  return (
    <div className="pk-grid">
      <div className="span-7 pk-stack">
        <div className="pk-stats pk-bi-stats">
          <Stat label={t('pk.facturen.stat.today')} value={money(paidToday)} sub={t('pk.facturen.stat.todaySub')} />
          <Stat label={t('pk.facturen.stat.waiting')} value={waiting.length} sub={t('pk.facturen.stat.waitingSub')} />
          <Stat label={t('pk.facturen.stat.open')} value={money(open.reduce((s, i) => s + totals(i).open, 0))} sub={t('pk.facturen.stat.openSub', { n: open.length })} />
          <Stat label={t('pk.facturen.stat.concepts')} value={invoices.filter((i) => i.status === 'concept').length} sub={t('pk.facturen.stat.conceptsSub')} />
        </div>

        <Card
          eyebrow={t('pk.facturen.agenda.eyebrow')}
          title={t('pk.facturen.agenda.title')}
          help={t('pk.facturen.agenda.help')}
          feature="i.agenda i.free"
        >
          {waiting.length ? (
            <ul className="pk-list pk-bi-waiting">
              {waiting.map((a) => (
                <li key={a.id}>
                  <span className="pk-bi-time pk-num pk-bi-ltr">
                    {clock(a.start)}–{clock(a.end)}
                  </span>
                  <span className="pk-bi-who">
                    <strong>{isolate(a.client)}</strong>
                    <small className="pk-muted">
                      {text(a.treatment.name)} · {a.specialist.name}
                    </small>
                  </span>
                  {a.price === 0 ? <Chip tone="good">{t('pk.facturen.agenda.free')}</Chip> : <span className="pk-num">{money(a.price)}</span>}
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() =>
                      invoiceAppt({
                        id: a.id,
                        client: a.client,
                        clientId: clientFor(a.client, a.clinic, today).id,
                        treatment: a.treatment.id,
                        specialistId: a.specialist.id,
                        clinic: a.clinic,
                        start: a.start,
                        end: a.end,
                        price: a.price,
                      })
                    }
                  >
                    <PkIcon name="euro" size={15} />
                    {t('pk.facturen.agenda.invoice')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('pk.facturen.agenda.none')}</Empty>
          )}
        </Card>

        <Card
          eyebrow={t('pk.facturen.list.eyebrow')}
          title={t('pk.facturen.list.title')}
          actions={
            <label className="pk-search">
              <PkIcon name="search" size={16} />
              <input className="pk-input" placeholder={t('pk.facturen.list.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          }
        >
          <div className="pk-bi-filter">
            <Seg
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setShown(PAGE);
              }}
              label={t('pk.common.filter')}
              options={[
                { value: 'all', label: t('pk.common.all') },
                { value: 'concept', label: t('pk.facturen.filter.concept') },
                { value: 'open', label: t('pk.facturen.filter.open') },
                { value: 'paid', label: t('pk.facturen.filter.paid') },
                { value: 'insurer', label: t('pk.facturen.filter.insurer') },
                { value: 'credit', label: t('pk.facturen.filter.credit') },
              ]}
            />
          </div>
          <TableWrap label={t('pk.facturen.list.title')}>
            <table className="pk-table pk-bi-table">
              <thead>
                <tr>
                  <th>{t('pk.facturen.doc.number')}</th>
                  <th>{t('pk.common.client')}</th>
                  <th>{t('pk.facturen.list.method')}</th>
                  <th className="end">{t('pk.common.total')}</th>
                  <th>{t('pk.common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, shown).map((inv) => {
                  const sums = totals(inv);
                  const mixed = inv.lines.some((l) => l.ref.type === 'product' || l.ref.type === 'package') && inv.lines.some((l) => l.ref.type === 'treatment');
                  return (
                    <tr key={inv.id} aria-selected={inv.id === selected} onClick={() => select(inv.id)} className="pk-bi-row">
                      <td className="nowrap">
                        <span className="pk-mono">{inv.number ?? '—'}</span>
                        <small className="pk-bi-mixed">{dmy(inv.date)}</small>
                      </td>
                      <td className="nowrap">
                        {inv.client}
                        <small className="pk-bi-mixed">
                          {t(KIND_KEY[inv.kind])}
                          {mixed ? ` · ${t('pk.facturen.list.mixed')}` : ''}
                        </small>
                      </td>
                      <td className="nowrap pk-muted">
                        {inv.payer === 'insurer'
                          ? insurerById(clientFor(inv.short, inv.locationId, today).insurer).name
                          : inv.payments.length
                            ? inv.payments.map((p) => t(METHOD_KEY[p.method])).join(' + ')
                            : inv.onAccount
                              ? t(METHOD_KEY.account)
                              : '—'}
                      </td>
                      <td className="end nowrap">{money(sums.total)}</td>
                      <td>
                        <InvoiceStatus invoice={inv} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
          {list.length > shown ? (
            <div className="pk-bi-more">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setShown((n) => n + PAGE * 2)}>
                {t('pk.facturen.list.more', { n: list.length - shown })}
              </button>
            </div>
          ) : null}
        </Card>

        <Card eyebrow={t('pk.facturen.open.eyebrow')} title={t('pk.facturen.open.title')} help={t('pk.facturen.open.help', { term: layout.term })} feature="i.open">
          {open.length ? (
            <TableWrap label={t('pk.facturen.open.title')}>
              <table className="pk-table pk-bi-open">
                <thead>
                  <tr>
                    <th>{t('pk.common.client')}</th>
                    <th>{t('pk.facturen.open.days')}</th>
                    <th className="end">{t('pk.facturen.editor.open')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {open.slice(0, openShown).map((inv) => {
                    const days = daysBetween(inv.date, now);
                    return (
                      <tr key={inv.id}>
                        <td className="nowrap">
                          {inv.client}
                          <small className="pk-bi-mixed pk-mono">{inv.number}</small>
                        </td>
                        <td className="nowrap">
                          {days > layout.term ? (
                            <Chip tone="bad">{t('pk.facturen.open.overdue', { n: days })}</Chip>
                          ) : (
                            <span className="pk-muted">{t('pk.facturen.open.daysN', { n: days })}</span>
                          )}
                          {inv.reminded ? <small className="pk-bi-reminded">{t('pk.facturen.open.reminded', { date: dmy(inv.reminded) })}</small> : null}
                        </td>
                        <td className="end nowrap">{money(totals(inv).open)}</td>
                        <td className="end nowrap">
                          <span className="pk-row pk-bi-rowactions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => {
                                billing.update(inv.id, (i) => ({ ...i, reminded: now }));
                                demo(t('pk.facturen.open.remindDone', { client: inv.client }));
                              }}
                            >
                              <PkIcon name="mail" size={14} />
                              {t('pk.facturen.open.remind')}
                            </button>
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => select(inv.id)}>
                              {t('pk.facturen.open.pay')}
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          ) : (
            <Empty>{t('pk.facturen.open.none')}</Empty>
          )}
          {open.length > openShown ? (
            <div className="pk-bi-more">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpenShown((n) => n + 10)}>
                {t('pk.facturen.list.more', { n: open.length - openShown })}
              </button>
            </div>
          ) : null}
        </Card>

        <Card eyebrow={t('pk.facturen.rest.eyebrow')} title={t('pk.facturen.rest.title')} help={t('pk.facturen.rest.help')} feature="j.restnota">
          {rests.length ? (
            <ul className="pk-list">
              {rests.map((c) => (
                <li key={c.id} className="pk-bi-rest">
                  <span className="pk-bi-who">
                    <strong>{c.client}</strong>
                    <small className="pk-muted">
                      {insurerById(c.insurer).name} · {dmy(c.date)} · {t('pk.facturen.rest.split', { approved: money(c.approved ?? 0), amount: money(c.amount) })}
                    </small>
                  </span>
                  <strong className="pk-num">{money(c.amount - (c.approved ?? 0))}</strong>
                  {c.rest ? (
                    <Chip tone={c.rest === 'nota' ? 'good' : 'neutral'}>{t(c.rest === 'nota' ? 'pk.facturen.rest.billed' : 'pk.facturen.rest.writtenOff')}</Chip>
                  ) : (
                    <span className="pk-row">
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => {
                          const inv = billing.restnota(c.id);
                          if (inv) {
                            select(inv.id);
                            demo(t('pk.facturen.rest.billedToast', { client: c.client }));
                          }
                        }}
                      >
                        {t('pk.facturen.rest.nota')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          billing.updateClaim(c.id, { rest: 'writtenOff' });
                          demo(t('pk.facturen.rest.writtenOffToast'));
                        }}
                      >
                        {t('pk.facturen.rest.writeOff')}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{t('pk.facturen.rest.none')}</Empty>
          )}
        </Card>

        <Card eyebrow={t('pk.facturen.credit.eyebrow')} title={t('pk.facturen.credit.title')} help={t('pk.facturen.credit.help')} feature="j.credit">
          <ul className="pk-list">
            {credits.slice(0, 4).map((inv) => (
              <li key={inv.id}>
                <PkIcon name="undo" size={16} />
                <span className="pk-bi-who">
                  <strong>
                    <span className="pk-mono">{inv.number}</span> · {inv.client}
                  </strong>
                  <small className="pk-muted">{t('pk.facturen.credit.of', { number: inv.creditOf ?? '—', date: dmy(inv.date) })}</small>
                </span>
                <strong className="pk-num">{money(totals(inv).total)}</strong>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => onPreview(inv)}>
                  {t('pk.common.view')}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="span-5 pk-bi-side" ref={editor}>
        <Editor invoice={current} billing={billing} onPreview={onPreview} onCredit={onCredit} />
      </div>
    </div>
  );
}

/** The invoice as the client gets it, ready to print or mail. */
function PreviewModal({ invoice, billing, onClose }: { invoice: Invoice | null; billing: ReturnType<typeof useBilling>; onClose: () => void }) {
  const { t } = useI18n();
  const { demo, today } = usePraktijk();
  if (!invoice) return null;
  const client = clientFor(invoice.short, invoice.locationId, today);
  return (
    <Modal
      open
      wide
      title={invoice.number ? `${t(KIND_KEY[invoice.kind])} ${invoice.number}` : t('pk.facturen.doc.concept')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => demo(t('pk.facturen.editor.mailed', { email: client.email }))}>
            <PkIcon name="mail" size={16} />
            {t('pk.common.mail')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <PkIcon name="printer" size={16} />
            {t('pk.common.print')}
          </button>
        </>
      }
    >
      <div className="pk-bi-print">
        <InvoiceDoc invoice={invoice} layout={billing.layout} />
      </div>
    </Modal>
  );
}

/** Choose the lines to credit; credited products go back on the shelf. */
function CreditModal({ invoice, onClose, onCredit }: { invoice: Invoice | null; onClose: () => void; onCredit: (keys: string[]) => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const label = useLineLabel();
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => setKeys(invoice ? invoice.lines.map((l) => l.key) : []), [invoice?.id]);
  if (!invoice) return null;
  return (
    <Modal
      open
      title={t('pk.facturen.credit.modal', { number: invoice.number ?? '' })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={!keys.length} onClick={() => onCredit(keys)}>
            <PkIcon name="undo" size={16} />
            {t('pk.facturen.credit.confirm', { n: keys.length })}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.facturen.credit.modalHelp')}</p>
      <ul className="pk-list">
        {invoice.lines.map((l) => (
          <li key={l.key}>
            <Check
              checked={keys.includes(l.key)}
              onChange={(on) => setKeys((list) => (on ? [...list, l.key] : list.filter((k) => k !== l.key)))}
              label={
                <span>
                  {l.qty} × {label(l.ref)}
                  {l.ref.type === 'product' ? <small className="pk-bi-mixed">{t('pk.facturen.credit.stock')}</small> : null}
                </span>
              }
            />
            <span className="pk-num pk-bi-push">{money(l.qty * l.unit)}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
