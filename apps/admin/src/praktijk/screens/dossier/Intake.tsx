import { treatmentById, type TreatmentId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { parseDmy } from '../../data/clients';
import { conditionById, dmy, type PracticeClient } from '../../data/core';
import { DTH_QS, HEALTH_QS, ICF_CODES, MRSA_QS, type DossierState, type IcfCode } from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Card, Chip, Field, isolate, Seg, Steps, TableWrap, Toggle } from '../../kit';
import { SignaturePad } from './SignaturePad';
import { useTxt, type Update } from './useDossier';

type Props = { client: PracticeClient; state: DossierState; update: Update };

/** Intake by email and how the client fills it in, the health declaration, MRSA, informed consent, DTH and ICF. */
export function IntakeTab({ client, state, update }: Props) {
  return (
    <div className="pk-grid">
      <IntakeCard client={client} state={state} update={update} />
      <VerifyCard client={client} state={state} update={update} />
      <ConsentCard client={client} state={state} update={update} />
      <HealthCard state={state} update={update} />
      <MrsaCard state={state} update={update} />
      <DthCard state={state} update={update} />
      <IcfCard state={state} update={update} />
    </div>
  );
}

function IntakeCard({ client, state, update }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now, demo } = usePraktijk();
  const send = (id: string) => {
    update((s) => ({ ...s, episodes: s.episodes.map((e) => (e.id === id ? { ...e, intake: { status: 'sent', sent: new Date(now), filled: null } } : e)) }), {
      key: 'pk.dossier.log.intakeSent',
    });
    demo(t('pk.dossier.in.sentToast', { email: client.email }));
  };
  return (
    <Card className="span-6" eyebrow={t('pk.dossier.in.eyebrow')} title={t('pk.dossier.in.title')} help={t('pk.dossier.in.help')} feature="f.intake">
      <Toggle
        checked={state.intakeAuto.on}
        onChange={(on) => update((s) => ({ ...s, intakeAuto: { ...s.intakeAuto, on } }))}
        label={t('pk.dossier.in.auto')}
        hint={t('pk.dossier.in.autoHint', { n: state.intakeAuto.days })}
      />
      <div className="pk-ds-days">
        <Field label={t('pk.dossier.in.days')}>
          <input
            className="pk-input pk-num"
            type="number"
            min={1}
            max={14}
            value={state.intakeAuto.days}
            disabled={!state.intakeAuto.on}
            onChange={(e) => update((s) => ({ ...s, intakeAuto: { ...s.intakeAuto, days: Math.min(14, Math.max(1, Number(e.target.value) || 1)) } }))}
          />
        </Field>
      </div>
      <ul className="pk-list pk-ds-intake-list">
        {state.episodes.map((e) => (
          <li key={e.id}>
            <PkIcon name="clipboard" size={17} />
            <span className="pk-ds-grow pk-ds-cell">
              <strong>{t(conditionById(e.condition).label)}</strong>
              <small className="pk-muted">
                {e.intake.status === 'filled' && e.intake.filled
                  ? t('pk.dossier.intake.filled', { date: i18n.dayMonth(e.intake.filled, today) })
                  : e.intake.status === 'sent' && e.intake.sent
                    ? t('pk.dossier.intake.sent', { date: i18n.dayMonth(e.intake.sent, today) })
                    : t('pk.dossier.intake.none')}
              </small>
            </span>
            <Chip tone={e.intake.status === 'filled' ? 'good' : e.intake.status === 'sent' ? 'warn' : 'outline'}>{t(`pk.dossier.intake.short.${e.intake.status}`)}</Chip>
            <button className="btn btn-ghost btn-small" onClick={() => send(e.id)}>
              <PkIcon name="send" size={14} />
              {e.intake.status === 'none' ? t('pk.dossier.in.sendNow') : t('pk.dossier.in.resend')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function VerifyCard({ client, state, update }: Props) {
  const { t } = useI18n();
  const txt = useTxt();
  const [birth, setBirth] = useState('');
  const main = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];
  const checked = state.verify.checked;
  const current = state.verify.moved ? 3 : checked === 'ok' ? 2 : 0;
  const allergies = state.allergies.length ? state.allergies.map((a) => t(`pk.dossier.allergy.${a}`)).join(', ') : t('pk.dossier.vf.noAllergy');
  const answers = [
    { q: t('pk.dossier.vf.q1'), a: txt(main?.anamnesis.complaint) },
    { q: t('pk.dossier.vf.q2'), a: txt(main?.anamnesis.medication) },
    { q: t('pk.dossier.vf.q3'), a: allergies },
  ];

  const check = () => {
    const date = parseDmy(birth);
    const ok = Boolean(date && date.getTime() === new Date(client.birth.getFullYear(), client.birth.getMonth(), client.birth.getDate()).getTime());
    update((s) => ({ ...s, verify: { ...s.verify, checked: ok ? 'ok' : 'wrong' } }));
  };

  return (
    <Card className="span-6" eyebrow={t('pk.dossier.vf.eyebrow')} title={t('pk.dossier.vf.title')} feature="f.verify">
      <Steps steps={[t('pk.dossier.vf.step1'), t('pk.dossier.vf.step2'), t('pk.dossier.vf.step3')]} current={current} />
      <form
        className="pk-ds-verify"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <Field label={t('pk.dossier.vf.birthLabel')} hint={t('pk.dossier.vf.hint', { date: dmy(client.birth) })}>
          <input className="pk-input pk-num" value={birth} inputMode="numeric" placeholder={t('pk.clienten.cov.birthPlaceholder')} onChange={(e) => setBirth(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-small" type="submit">
          {t('pk.dossier.vf.check')}
        </button>
      </form>
      {checked ? (
        <p className={checked === 'ok' ? 'pk-ds-good' : 'pk-ds-bad'}>
          <PkIcon name={checked === 'ok' ? 'check' : 'lock'} size={14} />
          {checked === 'ok' ? t('pk.dossier.vf.ok') : t('pk.dossier.vf.wrong')}
        </p>
      ) : null}
      <ol className={`pk-ds-questions ${checked === 'ok' ? '' : 'is-locked'}`}>
        {answers.map((x, i) => (
          <li key={i}>
            <span className="pk-ds-q">
              {x.q} <Chip tone="outline">{t('pk.dossier.vf.required')}</Chip>
            </span>
            <span className="pk-ds-a">{checked === 'ok' ? x.a : t('pk.dossier.vf.locked')}</span>
          </li>
        ))}
      </ol>
      <button
        className={`btn btn-small ${state.verify.moved ? 'btn-done' : 'btn-ghost'}`}
        disabled={checked !== 'ok' || state.verify.moved}
        onClick={() =>
          update(
            (s) => ({
              ...s,
              verify: { ...s.verify, moved: true },
              episodes: s.episodes.map((e) =>
                e.id === main?.id ? { ...e, intake: { ...e.intake, status: 'filled', filled: e.intake.filled ?? new Date() } } : e,
              ),
            }),
            { key: 'pk.dossier.log.verify' },
          )
        }
      >
        <PkIcon name={state.verify.moved ? 'check' : 'arrow'} size={14} />
        {state.verify.moved ? t('pk.dossier.vf.moved') : t('pk.dossier.vf.move')}
      </button>
    </Card>
  );
}

function ConsentCard({ client, state, update }: Props) {
  const i18n = useI18n();
  const { t, clock } = i18n;
  const { now } = usePraktijk();
  const options = [...new Set(state.episodes.map((e) => e.treatment))];
  const treatment = state.consent.treatment;
  return (
    <Card className="span-7" eyebrow={t('pk.dossier.ic.eyebrow')} title={t('pk.dossier.ic.title')} feature="f.consent">
      <Field label={t('pk.dossier.ic.treatment')}>
        <select
          className="pk-input"
          value={treatment}
          onChange={(e) => update((s) => ({ ...s, consent: { image: null, at: null, treatment: e.target.value as TreatmentId } }))}
        >
          {(options.length ? options : [treatment]).map((id) => (
            <option key={id} value={id}>
              {i18n.text(treatmentById(id).name)}
            </option>
          ))}
        </select>
      </Field>
      <p className="pk-ds-consent-text">{t('pk.dossier.ic.body', { treatment: { treatment } })}</p>
      {state.consent.image && state.consent.at ? (
        <div className="pk-ds-signed">
          <img src={state.consent.image} alt={t('pk.dossier.ic.pad')} />
          <p className="pk-ds-good">
            <PkIcon name="check" size={14} />
            {t('pk.dossier.ic.signed', {
              name: isolate(`${client.first} ${client.last}`),
              date: { date: state.consent.at },
              time: clock(state.consent.at),
            })}
          </p>
          <button className="btn btn-ghost btn-small" onClick={() => update((s) => ({ ...s, consent: { ...s.consent, image: null, at: null } }))}>
            <PkIcon name="refresh" size={14} />
            {t('pk.dossier.ic.again')}
          </button>
        </div>
      ) : (
        <SignaturePad onSign={(image) => update((s) => ({ ...s, consent: { ...s.consent, image, at: new Date(now) } }), { key: 'pk.dossier.log.consent' })} />
      )}
    </Card>
  );
}

function HealthCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now } = usePraktijk();
  const flagged = HEALTH_QS.filter((q) => state.health.answers[q]).length;
  return (
    <Card
      className="span-5"
      eyebrow={t('pk.dossier.hd.eyebrow')}
      title={t('pk.dossier.hd.title')}
      feature="f.health"
      actions={<Chip tone={flagged ? 'warn' : 'good'}>{flagged ? t('pk.dossier.hd.attention', { n: flagged }) : t('pk.dossier.hd.clear')}</Chip>}
    >
      <div>
        {HEALTH_QS.map((q) => (
          <Toggle
            key={q}
            checked={state.health.answers[q]}
            onChange={(on) => update((s) => ({ ...s, health: { answers: { ...s.health.answers, [q]: on }, signed: null } }))}
            label={t(`pk.dossier.hd.${q}`)}
          />
        ))}
      </div>
      <div className="pk-row pk-row--between pk-ds-mt">
        <span className={state.health.signed ? 'pk-ds-good' : 'pk-muted pk-small'}>
          {state.health.signed ? t('pk.dossier.hd.signed', { date: i18n.dayMonth(state.health.signed, today) }) : t('pk.dossier.hd.unsigned')}
        </span>
        {!state.health.signed ? (
          <button className="btn btn-ghost btn-small" onClick={() => update((s) => ({ ...s, health: { ...s.health, signed: new Date(now) } }), { key: 'pk.dossier.log.health' })}>
            <PkIcon name="pen" size={14} />
            {t('pk.dossier.hd.sign')}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

function MrsaCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now } = usePraktijk();
  const risk = MRSA_QS.some((q) => state.mrsa.answers[q]);
  return (
    <Card className="span-6" eyebrow={t('pk.dossier.mrsa.eyebrow')} title={t('pk.dossier.mrsa.title')} feature="f.mrsa">
      <div>
        {MRSA_QS.map((q) => (
          <Toggle
            key={q}
            checked={state.mrsa.answers[q]}
            onChange={(on) => update((s) => ({ ...s, mrsa: { answers: { ...s.mrsa.answers, [q]: on }, filled: new Date(now) } }), { key: 'pk.dossier.log.mrsa' })}
            label={t(`pk.dossier.mrsa.${q}`)}
          />
        ))}
      </div>
      <p className={`pk-ds-status ${risk ? 'bad' : 'good'}`}>
        <PkIcon name={risk ? 'warning' : 'shieldCheck'} size={16} />
        {risk ? t('pk.dossier.mrsa.risk') : t('pk.dossier.mrsa.none')}
      </p>
      {state.mrsa.filled ? <p className="pk-muted pk-small pk-ds-mt">{t('pk.dossier.mrsa.filled', { date: i18n.dayMonth(state.mrsa.filled, today) })}</p> : null}
    </Card>
  );
}

function DthCard({ state, update }: { state: DossierState; update: Update }) {
  const { t } = useI18n();
  const signal = DTH_QS.some((q) => state.dth.answers[q]);
  return (
    <Card className="span-6" eyebrow={t('pk.dossier.dth.eyebrow')} title={t('pk.dossier.dth.title')} help={t('pk.dossier.dth.help')} feature="f.dth">
      <div>
        {DTH_QS.map((q) => (
          <Toggle
            key={q}
            checked={state.dth.answers[q]}
            onChange={(on) => update((s) => ({ ...s, dth: { ...s.dth, answers: { ...s.dth.answers, [q]: on } } }), { key: 'pk.dossier.log.dth' })}
            label={t(`pk.dossier.dth.${q}`)}
          />
        ))}
      </div>
      <p className={`pk-ds-status ${signal ? 'bad' : 'good'}`}>
        <PkIcon name={signal ? 'warning' : 'check'} size={16} />
        {signal ? t('pk.dossier.dth.refer') : t('pk.dossier.dth.ok')}
      </p>
      <div className="pk-ds-mt">
        <Field label={t('pk.dossier.dth.referral')}>
          <Seg
            value={state.dth.referral}
            label={t('pk.dossier.dth.referral')}
            onChange={(referral) => update((s) => ({ ...s, dth: { ...s.dth, referral } }), { key: 'pk.dossier.log.dth' })}
            options={[
              { value: 'dth', label: t('pk.dossier.dth.direct') },
              { value: 'gp', label: t('pk.dossier.dth.gp') },
            ]}
          />
        </Field>
      </div>
    </Card>
  );
}

function IcfCard({ state, update }: { state: DossierState; update: Update }) {
  const { t } = useI18n();
  const free = ICF_CODES.filter((c) => !state.icf.some((x) => x.code === c));
  const set = (icf: DossierState['icf']) => update((s) => ({ ...s, icf }), { key: 'pk.dossier.log.icf' });
  return (
    <Card
      eyebrow={t('pk.dossier.icf.eyebrow')}
      title={t('pk.dossier.icf.title')}
      help={t('pk.dossier.icf.help')}
      feature="f.icf"
      actions={
        free.length ? (
          <select className="pk-input pk-ds-icf-add" value="" aria-label={t('pk.dossier.icf.add')} onChange={(e) => e.target.value && set([...state.icf, { code: e.target.value as IcfCode, qualifier: 1 }])}>
            <option value="">{t('pk.dossier.icf.add')}</option>
            {free.map((c) => (
              <option key={c} value={c}>
                {c} · {t(`pk.dossier.icf.${c}`)}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <TableWrap label={t('pk.dossier.icf.title')}>
        <table className="pk-table pk-cards">
          <thead>
            <tr>
              <th>{t('pk.dossier.icf.code')}</th>
              <th>{t('pk.dossier.icf.desc')}</th>
              <th>{t('pk.dossier.icf.qualifier')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.icf.map((row) => (
              <tr key={row.code}>
                <td className="pk-mono pk-cell-check">{row.code}</td>
                <td className="pk-cell-main">{t(`pk.dossier.icf.${row.code}`)}</td>
                <td data-label={t('pk.dossier.icf.qualifier')}>
                  <select
                    className="pk-input pk-ds-q-select"
                    value={row.qualifier}
                    aria-label={t('pk.dossier.icf.qualifier')}
                    onChange={(e) => set(state.icf.map((x) => (x.code === row.code ? { ...x, qualifier: Number(e.target.value) } : x)))}
                  >
                    {[0, 1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        {t(`pk.dossier.icf.q${q as 0 | 1 | 2 | 3 | 4}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="end pk-cell-side">
                  <button className="icon-button small" aria-label={t('pk.common.delete')} onClick={() => set(state.icf.filter((x) => x.code !== row.code))}>
                    <PkIcon name="trash" size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
