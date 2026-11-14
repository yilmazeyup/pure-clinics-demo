import { LOCATIONS, PURE_CLINICS, treatmentById } from '@pure-clinics/shared';
import type { CSSProperties } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { clientFor, codesOf, dmy, insurerById, LOCATION_AGB, PRACTICE, staffById } from '../../data/core';
import { totals, type Claim, type Invoice, type InvoiceLayout } from '../../data/billing';
import { Chip, isolate, useMoney } from '../../kit';
import { dueDate } from './state';
import { KIND_KEY, METHOD_KEY, useLineLabel } from './format';

/** The start of a care trajectory must lie on or before the day of treatment, or the insurer rejects the claim. */
export const startOk = (start: Date, service: Date) => start.getTime() <= new Date(service).setHours(23, 59, 59, 999);

/**
 * An invoice as the client receives it: the Pure Clinics wordmark, both addresses, the lines, VAT and totals. A
 * restitutienota (or a claim's preview) also carries the GDS coding the insurer needs.
 */
export function InvoiceDoc({ invoice, layout, claim }: { invoice: Invoice; layout: InvoiceLayout; claim?: Claim }) {
  const { t } = useI18n();
  const { today } = usePraktijk();
  const money = useMoney();
  const label = useLineLabel();
  const loc = LOCATIONS.find((l) => l.id === invoice.locationId) ?? LOCATIONS[0];
  const [street, postcode] = loc.address.split(', ');
  const client = clientFor(invoice.short, invoice.locationId, today);
  const sums = totals(invoice);
  const practitioner = invoice.practitioner ? staffById(invoice.practitioner) : null;
  const gds = invoice.kind === 'restitutie' || Boolean(claim);
  const insurer = insurerById(claim?.insurer ?? client.insurer);
  const start = claim?.start ?? invoice.episode?.start ?? null;
  const service = claim?.date ?? invoice.date;
  const due = dueDate(invoice, layout.term);
  const title = invoice.status === 'concept' ? t('pk.facturen.doc.concept') : t(KIND_KEY[invoice.kind]);

  return (
    <article className="pk-bi-doc" style={{ '--doc-accent': layout.accent } as CSSProperties} aria-label={title}>
      <header className={`pk-bi-doc-head pk-bi-doc-head--${layout.logo}`}>
        <span className="pk-bi-doc-mark" aria-label="Pure Clinics">
          <b>PURE</b>CLINICS
        </span>
        <span className="pk-bi-doc-rule" />
      </header>

      <div className="pk-bi-doc-top">
        <div className="pk-bi-doc-from">
          <strong>{PRACTICE.name}</strong>
          <span>{street}</span>
          <span>
            {postcode} {loc.city}
          </span>
          <span className="pk-bi-ltr">{loc.phone}</span>
          <span className="pk-bi-ltr">{PURE_CLINICS.email}</span>
        </div>
        <div className="pk-bi-doc-to">
          <span className="eyebrow">{t('pk.facturen.doc.to')}</span>
          <strong>{client.first} {client.last}</strong>
          <span>{client.street}</span>
          <span>
            {client.postcode} {client.city}
          </span>
        </div>
      </div>

      <div className="pk-bi-doc-title">
        <h3>{title}</h3>
        <dl>
          <div>
            <dt>{t('pk.facturen.doc.number')}</dt>
            <dd className="pk-mono">{invoice.number ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('pk.common.date')}</dt>
            <dd className="pk-mono">{dmy(invoice.date)}</dd>
          </div>
          {invoice.kind !== 'credit' && invoice.status !== 'paid' && invoice.payer !== 'insurer' ? (
            <div>
              <dt>{t('pk.facturen.doc.due')}</dt>
              <dd className="pk-mono">{dmy(due)}</dd>
            </div>
          ) : null}
          {invoice.creditOf ? (
            <div>
              <dt>{t(invoice.kind === 'restnota' ? 'pk.facturen.doc.restOf' : 'pk.facturen.doc.creditOf')}</dt>
              <dd className="pk-mono">{invoice.creditOf}</dd>
            </div>
          ) : null}
          {invoice.episode ? (
            <div>
              <dt>{t('pk.facturen.doc.episode')}</dt>
              <dd>{t(`pk.cond.${invoice.episode.condition}`)}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="pk-bi-doc-lines-wrap">
        <table className="pk-bi-doc-lines">
          <thead>
            <tr>
              <th>{t('pk.facturen.doc.description')}</th>
              <th className="end">{t('pk.facturen.doc.qty')}</th>
              <th className="end">{t('pk.common.price')}</th>
              <th className="end">{t('pk.common.vat')}</th>
              <th className="end">{t('pk.common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => {
              const codes = l.ref.type === 'treatment' ? codesOf(treatmentById(l.ref.id)) : null;
              return (
                <tr key={l.key}>
                  <td>
                    {label(l.ref)}
                    {gds && codes?.prestatie ? (
                      <small className="pk-bi-doc-code">
                        {t('pk.facturen.doc.lineCode', { prestatie: codes.prestatie, aanspraak: claim?.aanspraak ?? codes.aanspraak, date: dmy(service) })}
                      </small>
                    ) : null}
                  </td>
                  <td className="end">{l.qty}</td>
                  <td className="end">{money(l.unit)}</td>
                  <td className="end">{l.vat}%</td>
                  <td className="end">{money(l.qty * l.unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="pk-bi-doc-sums">
        {sums.discount ? (
          <>
            <div>
              <dt>{t('pk.facturen.doc.subtotal')}</dt>
              <dd>{money(sums.gross)}</dd>
            </div>
            <div>
              <dt>{invoice.discount.mode === 'pct' ? t('pk.facturen.doc.discountPct', { n: invoice.discount.value }) : t('pk.facturen.doc.discount')}</dt>
              <dd>− {money(sums.discount)}</dd>
            </div>
          </>
        ) : null}
        {invoice.lines.some((l) => l.vat === 21) ? (
          <div>
            <dt>{t('pk.facturen.doc.vat21')}</dt>
            <dd>{money(sums.vat21)}</dd>
          </div>
        ) : null}
        {invoice.lines.some((l) => l.vat === 0) ? (
          <div>
            <dt>{t('pk.facturen.doc.vat0')}</dt>
            <dd>{money(0)}</dd>
          </div>
        ) : null}
        <div className="pk-bi-doc-total">
          <dt>{t('pk.common.total')}</dt>
          <dd>{money(sums.total)}</dd>
        </div>
        {invoice.payments.map((p, i) => (
          <div key={i} className="pk-bi-doc-paid">
            <dt>{t('pk.facturen.doc.paidWith', { method: { msg: METHOD_KEY[p.method] }, date: dmy(p.at) })}</dt>
            <dd>{money(p.amount)}</dd>
          </div>
        ))}
        {invoice.payer === 'insurer' ? <p className="pk-bi-doc-note">{t('pk.facturen.doc.byInsurer', { insurer: insurer.name })}</p> : null}
      </dl>

      {gds ? (
        <section className="pk-bi-doc-gds">
          <div className="pk-row pk-row--between">
            <span className="eyebrow">{t('pk.facturen.doc.gds')}</span>
            {start ? (
              startOk(start, service) ? (
                <Chip tone="good" icon="check">
                  {t('pk.facturen.doc.startOk')}
                </Chip>
              ) : (
                <Chip tone="bad" icon="warning">
                  {t('pk.facturen.doc.startBad')}
                </Chip>
              )
            ) : null}
          </div>
          <dl>
            <div>
              <dt>{t('pk.facturen.doc.practitioner')}</dt>
              <dd>
                {practitioner ? `${practitioner.name} · AGB ${isolate(practitioner.agb)}` : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('pk.facturen.doc.practice')}</dt>
              <dd>AGB {isolate(LOCATION_AGB[invoice.locationId])}</dd>
            </div>
            <div>
              <dt>BSN</dt>
              <dd className="pk-mono">{claim?.bsn ?? client.bsn}</dd>
            </div>
            <div>
              <dt>{t('pk.common.insurer')}</dt>
              <dd>
                {insurer.name} · UZOVI {isolate(insurer.uzovi)} · {t('pk.facturen.doc.policy')} {isolate(client.policy)}
              </dd>
            </div>
            <div>
              <dt>{t('pk.facturen.doc.zt')}</dt>
              <dd className="pk-mono">{claim?.zt ?? invoice.episode?.zt ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('pk.facturen.doc.start')}</dt>
              <dd className="pk-mono">{start ? dmy(start) : '—'}</dd>
            </div>
            <div>
              <dt>{t('pk.facturen.doc.diagnosis')}</dt>
              <dd className="pk-mono">{claim?.diagnosis ?? invoice.episode?.diagnosis ?? '—'}</dd>
            </div>
            {claim?.code008 && claim.entitlementStart ? (
              <div>
                <dt>{t('pk.declaraties.coding.entitlementStart')}</dt>
                <dd className="pk-mono">{dmy(claim.entitlementStart)} · 008</dd>
              </div>
            ) : null}
          </dl>
          <p className="pk-small pk-muted">{t('pk.facturen.doc.vatExempt')}</p>
        </section>
      ) : null}

      <footer className="pk-bi-doc-foot">
        <p>{layout.footer ?? t('pk.facturen.doc.footer', { term: layout.term })}</p>
        <p className="pk-bi-doc-legal">
          {[
            layout.showAgb ? `AGB ${PRACTICE.agb}` : null,
            layout.showKvk ? `KvK ${PRACTICE.kvk}` : null,
            layout.showIban ? `IBAN ${PRACTICE.iban}` : null,
          ]
            .filter(Boolean)
            .map((part) => (
              <span key={part} className="pk-bi-ltr">
                {part}
              </span>
            ))}
        </p>
      </footer>
    </article>
  );
}
