import { addDays, TREATMENTS, treatmentById, type TreatmentId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { codesOf, dmy, INSURERS, practiceClients, staffById } from '../../data/core';
import { round2 } from '../../data/billing';
import { rng } from '../../../data/random';
import { PkIcon } from '../../icons';
import { Card, Chip, Empty, Field, Kv, Seg, TableWrap, Toggle, useDecimal, useMoney } from '../../kit';
import { InvoiceDoc, startOk } from '../billing/InvoiceDoc';
import type { Billing } from '../billing/state';

/** Restitutienota's for insurers without a contract: the client pays and hands in the nota with its GDS coding. */
export function GdsTab({ billing }: { billing: Billing }) {
  const { t } = useI18n();
  const money = useMoney();
  const notas = useMemo(() => billing.invoices.filter((i) => i.kind === 'restitutie' && i.number).sort((a, b) => b.date.getTime() - a.date.getTime()), [billing.invoices]);
  const [id, setId] = useState<string | null>(null);
  const current = notas.find((n) => n.id === id) ?? notas[0] ?? null;

  return (
    <div className="pk-grid">
      <Card className="span-5" eyebrow={t('pk.declaraties.gds.eyebrow')} title={t('pk.declaraties.gds.title')} help={t('pk.declaraties.gds.help')} feature="k.gds">
        {notas.length ? (
          <ul className="pk-list pk-dc-notas">
            {notas.map((n) => {
              const ok = n.episode ? startOk(n.episode.start, n.date) : true;
              return (
                <li key={n.id}>
                  <button type="button" className="pk-dc-nota" aria-pressed={n.id === current?.id} onClick={() => setId(n.id)}>
                    <span className="pk-bi-who">
                      <strong>{n.client}</strong>
                      <small className="pk-muted">
                        <span className="pk-mono">{n.number}</span> · {dmy(n.date)}
                      </small>
                    </span>
                    <span className="pk-num">{money(n.lines.reduce((s, l) => s + l.qty * l.unit, 0))}</span>
                    {ok ? <Chip tone="good">{t('pk.declaraties.gds.ok')}</Chip> : <Chip tone="bad">{t('pk.declaraties.gds.bad')}</Chip>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{t('pk.declaraties.gds.none')}</Empty>
        )}
      </Card>
      <div className="span-7 pk-bi-layoutpreview">
        <span className="eyebrow">{t('pk.facturen.layout.preview')}</span>
        {current ? <InvoiceDoc invoice={current} layout={billing.layout} /> : null}
      </div>
    </div>
  );
}

const PORTAL_TREATMENTS = TREATMENTS.filter((tr) => tr.insurable);

/** A contracted price per insurer and prestatiecode, a little under the clinic's own price. */
function priceFor(insurer: string, treatment: TreatmentId, year: number): number {
  const base = treatmentById(treatment).priceFrom;
  const r = rng(`contract-${insurer}-${treatment}`);
  const p2026 = round2(base * (0.86 + r() * 0.12));
  return year === 2026 ? p2026 : round2(p2026 * (1.018 + rng(`raise-${insurer}`)() * 0.03));
}

/** The insurers' portal: the contracted prices for this year, and once a year the import of next year's. */
export function PortalTab() {
  const { t, text } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();
  const decimal = useDecimal();
  const contracted = INSURERS.filter((i) => i.contracted);
  const [imported, setImported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<'2026' | '2027'>('2026');

  const load = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setImported(true);
      setYear('2027');
      demo(t('pk.declaraties.portal.done', { n: contracted.length * PORTAL_TREATMENTS.length }));
    }, 1400);
  };

  return (
    <Card
      eyebrow={t('pk.declaraties.portal.eyebrow')}
      title={t('pk.declaraties.portal.title')}
      help={t('pk.declaraties.portal.help')}
      feature="k.portal"
      actions={
        <>
          {imported ? (
            <Seg value={year} onChange={setYear} label={t('pk.declaraties.portal.year')} options={[{ value: '2026', label: '2026' }, { value: '2027', label: '2027' }]} />
          ) : null}
          <button type="button" className="btn btn-primary" disabled={loading || imported} onClick={load}>
            <PkIcon name={imported ? 'check' : 'download'} size={16} />
            {imported ? t('pk.declaraties.portal.imported') : loading ? t('pk.declaraties.portal.loading') : t('pk.declaraties.portal.import')}
          </button>
        </>
      }
    >
      <TableWrap label={t('pk.declaraties.portal.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.declaraties.col.prestatie')}</th>
              <th>{t('pk.common.treatment')}</th>
              {contracted.map((i) => (
                <th key={i.id} className="end">
                  {i.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PORTAL_TREATMENTS.map((tr) => (
              <tr key={tr.id}>
                <td className="pk-mono">{codesOf(tr).prestatie}</td>
                <td className="nowrap">{text(tr.name)}</td>
                {contracted.map((i) => {
                  const now = priceFor(i.id, tr.id, Number(year));
                  const before = priceFor(i.id, tr.id, 2026);
                  return (
                    <td key={i.id} className="end nowrap">
                      {money(now)}
                      {year === '2027' ? <small className="pk-dc-up">+{money(round2(now - before))}</small> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {imported ? (
        <div className="pk-dc-changelog">
          <h3 className="pk-field-label">{t('pk.declaraties.portal.changes')}</h3>
          <ul className="pk-list pk-small">
            {contracted.map((i) => {
              const pct = (priceFor(i.id, 'acne', 2027) / priceFor(i.id, 'acne', 2026) - 1) * 100;
              return (
                <li key={i.id}>
                  <strong>{i.name}</strong>
                  <span className="pk-muted">{t('pk.declaraties.portal.change', { pct: decimal(pct), n: PORTAL_TREATMENTS.length })}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="pk-small pk-muted pk-dc-note">{t('pk.declaraties.portal.note')}</p>
      )}
    </Card>
  );
}

const ANBOS_CODES: { code: string; treatment: TreatmentId }[] = [
  { code: 'A101', treatment: 'acne' },
  { code: 'A104', treatment: 'deepclean' },
  { code: 'A210', treatment: 'epilation' },
  { code: 'A305', treatment: 'camouflage' },
];

/** Beauty claims after the Anbos standard: a nota with the Anbos code that the client hands to her insurer. */
export function AnbosTab() {
  const { t, text } = useI18n();
  const { today, demo } = usePraktijk();
  const money = useMoney();
  const [on, setOn] = useState(true);
  const notas = useMemo(() => {
    const clients = practiceClients(today);
    return ANBOS_CODES.slice(0, 3).map((c, i) => ({ ...c, client: clients[(i * 7 + 3) % clients.length], date: addDays(today, -(i * 3 + 1)) }));
  }, [today]);
  const hawin = staffById('hawin');

  return (
    <div className="pk-grid">
      <Card className="span-5" eyebrow={t('pk.declaraties.anbos.eyebrow')} title={t('pk.declaraties.anbos.title')} help={t('pk.declaraties.anbos.help')} feature="k.anbos">
        <Toggle checked={on} onChange={setOn} label={t('pk.declaraties.anbos.on')} hint={t('pk.declaraties.anbos.onHint')} />
        <Kv
          rows={[
            [t('pk.declaraties.anbos.member'), `${hawin.name} · Blanche Beauty Studio`],
            [t('pk.declaraties.anbos.number'), <span key="n" className="pk-mono">ANB-99-0412</span>],
            [t('pk.declaraties.anbos.standard'), t('pk.declaraties.anbos.standardValue')],
          ]}
        />
        <TableWrap label={t('pk.declaraties.anbos.codes')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.declaraties.anbos.code')}</th>
                <th>{t('pk.common.treatment')}</th>
                <th className="end">{t('pk.common.price')}</th>
              </tr>
            </thead>
            <tbody>
              {ANBOS_CODES.map((c) => (
                <tr key={c.code}>
                  <td className="pk-mono">{c.code}</td>
                  <td>{text(treatmentById(c.treatment).name)}</td>
                  <td className="end">{money(treatmentById(c.treatment).priceFrom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <Card className="span-7" eyebrow={t('pk.declaraties.anbos.recentEyebrow')} title={t('pk.declaraties.anbos.recent')}>
        {on ? (
          <ul className="pk-list">
            {notas.map((n) => (
              <li key={n.code}>
                <span className="pk-mono pk-dc-anbos-code">{n.code}</span>
                <span className="pk-bi-who">
                  <strong>
                    {n.client.first} {n.client.last}
                  </strong>
                  <small className="pk-muted">
                    {text(treatmentById(n.treatment).name)} · {dmy(n.date)}
                  </small>
                </span>
                <span className="pk-num">{money(treatmentById(n.treatment).priceFrom)}</span>
                <Chip tone="good">{t('pk.declaraties.anbos.given')}</Chip>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('pk.declaraties.anbos.off')}</Empty>
        )}
        <button type="button" className="btn btn-ghost" disabled={!on} onClick={() => demo(t('pk.declaraties.anbos.made'))}>
          <PkIcon name="plus" size={16} />
          {t('pk.declaraties.anbos.make')}
        </button>
      </Card>
    </div>
  );
}

const GPH_CODES = ['1201', '1202', '1210'] as const;

/** Breast-prosthesis claims with GPH coding: in the module, switched off because Pure does not supply them. */
export function GphTab() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [on, setOn] = useState(false);
  const [code, setCode] = useState<(typeof GPH_CODES)[number]>('1201');
  const [sideOf, setSideOf] = useState<'left' | 'right' | 'both'>('left');
  return (
    <Card eyebrow={t('pk.declaraties.gph.eyebrow')} title={t('pk.declaraties.gph.title')} help={t('pk.declaraties.gph.help')} feature="k.gph">
      <Toggle checked={on} onChange={setOn} label={t('pk.declaraties.gph.on')} hint={on ? t('pk.declaraties.gph.onHint') : t('pk.declaraties.gph.offHint')} />
      {on ? (
        <div className="pk-stack pk-dc-gph">
          <div className="pk-form">
            <Field label={t('pk.declaraties.gph.code')}>
              <select className="pk-input" value={code} onChange={(e) => setCode(e.target.value as (typeof GPH_CODES)[number])}>
                {GPH_CODES.map((c) => (
                  <option key={c} value={c}>
                    GPH {c} · {t(`pk.declaraties.gph.c${c}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('pk.declaraties.gph.side')}>
              <Seg
                value={sideOf}
                onChange={setSideOf}
                label={t('pk.declaraties.gph.side')}
                options={[
                  { value: 'left', label: t('pk.declaraties.gph.left') },
                  { value: 'right', label: t('pk.declaraties.gph.right') },
                  { value: 'both', label: t('pk.declaraties.gph.both') },
                ]}
              />
            </Field>
            <Field label={t('pk.declaraties.gph.prescriber')}>
              <input className="pk-input pk-mono" defaultValue="99-000000" />
            </Field>
            <Field label={t('pk.declaraties.gph.delivered')}>
              <input className="pk-input" type="date" />
            </Field>
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={() => demo()}>
              <PkIcon name="plus" size={16} />
              {t('pk.declaraties.gph.make')}
            </button>
          </div>
        </div>
      ) : (
        <Empty>{t('pk.declaraties.gph.notUsed')}</Empty>
      )}
    </Card>
  );
}
