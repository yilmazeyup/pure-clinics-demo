import { LOCALE_NAMES, LOCALES, LOCATIONS, PURE_CLINICS, TREATMENTS, type Locale, type TreatmentId } from '@pure-clinics/shared';
import { useState } from 'react';

import { CATEGORY_COLOR } from '../../../components/ClinicsView';
import { useI18n } from '../../../i18n';
import { useShared, usePraktijk } from '../../context';
import { CONDITIONS, codesOf, LOCATION_AGB, PRACTICE } from '../../data/core';
import { Card, Chip, Field, TableWrap, Toggle, useMoney } from '../../kit';
import { PkIcon } from '../../icons';

/** Clinic details, practice settings, the treatments and their prices, and the conditions. */
export function MasterTab() {
  return (
    <div className="pk-grid">
      <ClinicDetails />
      <PracticeSettings />
      <Treatments />
      <Conditions />
    </div>
  );
}

function ClinicDetails() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [nijmegen, uden] = LOCATIONS;
  return (
    <Card className="span-6" feature="u.clinic" eyebrow={t('pk.instellingen.clinic.eyebrow')} title={t('pk.instellingen.clinic.title')} help={t('pk.instellingen.clinic.help')}>
      <form
        className="pk-form"
        onSubmit={(e) => {
          e.preventDefault();
          demo(t('pk.common.demoSaved'));
        }}
      >
        <Field label={t('pk.instellingen.clinic.name')}>
          <input className="pk-input" defaultValue={PRACTICE.name} />
        </Field>
        <Field label={t('pk.instellingen.clinic.email')}>
          <input className="pk-input" defaultValue={PURE_CLINICS.email} />
        </Field>
        <Field label={t('pk.instellingen.clinic.address')} wide>
          <input className="pk-input" defaultValue={`${nijmegen.address} ${nijmegen.city}`} />
        </Field>
        <Field label={t('pk.instellingen.clinic.phone')}>
          <input className="pk-input" defaultValue={PURE_CLINICS.phone} />
        </Field>
        <Field label={t('pk.instellingen.clinic.agbPractice')} hint={t('pk.common.fake')}>
          <input className="pk-input pk-mono" defaultValue={PRACTICE.agb} />
        </Field>
        <Field label={t('pk.instellingen.clinic.agbLocation', { city: nijmegen.city })}>
          <input className="pk-input pk-mono" defaultValue={LOCATION_AGB.nijmegen} />
        </Field>
        <Field label={t('pk.instellingen.clinic.agbLocation', { city: uden.city })}>
          <input className="pk-input pk-mono" defaultValue={LOCATION_AGB.uden} />
        </Field>
        <Field label={t('pk.instellingen.clinic.kvk')} hint={t('pk.common.fake')}>
          <input className="pk-input pk-mono" defaultValue={PRACTICE.kvk} />
        </Field>
        <Field label={t('pk.instellingen.clinic.iban')} hint={t('pk.common.fake')}>
          <input className="pk-input pk-mono" defaultValue={PRACTICE.iban} />
        </Field>
        <div className="pk-field--wide">
          <button className="btn btn-primary btn-small" type="submit">
            {t('pk.common.save')}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PracticeSettings() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [grid, setGrid] = useState(15);
  const [language, setLanguage] = useState<Locale>('nl');
  const [autoPrint, setAutoPrint] = useState(false);
  const [askConsent, setAskConsent] = useState(true);
  return (
    <Card className="span-6" feature="u.practice" eyebrow={t('pk.instellingen.practice.eyebrow')} title={t('pk.instellingen.practice.title')} help={t('pk.instellingen.practice.help')}>
      <div className="pk-form">
        <Field label={t('pk.instellingen.practice.grid')}>
          <select className="pk-input" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
            {[5, 10, 15, 30].map((n) => (
              <option key={n} value={n}>
                {t('pk.common.minutes', { n })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.instellingen.practice.numbering')} hint={t('pk.instellingen.practice.numberingHint')}>
          <input className="pk-input pk-mono" defaultValue="2026-0431" />
        </Field>
        <Field label={t('pk.instellingen.practice.term')}>
          <select className="pk-input" defaultValue="14">
            {[7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {t('pk.instellingen.practice.days', { n })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.instellingen.practice.channel')}>
          <select className="pk-input" defaultValue="email">
            <option value="email">{t('pk.instellingen.practice.email')}</option>
            <option value="sms">{t('pk.instellingen.practice.sms')}</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </Field>
        <Field label={t('pk.instellingen.practice.reminder')}>
          <select className="pk-input" defaultValue="24">
            {[24, 48].map((n) => (
              <option key={n} value={n}>
                {t('pk.instellingen.practice.hoursBefore', { n })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.instellingen.practice.language')}>
          <select className="pk-input" value={language} onChange={(e) => setLanguage(e.target.value as Locale)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="pk-se-toggles">
        <Toggle checked={askConsent} onChange={setAskConsent} label={t('pk.instellingen.practice.consent')} />
        <Toggle checked={autoPrint} onChange={setAutoPrint} label={t('pk.instellingen.practice.print')} />
      </div>
      <div className="pk-se-langs" data-feature="more.languages">
        <h3 className="pk-subtitle">{t('pk.instellingen.practice.langsTitle')}</h3>
        <p className="pk-small pk-muted">{t('pk.instellingen.practice.langsHelp')}</p>
        <div className="pk-row">
          {LOCALES.map((l) => (
            <Chip key={l} tone={l === language ? 'now' : 'outline'}>
              <span lang={l} dir={l === 'ar' ? 'rtl' : 'ltr'}>
                {LOCALE_NAMES[l]}
              </span>
              {l === 'ar' ? <small className="pk-se-rtl">{t('pk.instellingen.practice.rtl')}</small> : null}
            </Chip>
          ))}
        </div>
      </div>
      <button className="btn btn-primary btn-small pk-se-save" onClick={() => demo(t('pk.common.demoSaved'))}>
        {t('pk.common.save')}
      </button>
    </Card>
  );
}

const round = (n: number) => Math.round(n * 2) / 2;

function Treatments() {
  const i18n = useI18n();
  const { t, text } = i18n;
  const { demo } = usePraktijk();
  const money = useMoney();
  const [prices, setPrices] = useShared<Partial<Record<TreatmentId, number>>>('settings.prices', () => ({}));
  const [raise, setRaise] = useState(3);
  const [preview, setPreview] = useState(false);
  const [applied, setApplied] = useState(false);
  const priceOf = (id: TreatmentId, from: number) => prices[id] ?? from;
  const next = (price: number) => (price === 0 ? 0 : round(price * (1 + raise / 100)));

  return (
    <Card
      feature="u.treatments"
      eyebrow={t('pk.instellingen.treat.eyebrow')}
      title={t('pk.instellingen.treat.title')}
      help={t('pk.instellingen.treat.help')}
    >
      <div className="pk-se-raise" data-feature="i.prices">
        <span className="pk-se-raise-text">
          <PkIcon name="trend" size={17} />
          <span>
            <strong>{t('pk.instellingen.treat.raiseTitle')}</strong>
            <small className="pk-muted">{t('pk.instellingen.treat.raiseHelp')}</small>
          </span>
        </span>
        <label className="pk-row pk-small">
          <span className="pk-muted">{t('pk.instellingen.treat.raiseBy')}</span>
          <select
            className="pk-input pk-se-narrow"
            value={raise}
            onChange={(e) => {
              setRaise(Number(e.target.value));
              setApplied(false);
            }}
          >
            {[2, 3, 4, 5, 7.5, 10].map((n) => (
              <option key={n} value={n}>
                +{n}%
              </option>
            ))}
          </select>
        </label>
        <button className={`btn btn-small ${preview ? 'btn-done' : 'btn-ghost'}`} onClick={() => setPreview((p) => !p)}>
          <PkIcon name="eye" size={14} />
          {t('pk.instellingen.treat.preview')}
        </button>
        <button
          className="btn btn-primary btn-small"
          disabled={applied}
          onClick={() => {
            setPrices(Object.fromEntries(TREATMENTS.map((x) => [x.id, next(priceOf(x.id, x.priceFrom))])));
            setApplied(true);
            setPreview(false);
            demo(t('pk.instellingen.treat.applied', { n: raise }));
          }}
        >
          {applied ? t('pk.instellingen.treat.done') : t('pk.instellingen.treat.apply')}
        </button>
      </div>
      <TableWrap label={t('pk.instellingen.treat.title')}>
        <table className="pk-table pk-se-treat">
          <thead>
            <tr>
              <th>{t('pk.instellingen.treat.col.name')}</th>
              <th>{t('pk.instellingen.treat.col.abbr')}</th>
              <th className="end">{t('pk.instellingen.treat.col.minutes')}</th>
              <th className="end">{t('pk.instellingen.treat.col.price')}</th>
              {preview ? <th className="end">{t('pk.instellingen.treat.col.next')}</th> : null}
              <th className="end">{t('pk.instellingen.treat.col.hour')}</th>
              <th className="end">{t('pk.common.vat')}</th>
              <th>{t('pk.instellingen.treat.col.prestatie')}</th>
              <th>{t('pk.instellingen.treat.col.aanspraak')}</th>
              <th>{t('pk.instellingen.treat.col.ledger')}</th>
              <th>{t('pk.instellingen.treat.col.intake')}</th>
            </tr>
          </thead>
          <tbody>
            {TREATMENTS.map((x) => {
              const c = codesOf(x);
              const price = priceOf(x.id, x.priceFrom);
              return (
                <tr key={x.id}>
                  <td>
                    <span className="pk-se-treat-name">
                      <i style={{ background: CATEGORY_COLOR[x.category] }} aria-hidden="true" />
                      {text(x.name)}
                    </span>
                  </td>
                  <td>
                    <span className="pk-se-abbr">{c.abbr}</span>
                  </td>
                  <td className="end pk-num">{x.minutes}</td>
                  <td className="end pk-num nowrap">{price === 0 ? t('appt.free') : money(price)}</td>
                  {preview ? <td className="end pk-num nowrap pk-se-next">{price === 0 ? t('appt.free') : money(next(price))}</td> : null}
                  <td className="end pk-num nowrap">{price === 0 ? '–' : money((price / x.minutes) * 60)}</td>
                  <td className="end pk-num">{c.vat}%</td>
                  <td className="pk-mono">{c.prestatie || '–'}</td>
                  <td className="pk-mono">{c.aanspraak || '–'}</td>
                  <td className="pk-mono">{c.ledger}</td>
                  <td>{c.intake ? <Chip tone="good">{t('pk.common.yes')}</Chip> : <span className="pk-muted">–</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <div className="pk-row pk-se-legend">
        {(Object.keys(CATEGORY_COLOR) as (keyof typeof CATEGORY_COLOR)[]).map((cat) => (
          <span key={cat} className="pk-se-treat-name pk-small">
            <i style={{ background: CATEGORY_COLOR[cat] }} aria-hidden="true" />
            {t(`cat.${cat}`)}
          </span>
        ))}
      </div>
    </Card>
  );
}

type ConditionRow = { id: string; label: string | null; key: (typeof CONDITIONS)[number]['label'] | null; diagnosis: string; insured: boolean; active: boolean; count: number };

function Conditions() {
  const { t, text } = useI18n();
  const { demo } = usePraktijk();
  const [rows, setRows] = useShared<ConditionRow[]>('settings.conditions', () =>
    CONDITIONS.map((c) => ({ id: c.id, label: null, key: c.label, diagnosis: c.diagnosis, insured: c.insured, active: true, count: c.treatments.length })),
  );
  const [name, setName] = useState('');
  const treatmentsOf = (id: string) => CONDITIONS.find((c) => c.id === id)?.treatments ?? [];
  return (
    <Card feature="u.conditions" eyebrow={t('pk.instellingen.cond.eyebrow')} title={t('pk.instellingen.cond.title')} help={t('pk.instellingen.cond.help')}>
      <TableWrap label={t('pk.instellingen.cond.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.common.condition')}</th>
              <th>{t('pk.instellingen.cond.diagnosis')}</th>
              <th>{t('pk.instellingen.cond.insured')}</th>
              <th>{t('pk.instellingen.cond.treatments')}</th>
              <th>{t('pk.common.active')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'pk-se-off'}>
                <td>
                  <strong>{r.key ? t(r.key) : r.label}</strong>
                </td>
                <td className="pk-mono">{r.diagnosis || '–'}</td>
                <td>{r.insured ? <Chip tone="good">{t('pk.instellingen.cond.insuredYes')}</Chip> : <Chip tone="outline">{t('pk.instellingen.cond.insuredNo')}</Chip>}</td>
                <td className="pk-small pk-muted">
                  {treatmentsOf(r.id)
                    .map((id) => text(TREATMENTS.find((x) => x.id === id)!.name))
                    .join(', ') || '–'}
                </td>
                <td>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.active}
                    aria-label={`${t('pk.common.active')} · ${r.key ? t(r.key) : r.label}`}
                    className="pk-switch"
                    onClick={() => setRows((list) => list.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))}
                  >
                    <i />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <form
        className="pk-row pk-se-add-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setRows((list) => [...list, { id: `c-${Date.now()}`, label: name.trim(), key: null, diagnosis: '', insured: false, active: true, count: 0 }]);
          demo(t('pk.instellingen.cond.added', { name: name.trim() }));
          setName('');
        }}
      >
        <input className="pk-input pk-se-grow" placeholder={t('pk.instellingen.cond.placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-ghost btn-small" type="submit" disabled={!name.trim()}>
          <PkIcon name="plus" size={14} />
          {t('pk.common.add')}
        </button>
      </form>
      <p className="pk-small pk-muted pk-se-note">{t('pk.instellingen.cond.note')}</p>
    </Card>
  );
}
