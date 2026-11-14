import { dateKey, TREATMENTS, treatmentById } from '@pure-clinics/shared';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { codesOf, dmy, elevenTest, insurerById, LOCATION_AGB, PRACTICE, staffById } from '../../data/core';
import type { Claim } from '../../data/billing';
import { PkIcon } from '../../icons';
import { Check, Chip, Empty, Field, isolate, useMoney } from '../../kit';
import { startOk } from '../billing/InvoiceDoc';
import { ClaimStatusChip } from '../billing/format';
import type { Billing } from '../billing/state';

/** The insured treatments and their prestatiecodes, for the code picker. */
const INSURED = TREATMENTS.filter((t) => t.insurable);

const toDate = (value: string) => new Date(`${value}T12:00`);

/**
 * Everything an insurer checks on a claim: UZOVI, BSN, the AGB codes of practitioner and practice, the care-trajectory
 * number, prestatie-, aanspraak- and diagnosecode, the start date (never after the treatment), code 008 for care that
 * began elsewhere, and 0% VAT. Editable while the claim has not gone out, or after it came back rejected.
 */
export function Coding({ claim, billing, onResubmit }: { claim: Claim | null; billing: Billing; onResubmit: (id: string) => void }) {
  const { t, text } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();

  if (!claim) {
    return (
      <section className="card pk-card pk-dc-coding" data-feature="k.coding k.codes k.008 k.vat">
        <span className="eyebrow">{t('pk.declaraties.coding.eyebrow')}</span>
        <h2 className="card-title">{t('pk.declaraties.coding.title')}</h2>
        <Empty>{t('pk.declaraties.coding.none')}</Empty>
      </section>
    );
  }

  const editable = claim.side === 'debit' && (claim.status === 'ready' || claim.status === 'rejected');
  const insurer = insurerById(claim.insurer);
  const practitioner = staffById(claim.practitioner);
  const ok = startOk(claim.start, claim.date);
  const set = (patch: Partial<Claim>) => billing.updateClaim(claim.id, patch);

  return (
    <section className="card pk-card pk-dc-coding" data-feature="k.coding">
      <div className="card-head">
        <div>
          <span className="eyebrow">{t('pk.declaraties.coding.eyebrow')}</span>
          <h2 className="card-title">{claim.client}</h2>
        </div>
        <ClaimStatusChip status={claim.status} side={claim.side} />
      </div>
      <p className="pk-small pk-muted pk-dc-coding-sub">
        {text(treatmentById(claim.treatment).name)} · {dmy(claim.date)} · {money(claim.amount)}
      </p>
      {claim.reason ? (
        <p className="pk-dc-reason">
          <PkIcon name="warning" size={15} />
          <span>
            <b className="pk-mono">{claim.reason}</b> {t(`pk.declaraties.reason.${claim.reason}`)}
          </span>
        </p>
      ) : null}

      <dl className="pk-dc-codes">
        <div>
          <dt>UZOVI</dt>
          <dd>
            <span className="pk-mono">{insurer.uzovi}</span> · {insurer.name}
          </dd>
        </div>
        <div>
          <dt>BSN</dt>
          <dd>
            <span className="pk-mono">{claim.bsn}</span>{' '}
            {elevenTest(claim.bsn) ? <Chip tone="good">{t('pk.declaraties.coding.elevenOk')}</Chip> : <Chip tone="bad">{t('pk.declaraties.coding.elevenBad')}</Chip>}
          </dd>
        </div>
        <div>
          <dt>{t('pk.declaraties.coding.agbPractitioner')}</dt>
          <dd>
            {practitioner.name} · <span className="pk-mono">{practitioner.agb}</span>
          </dd>
        </div>
        <div>
          <dt>{t('pk.declaraties.coding.agbPractice')}</dt>
          <dd>
            <span className="pk-mono">{PRACTICE.agb}</span> · {t('pk.declaraties.coding.agbLocation', { agb: isolate(LOCATION_AGB[claim.locationId]) })}
          </dd>
        </div>
        <div>
          <dt>{t('pk.facturen.doc.zt')}</dt>
          <dd className="pk-mono">{claim.zt}</dd>
        </div>
      </dl>

      <div className="pk-form pk-dc-fields" data-feature="k.codes">
        <Field label={t('pk.declaraties.coding.prestatie')}>
          <select className="pk-input" disabled={!editable} value={claim.prestatie} onChange={(e) => set({ prestatie: e.target.value })}>
            {INSURED.map((tr) => (
              <option key={tr.id} value={codesOf(tr).prestatie}>
                {codesOf(tr).prestatie} · {text(tr.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.declaraties.coding.aanspraak')}>
          <select className="pk-input" disabled={!editable || claim.code008} value={claim.aanspraak} onChange={(e) => set({ aanspraak: e.target.value })}>
            {(['001', '002', '008'] as const).map((c) => (
              <option key={c} value={c}>
                {c} · {t(`pk.declaraties.coding.aanspraak${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.declaraties.coding.diagnosis')}>
          <input className="pk-input pk-mono" disabled={!editable} value={claim.diagnosis} onChange={(e) => set({ diagnosis: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
        </Field>
        <Field
          label={t('pk.declaraties.coding.start')}
          hint={
            ok ? (
              <span className="pk-dc-ok">{t('pk.declaraties.coding.startOk')}</span>
            ) : (
              <span className="pk-dc-bad">{t('pk.declaraties.coding.startBad', { date: dmy(claim.date) })}</span>
            )
          }
        >
          <input
            className="pk-input"
            type="date"
            disabled={!editable}
            aria-invalid={!ok}
            value={dateKey(claim.start)}
            onChange={(e) => e.target.value && set({ start: toDate(e.target.value) })}
          />
        </Field>
      </div>

      <div className="pk-dc-008" data-feature="k.008">
        <Check
          checked={claim.code008}
          onChange={(on) => set({ code008: on, aanspraak: on ? '008' : '001', entitlementStart: on ? (claim.entitlementStart ?? claim.start) : null })}
          label={t('pk.declaraties.coding.code008')}
        />
        {claim.code008 ? (
          <Field label={t('pk.declaraties.coding.entitlementStart')} hint={t('pk.declaraties.coding.entitlementHint')}>
            <input
              className="pk-input"
              type="date"
              disabled={!editable}
              value={claim.entitlementStart ? dateKey(claim.entitlementStart) : ''}
              onChange={(e) => e.target.value && set({ entitlementStart: toDate(e.target.value) })}
            />
          </Field>
        ) : (
          <small className="pk-muted">{t('pk.declaraties.coding.code008Help')}</small>
        )}
      </div>

      <div className="pk-dc-vat" data-feature="k.vat">
        <Chip tone="brand">{t('pk.declaraties.coding.vat')}</Chip>
        <small className="pk-muted">{t('pk.declaraties.coding.vatHelp')}</small>
      </div>

      {editable ? (
        <div className="pk-row pk-dc-coding-actions">
          <button type="button" className="btn btn-ghost" onClick={() => demo(t('pk.common.demoSaved'))}>
            <PkIcon name="check" size={16} />
            {t('pk.common.save')}
          </button>
          {claim.status === 'rejected' ? (
            <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => onResubmit(claim.id)}>
              <PkIcon name="refresh" size={16} />
              {t('pk.declaraties.action.resubmit')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="pk-small pk-muted">{t('pk.declaraties.coding.locked')}</p>
      )}
    </section>
  );
}
