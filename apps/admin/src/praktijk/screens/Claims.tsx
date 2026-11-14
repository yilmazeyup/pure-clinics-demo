import { addDays, dateKey } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { dmy, INSURERS, insurerById } from '../data/core';
import { REASONS, round2, type Claim } from '../data/billing';
import { PkIcon } from '../icons';
import { Bar, Card, Chip, Empty, Seg, Stat, TableWrap, isolate, useMoney } from '../kit';
import { ClaimStatusChip } from './billing/format';
import { useBilling } from './billing/state';
import { Coding } from './claims/Coding';
import { AnbosTab, GdsTab, GphTab, PortalTab } from './claims/Extras';
import './Billing.css';
import './Claims.css';

type Tab = 'vecozo' | 'gds' | 'portal' | 'anbos' | 'gph';

/** Which tab (and Vecozo side) shows a feature, for the jump links of the feature overview. */
const FEATURE_TAB: Record<string, [Tab, ('debit' | 'credit')?]> = {
  'k.vecozo': ['vecozo', 'debit'],
  'k.bulk': ['vecozo', 'debit'],
  'k.status': ['vecozo', 'debit'],
  'k.coding': ['vecozo'],
  'k.codes': ['vecozo'],
  'k.008': ['vecozo'],
  'k.vat': ['vecozo'],
  'j.rejection': ['vecozo', 'credit'],
  'j.resubmit': ['vecozo', 'credit'],
  'j.insurer': ['vecozo', 'credit'],
  'k.gds': ['gds'],
  'k.portal': ['portal'],
  'k.anbos': ['anbos'],
  'k.gph': ['gph'],
};

type Sending = { ids: string[]; done: number; phase: 'sending' | 'waiting' };

/** Declaraties: claims to insurers through Vecozo, their answers, corrections, and the insurer's own standards. */
export function ClaimsScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const billing = useBilling();
  const [tab, setTab] = useState<Tab>('vecozo');
  const [side, setSide] = useState<'debit' | 'credit'>('debit');

  useEffect(() => {
    const where = target?.feature ? FEATURE_TAB[target.feature] : undefined;
    if (!where) return;
    setTab(where[0]);
    if (where[1]) setSide(where[1]);
  }, [target?.at]);

  return (
    <>
      <Seg
        variant="tabs"
        value={tab}
        onChange={setTab}
        label={t('pk.screen.declaraties')}
        options={[
          { value: 'vecozo', label: 'Vecozo', icon: 'shieldCheck' },
          { value: 'gds', label: t('pk.declaraties.tab.gds'), icon: 'file' },
          { value: 'portal', label: t('pk.declaraties.tab.portal'), icon: 'download' },
          { value: 'anbos', label: 'Anbos', icon: 'sparkle' },
          { value: 'gph', label: 'GPH', icon: 'heart' },
        ]}
      />
      {tab === 'vecozo' ? (
        <VecozoTab billing={billing} side={side} onSide={setSide} />
      ) : tab === 'gds' ? (
        <GdsTab billing={billing} />
      ) : tab === 'portal' ? (
        <PortalTab />
      ) : tab === 'anbos' ? (
        <AnbosTab />
      ) : (
        <GphTab />
      )}
    </>
  );
}

function VecozoTab({ billing, side, onSide }: { billing: ReturnType<typeof useBilling>; side: 'debit' | 'credit'; onSide: (s: 'debit' | 'credit') => void }) {
  const { t } = useI18n();
  const { now, demo, go } = usePraktijk();
  const money = useMoney();
  const { claims } = billing;
  const [picked, setPicked] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState<Sending | null>(null);
  const timers = useRef<number[]>([]);
  const coding = useRef<HTMLDivElement>(null);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const debit = useMemo(() => claims.filter((c) => c.side === 'debit').sort((a, b) => b.date.getTime() - a.date.getTime()), [claims]);
  const credit = useMemo(() => claims.filter((c) => c.side === 'credit').sort((a, b) => b.date.getTime() - a.date.getTime()), [claims]);
  const ready = debit.filter((c) => c.status === 'ready');
  const readyCredit = credit.filter((c) => c.status === 'ready');
  // By default the claim that came back for its start date: it shows the whole correction flow.
  const current = claims.find((c) => c.id === selected) ?? debit.find((c) => c.status === 'rejected' && c.reason === '8016') ?? debit.find((c) => c.status === 'rejected') ?? ready[0] ?? null;

  const select = (id: string) => {
    setSelected(id);
    if (window.innerWidth < 1100) window.setTimeout(() => coding.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  /** Hands the claims to Vecozo in one batch: a progress bar, then the insurers' return information a moment later. */
  const send = (ids: string[]) => {
    if (!ids.length || sending) return;
    const batch = `VZ-${dateKey(now).replace(/-/g, '').slice(2)}-${String(Math.floor(Math.random() * 90) + 10)}`;
    const snapshot = claims.filter((c) => ids.includes(c.id));
    setSending({ ids, done: 0, phase: 'sending' });
    ids.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setSending((s) => (s ? { ...s, done: i + 1 } : s)), 180 + i * Math.min(260, 1800 / ids.length)));
    });
    const sentAt = 260 + ids.length * Math.min(260, 1800 / ids.length);
    timers.current.push(
      window.setTimeout(() => {
        billing.sendClaims(ids, batch);
        setPicked((p) => p.filter((id) => !ids.includes(id)));
        setSending((s) => (s ? { ...s, phase: 'waiting' } : s));
        demo(t('pk.declaraties.send.sent', { n: ids.length, batch }));
      }, sentAt),
    );
    timers.current.push(
      window.setTimeout(() => {
        const counts = billing.answer(ids, snapshot);
        setSending(null);
        demo(t('pk.declaraties.send.answered', counts));
      }, sentAt + 2600),
    );
  };

  const groups = INSURERS.filter((i) => i.contracted)
    .map((insurer) => ({ insurer, list: debit.filter((c) => c.insurer === insurer.id) }))
    .filter((g) => g.list.length);

  const approvedSum = debit.filter((c) => c.status === 'approved' || c.status === 'partial').reduce((s, c) => s + (c.approved ?? 0), 0);

  return (
    <div className="pk-stack">
      <div className="pk-stats">
        <Stat label={t('pk.declaraties.stat.ready')} value={ready.length} sub={money(ready.reduce((s, c) => s + c.amount, 0))} />
        <Stat label={t('pk.declaraties.stat.sent')} value={debit.filter((c) => c.status === 'sent').length} sub={t('pk.declaraties.stat.sentSub')} />
        <Stat label={t('pk.declaraties.stat.approved')} value={money(approvedSum)} sub={t('pk.declaraties.stat.approvedSub')} tone="good" />
        <Stat label={t('pk.declaraties.stat.rejected')} value={debit.filter((c) => c.status === 'rejected').length} sub={t('pk.declaraties.stat.rejectedSub')} tone="bad" />
      </div>

      <div className="pk-grid">
        <Card
          className="span-8"
          eyebrow={t('pk.declaraties.vecozo.eyebrow')}
          title={t('pk.declaraties.vecozo.title')}
          help={t('pk.declaraties.vecozo.help')}
          feature="k.vecozo"
          actions={
            <Seg
              value={side}
              onChange={onSide}
              label={t('pk.declaraties.vecozo.side')}
              options={[
                { value: 'debit', label: t('pk.declaraties.vecozo.debit', { n: ready.length }) },
                { value: 'credit', label: t('pk.declaraties.vecozo.credit', { n: credit.length }) },
              ]}
            />
          }
        >
          {sending ? (
            <div className="pk-dc-progress" role="status">
              <div className="pk-row pk-row--between">
                <strong>
                  {sending.phase === 'sending'
                    ? t('pk.declaraties.send.progress', { done: sending.done, n: sending.ids.length })
                    : t('pk.declaraties.send.waiting')}
                </strong>
                <span className="pk-muted pk-small">Vecozo · PM304</span>
              </div>
              <Bar value={sending.phase === 'sending' ? sending.done : sending.ids.length} max={sending.ids.length} tone={sending.phase === 'waiting' ? 'now' : 'brand'} />
            </div>
          ) : null}

          {side === 'debit' ? (
            <>
              <div className="pk-dc-bulk" data-feature="k.bulk">
                <span className="pk-small pk-muted">{t('pk.declaraties.bulk.help')}</span>
                <button type="button" className="btn btn-primary" disabled={!ready.length || Boolean(sending)} onClick={() => send(ready.map((c) => c.id))}>
                  <PkIcon name="send" size={16} />
                  {t('pk.declaraties.bulk.all', { n: ready.length })}
                </button>
              </div>
              {groups.map(({ insurer, list }) => {
                const open = list.filter((c) => c.status === 'ready');
                const chosen = open.filter((c) => picked.includes(c.id));
                return (
                  <section key={insurer.id} className="pk-dc-group">
                    <header className="pk-dc-group-head">
                      <label className="pk-check">
                        <input
                          type="checkbox"
                          disabled={!open.length}
                          checked={open.length > 0 && chosen.length === open.length}
                          onChange={(e) =>
                            setPicked((p) => (e.target.checked ? [...new Set([...p, ...open.map((c) => c.id)])] : p.filter((id) => !open.some((c) => c.id === id))))
                          }
                        />
                        <strong>{insurer.name}</strong>
                      </label>
                      <Chip tone="outline">UZOVI {isolate(insurer.uzovi)}</Chip>
                      <span className="pk-small pk-muted">{t('pk.declaraties.group.count', { n: list.length, ready: open.length })}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small pk-dc-group-send"
                        disabled={!chosen.length || Boolean(sending)}
                        onClick={() => send(chosen.map((c) => c.id))}
                      >
                        <PkIcon name="send" size={14} />
                        {t('pk.declaraties.group.send', { n: chosen.length })}
                      </button>
                    </header>
                    <TableWrap label={insurer.name}>
                      <table className="pk-table pk-dc-table">
                        <thead>
                          <tr>
                            <th />
                            <th>{t('pk.declaraties.col.client')}</th>
                            <th>{t('pk.declaraties.col.service')}</th>
                            <th className="end">{t('pk.common.amount')}</th>
                            <th>{t('pk.common.status')}</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {list.slice(0, 12).map((c) => (
                            <ClaimRow
                              key={c.id}
                              claim={c}
                              selected={current?.id === c.id}
                              picked={picked.includes(c.id)}
                              onPick={(on) => setPicked((p) => (on ? [...p, c.id] : p.filter((id) => id !== c.id)))}
                              onSelect={() => select(c.id)}
                              billing={billing}
                              onRest={() => go('facturen', { feature: 'j.restnota' })}
                            />
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  </section>
                );
              })}
              <Legend />
            </>
          ) : (
            <CreditSide billing={billing} credit={credit} readyCredit={readyCredit} onSend={send} sending={Boolean(sending)} onSelect={select} />
          )}
        </Card>

        <div className="span-4 pk-dc-side" ref={coding}>
          <Coding
            claim={current}
            billing={billing}
            onResubmit={(id) => {
              const again = billing.resubmit(id);
              if (again) {
                setSelected(again.id);
                demo(t('pk.declaraties.action.resubmitted'));
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  claim: Claim;
  selected: boolean;
  picked: boolean;
  onPick: (on: boolean) => void;
  onSelect: () => void;
  billing: ReturnType<typeof useBilling>;
  onRest: () => void;
};

function ClaimRow({ claim: c, selected, picked, onPick, onSelect, billing, onRest }: RowProps) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <tr className="pk-bi-row" aria-selected={selected} onClick={onSelect}>
      <td onClick={stop}>
        {c.status === 'ready' ? <input type="checkbox" className="pk-dc-pick" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={c.client} /> : null}
      </td>
      <td className="nowrap">
        {c.client}
        <small className="pk-bi-mixed pk-mono">BSN {c.bsn}</small>
        {c.resubmitOf ? <small className="pk-bi-mixed">{t('pk.declaraties.row.again')}</small> : null}
      </td>
      <td className="nowrap">
        {dmy(c.date)}
        <small className="pk-bi-mixed pk-mono">{c.prestatie}</small>
      </td>
      <td className="end nowrap">
        {money(c.amount)}
        {c.status === 'partial' && c.approved !== null ? <small className="pk-dc-approved">{t('pk.declaraties.row.approved', { amount: money(c.approved) })}</small> : null}
      </td>
      <td>
        <ClaimStatusChip status={c.status} side={c.side} />
        {c.reason ? (
          <small className="pk-dc-reasonline">
            <b className="pk-mono">{c.reason}</b> {t(`pk.declaraties.reason.${c.reason}`)}
          </small>
        ) : null}
      </td>
      <td className="end nowrap" onClick={stop}>
        {c.status === 'approved' ? (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            data-feature="j.insurer"
            onClick={() => {
              billing.creditClaim(c.id, 'all');
              demo(t('pk.declaraties.action.creditedInsurer'));
            }}
          >
            {t('pk.declaraties.action.credit')}
          </button>
        ) : c.status === 'partial' ? (
          <span className="pk-row pk-dc-actions">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              disabled={c.restCredited}
              onClick={() => {
                billing.creditClaim(c.id, 'rest');
                demo(t('pk.declaraties.action.creditedRest'));
              }}
            >
              {c.restCredited ? t('pk.declaraties.action.restDone') : t('pk.declaraties.action.creditRest')}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={onRest}>
              {t('pk.declaraties.action.restnota')}
            </button>
          </span>
        ) : c.status === 'rejected' ? (
          <span className="pk-row pk-dc-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={onSelect}>
              {t('pk.declaraties.action.correct')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                billing.creditClaim(c.id, 'all');
                demo(t('pk.declaraties.action.creditedRejected'));
              }}
            >
              {t('pk.declaraties.action.credit')}
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/** What the statuses and the insurers' return codes mean. */
function Legend() {
  const { t } = useI18n();
  return (
    <div className="pk-dc-legend" data-feature="k.status">
      <h3 className="pk-field-label">{t('pk.declaraties.legend.title')}</h3>
      <div className="pk-row">
        <ClaimStatusChip status="ready" side="debit" />
        <ClaimStatusChip status="sent" side="debit" />
        <ClaimStatusChip status="approved" side="debit" />
        <ClaimStatusChip status="partial" side="debit" />
        <ClaimStatusChip status="rejected" side="debit" />
      </div>
      <ul className="pk-dc-codes-list">
        {REASONS.map((r) => (
          <li key={r}>
            <b className="pk-mono">{r}</b>
            <span>{t(`pk.declaraties.reason.${r}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type CreditProps = {
  billing: ReturnType<typeof useBilling>;
  credit: Claim[];
  readyCredit: Claim[];
  onSend: (ids: string[]) => void;
  sending: boolean;
  onSelect: (id: string) => void;
};

/** Credit lines: corrections to claims that were sent, going to Vecozo as their own batch. */
function CreditSide({ billing, credit, readyCredit, onSend, sending, onSelect }: CreditProps) {
  const { t } = useI18n();
  const { demo, today } = usePraktijk();
  const money = useMoney();
  const rejected = billing.claims.filter((c) => c.side === 'debit' && c.status === 'rejected');
  const approved = billing.claims.filter((c) => c.side === 'debit' && c.status === 'approved' && c.date > addDays(today, -30));

  return (
    <>
      <div className="pk-dc-ways">
        <div data-feature="j.rejection">
          <PkIcon name="undo" size={18} />
          <strong>{t('pk.declaraties.credit.rejectionTitle')}</strong>
          <p>{t('pk.declaraties.credit.rejectionBody')}</p>
          <span className="pk-small pk-muted">{t('pk.declaraties.credit.rejectionCount', { n: rejected.length })}</span>
        </div>
        <div data-feature="j.resubmit">
          <PkIcon name="refresh" size={18} />
          <strong>{t('pk.declaraties.credit.resubmitTitle')}</strong>
          <p>{t('pk.declaraties.credit.resubmitBody')}</p>
          {rejected[0] ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onSelect(rejected[0].id)}>
              {t('pk.declaraties.credit.openRejected', { client: rejected[0].client })}
            </button>
          ) : null}
        </div>
        <div data-feature="j.insurer">
          <PkIcon name="file" size={18} />
          <strong>{t('pk.declaraties.credit.insurerTitle')}</strong>
          <p>{t('pk.declaraties.credit.insurerBody')}</p>
          {approved[0] ? (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                billing.creditClaim(approved[0].id, 'all');
                demo(t('pk.declaraties.action.creditedInsurer'));
              }}
            >
              {t('pk.declaraties.credit.creditExample', { client: approved[0].client })}
            </button>
          ) : null}
        </div>
      </div>

      <div className="pk-dc-bulk">
        <span className="pk-small pk-muted">{t('pk.declaraties.credit.help')}</span>
        <button type="button" className="btn btn-primary" disabled={!readyCredit.length || sending} onClick={() => onSend(readyCredit.map((c) => c.id))}>
          <PkIcon name="send" size={16} />
          {t('pk.declaraties.credit.send', { n: readyCredit.length })}
        </button>
      </div>

      {credit.length ? (
        <TableWrap label={t('pk.declaraties.vecozo.credit', { n: credit.length })}>
          <table className="pk-table pk-dc-table">
            <thead>
              <tr>
                <th>{t('pk.common.client')}</th>
                <th>{t('pk.common.insurer')}</th>
                <th>{t('pk.declaraties.col.date')}</th>
                <th>{t('pk.declaraties.col.of')}</th>
                <th className="end">{t('pk.common.amount')}</th>
                <th>{t('pk.common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {credit.map((c) => (
                <tr key={c.id} className="pk-bi-row" onClick={() => onSelect(c.creditOf ?? c.id)}>
                  <td className="nowrap">{c.client}</td>
                  <td className="nowrap">{insurerById(c.insurer).name}</td>
                  <td className="nowrap">{dmy(c.date)}</td>
                  <td className="nowrap pk-muted">{c.invoiceNumber ?? '—'}</td>
                  <td className="end nowrap pk-bi-neg">{money(round2(c.amount))}</td>
                  <td>
                    <ClaimStatusChip status={c.status} side="credit" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <Empty>{t('pk.declaraties.credit.none')}</Empty>
      )}
    </>
  );
}
