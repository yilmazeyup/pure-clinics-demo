import { SPECIALISTS, specialistById, treatmentById, type SpecialistId, type TreatmentId } from '@pure-clinics/shared';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { cityOf, CONDITIONS, conditionById, HMH_STEPS, staffById, type ConditionId, type PracticeClient } from '../../data/core';
import {
  blankEpisode,
  CHECKLISTS,
  makeZt,
  newId,
  planOf,
  PREOP,
  questionsFor,
  TEMPLATES,
  WORKFLOW,
  type ChecklistId,
  type DossierState,
  type DsEpisode,
  type TemplateId,
} from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Avatar, Bar, Card, Check, Chip, Field, Modal, Seg, TableWrap, Toggle, useMoney } from '../../kit';
import type { Update } from './useDossier';
import { useTxt } from './useDossier';
import { CommitInput, fromInput, toInput } from './util';

type Props = { client: PracticeClient; state: DossierState; update: Update };

/** Episodes per condition, following HMH: the list, the chosen episode's details, history, intake, invoices and anamnesis. */
export function EpisodesTab({ client, state, update }: Props) {
  const { t } = useI18n();
  const [dialog, setDialog] = useState<'new' | 'merge' | null>(null);
  const episode = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];
  const change = (patch: Partial<DsEpisode>, line?: Parameters<Update>[1]) =>
    update((s) => ({ ...s, episodes: s.episodes.map((e) => (e.id === episode.id ? { ...e, ...patch } : e)) }), line);

  return (
    <div className="pk-grid">
      <Card
        className="span-4"
        eyebrow={t('pk.dossier.ep.eyebrow')}
        title={t('pk.dossier.ep.title')}
        help={t('pk.dossier.ep.help')}
        feature="e.episodes"
        actions={
          <>
            <button className="btn btn-ghost btn-small" data-feature="v.mergeEpisodes" onClick={() => setDialog('merge')}>
              <PkIcon name="merge" size={15} />
              {t('pk.dossier.ep.merge')}
            </button>
            <button className="btn btn-primary btn-small" onClick={() => setDialog('new')}>
              <PkIcon name="plus" size={15} />
              {t('pk.dossier.ep.new')}
            </button>
          </>
        }
      >
        <ul className="pk-ds-episodes">
          {state.episodes.map((e) => (
            <li key={e.id}>
              <button className="pk-ds-episode" aria-pressed={e.id === episode?.id} onClick={() => update((s) => ({ ...s, selected: e.id }))}>
                <span className="pk-ds-episode-top">
                  <strong>{t(conditionById(e.condition).label)}</strong>
                  <Chip tone={e.closed ? 'outline' : 'good'}>{e.closed ? t('pk.dossier.ep.closed') : t('pk.dossier.ep.open')}</Chip>
                </span>
                <span className="pk-ds-episode-sub">
                  {t('pk.dossier.ep.sessions', { done: e.sessions.done, total: e.sessions.total })} · {t(`pk.dossier.hmh.${e.step}`)}
                </span>
                <Bar value={e.sessions.done} max={e.sessions.total} tone={e.closed ? undefined : 'now'} />
                <span className="pk-ds-episode-foot">
                  <span className="pk-mono">{e.zt}</span>
                  <Chip tone={e.billing === 'insurer' ? 'brand' : 'neutral'}>{t(`pk.billing.${e.billing}`)}</Chip>
                </span>
                {e.code008 ? <Chip tone="warn">{t('pk.dossier.ep.code008', { date: shortDate(e.code008.since) })}</Chip> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {episode ? (
        <div className="span-8 pk-stack">
          <EpisodeDetails client={client} state={state} episode={episode} change={change} update={update} />
          <div className="pk-grid">
            <HistoryCard episode={episode} />
            <LinkedCard client={client} episode={episode} change={change} />
          </div>
          <AnamnesisCard episode={episode} change={change} />
        </div>
      ) : null}

      <CosmeticCard state={state} update={update} />
      <PartnerCard state={state} update={update} />

      <NewEpisodeDialog open={dialog === 'new'} client={client} onClose={() => setDialog(null)} update={update} />
      <MergeEpisodesDialog open={dialog === 'merge'} state={state} onClose={() => setDialog(null)} update={update} />
    </div>
  );
}

const shortDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

function EpisodeDetails({
  client,
  state,
  episode,
  change,
  update,
}: {
  client: PracticeClient;
  state: DossierState;
  episode: DsEpisode;
  change: (patch: Partial<DsEpisode>, line?: Parameters<Update>[1]) => void;
  update: Update;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const { demo } = usePraktijk();
  const money = useMoney();
  const treatment = treatmentById(episode.treatment);
  const first = episode.history[0]?.date ?? null;
  const late = first && episode.start.getTime() > first.getTime() + 43200000;
  const field = (key: 'pk.dossier.ep.billing' | 'pk.dossier.ep.diagnosis' | 'pk.dossier.ep.price' | 'pk.dossier.ep.minutes' | 'pk.dossier.ep.start' | 'pk.dossier.ep.template' | 'pk.dossier.ep.checklist', value: string | { msg: Parameters<typeof t>[0] }) => ({
    key: 'pk.dossier.log.field' as const,
    args: { field: { msg: key }, value },
  });
  const practitioner = staffById(episode.practitioner);

  return (
    <Card
      eyebrow={t('pk.dossier.ep.details')}
      title={`${t(conditionById(episode.condition).label)} · ${i18n.text(treatment.name)}`}
      actions={
        <button
          className="btn btn-ghost btn-small"
          disabled={episode.invoices.length > 0}
          title={episode.invoices.length ? t('pk.dossier.ep.deleteBlocked') : undefined}
          onClick={() => {
            update(
              (s) => {
                const episodes = s.episodes.filter((e) => e.id !== episode.id);
                return { ...s, episodes, selected: episodes[0]?.id ?? '' };
              },
              { key: 'pk.dossier.log.deleted', args: { condition: { msg: conditionById(episode.condition).label } } },
            );
            demo(t('pk.dossier.ep.deleted'));
          }}
        >
          <PkIcon name="trash" size={14} />
          {t('pk.dossier.ep.delete')}
        </button>
      }
    >
      {episode.invoices.length ? <p className="pk-ds-note">{t('pk.dossier.ep.deleteBlocked')}</p> : null}

      <div className="pk-ds-hmh" data-feature="e.episodes">
        <span className="pk-field-label">{t('pk.dossier.hmh.label')}</span>
        <ol>
          {HMH_STEPS.map((step, index) => {
            const at = HMH_STEPS.indexOf(episode.step);
            return (
              <li key={step} className={index < at ? 'done' : index === at ? 'now' : ''}>
                <button onClick={() => change({ step, closed: step === 'afsluiting' }, { key: 'pk.dossier.log.step', args: { value: { msg: `pk.dossier.hmh.${step}` } } })}>
                  <i />
                  <span>{t(`pk.dossier.hmh.${step}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="pk-form pk-ds-details">
        <div className="pk-field pk-field--wide" data-feature="e.billing">
          <span className="pk-field-label">{t('pk.dossier.ep.billing')}</span>
          <div className="pk-row">
            <Seg
              value={episode.billing}
              label={t('pk.dossier.ep.billing')}
              onChange={(billing) => change({ billing }, field('pk.dossier.ep.billing', { msg: `pk.billing.${billing}` }))}
              options={[
                { value: 'client', label: t('pk.billing.client'), icon: 'user' },
                { value: 'insurer', label: t('pk.billing.insurer'), icon: 'shieldCheck' },
              ]}
            />
            <label className="pk-ds-inline">
              <span className="pk-field-label">{t('pk.dossier.ep.diagnosis')}</span>
              <CommitInput className="pk-input pk-mono" value={episode.diagnosis} onCommit={(diagnosis) => change({ diagnosis }, field('pk.dossier.ep.diagnosis', diagnosis))} />
            </label>
          </div>
        </div>

        <div className="pk-field pk-field--wide pk-ds-pair" data-feature="e.ownprice">
          <Field label={t('pk.dossier.ep.price')} hint={t('pk.dossier.ep.priceHint', { price: money(treatment.priceFrom) })}>
            <CommitInput
              className="pk-input pk-num"
              inputMode="decimal"
              value={episode.price === null ? '' : String(episode.price)}
              placeholder={String(treatment.priceFrom)}
              onCommit={(v) => {
                const price = v.trim() === '' ? null : Number(v.replace(',', '.'));
                if (price !== null && Number.isNaN(price)) return;
                change({ price }, field('pk.dossier.ep.price', price === null ? '—' : money(price)));
              }}
            />
          </Field>
          <Field label={t('pk.dossier.ep.minutes')} hint={t('pk.dossier.ep.minutesHint', { n: treatment.minutes })}>
            <CommitInput
              className="pk-input pk-num"
              inputMode="numeric"
              value={episode.minutes === null ? '' : String(episode.minutes)}
              placeholder={String(treatment.minutes)}
              onCommit={(v) => {
                const minutes = v.trim() === '' ? null : Math.round(Number(v));
                if (minutes !== null && Number.isNaN(minutes)) return;
                change({ minutes }, field('pk.dossier.ep.minutes', minutes === null ? '—' : t('pk.common.minutes', { n: minutes })));
              }}
            />
          </Field>
        </div>

        <div className="pk-field pk-field--wide pk-ds-pair" data-feature="e.template">
          <Field label={t('pk.dossier.ep.template')}>
            <select
              className="pk-input"
              value={episode.template}
              onChange={(e) => change({ template: e.target.value as TemplateId }, field('pk.dossier.ep.template', { msg: `pk.dossier.tpl.${e.target.value as TemplateId}` }))}
            >
              {TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {t(`pk.dossier.tpl.${tpl.kind}`)} · {t(`pk.dossier.tpl.${tpl.id}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.dossier.ep.checklist')}>
            <select
              className="pk-input"
              value={episode.checklist}
              onChange={(e) =>
                change({ checklist: e.target.value as ChecklistId }, field('pk.dossier.ep.checklist', { msg: `pk.dossier.chk.list.${e.target.value as ChecklistId}` }))
              }
            >
              {CHECKLISTS.map((c) => (
                <option key={c} value={c}>
                  {t(`pk.dossier.chk.list.${c}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="pk-field pk-field--wide pk-ds-pair">
          <div data-feature="e.start">
            <Field label={t('pk.dossier.ep.start')}>
              <input
                className="pk-input"
                type="date"
                value={toInput(episode.start)}
                aria-invalid={Boolean(late)}
                onChange={(e) => {
                  const start = fromInput(e.target.value);
                  if (start) change({ start }, field('pk.dossier.ep.start', shortDate(start)));
                }}
              />
            </Field>
            <small className={late ? 'pk-ds-bad' : 'pk-ds-good'}>
              <PkIcon name={late ? 'warning' : 'check'} size={13} />
              {late && first ? t('pk.dossier.ep.startWarn', { date: shortDate(first) }) : t('pk.dossier.ep.startOk')}
            </small>
          </div>
          <div data-feature="e.zt">
            <Field label={t('pk.dossier.ep.zt')}>
              <input className="pk-input pk-mono" value={episode.zt} readOnly />
            </Field>
            <small className="pk-muted">
              <PkIcon name="refresh" size={13} /> {t('pk.dossier.ep.ztAuto')}
            </small>
          </div>
        </div>

        <div className="pk-field pk-field--wide pk-ds-practitioner">
          <span className="pk-field-label">{t('pk.dossier.ep.practitioner')}</span>
          <span className="pk-row">
            <Avatar staff={practitioner} size={28} />
            {practitioner.name}
            <span className="pk-muted pk-small">· {t(practitioner.role === 'reception' ? 'role.reception' : `role.${practitioner.role}`)}</span>
            {client.locationId !== practitioner.locationId ? <Chip tone="outline">{cityOf(practitioner.locationId)}</Chip> : null}
            {episode.code008 ? (
              <Chip tone="warn">
                {t('pk.dossier.ep.code008', { date: shortDate(episode.code008.since) })} · {episode.code008.practice}
              </Chip>
            ) : null}
          </span>
        </div>
      </div>
    </Card>
  );
}

function HistoryCard({ episode }: { episode: DsEpisode }) {
  const i18n = useI18n();
  const { t, clock } = i18n;
  const { today } = usePraktijk();
  const money = useMoney();
  return (
    <Card className="span-7" eyebrow={t('pk.dossier.ep.history')} title={t('pk.dossier.ep.history')} feature="e.history">
      <TableWrap label={t('pk.dossier.ep.history')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.common.date')}</th>
              <th>{t('pk.common.treatment')}</th>
              <th>{t('pk.common.employee')}</th>
              <th className="end">{t('pk.common.price')}</th>
            </tr>
          </thead>
          <tbody>
            {[...episode.history].reverse().map((s, i) => (
              <tr key={i}>
                <td className="nowrap pk-num">{i18n.dayMonth(s.date, today)}</td>
                <td>
                  <span className="pk-ds-cell">
                    {i18n.text(treatmentById(s.treatment).name)}
                    {s.note ? <small className="pk-muted">{t(s.note)}</small> : null}
                  </span>
                </td>
                <td className="nowrap">
                  {specialistById(s.specialist).name}
                  {s.agenda ? (
                    <>
                      {' '}
                      <Chip tone="outline">{t('pk.dossier.ep.fromAgenda')}</Chip>
                    </>
                  ) : null}
                </td>
                <td className="end nowrap">{s.price ? money(s.price) : t('pk.dossier.ep.free')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="pk-ds-h">{t('pk.dossier.ep.planned')}</h3>
      {episode.planned.length ? (
        <ul className="pk-list">
          {episode.planned.map((s, i) => (
            <li key={i}>
              <PkIcon name="calendar" size={16} />
              <span className="pk-ds-grow">
                {i18n.weekdayShort(s.date)} {i18n.dayMonth(s.date, today)} · {clock(s.date)} · {i18n.text(treatmentById(s.treatment).name)}
              </span>
              <span className="pk-muted pk-small">{specialistById(s.specialist).name}</span>
              {s.agenda ? <Chip tone="good">{t('pk.dossier.ep.fromAgenda')}</Chip> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pk-muted pk-small">{t('pk.dossier.ep.noPlanned')}</p>
      )}
    </Card>
  );
}

function LinkedCard({ client, episode, change }: { client: PracticeClient; episode: DsEpisode; change: (patch: Partial<DsEpisode>, line?: Parameters<Update>[1]) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now, go, demo } = usePraktijk();
  const money = useMoney();
  const intake = episode.intake;
  return (
    <Card className="span-5" eyebrow={t('pk.dossier.ep.linked')} title={t('pk.dossier.ep.linked')} feature="e.linked">
      <div className="pk-ds-intake-row">
        <PkIcon name="clipboard" size={18} />
        <div className="pk-ds-grow">
          <strong>{t('pk.dossier.ep.intakeForm')}</strong>
          <small className="pk-muted">
            {intake.status === 'filled' && intake.filled
              ? t('pk.dossier.intake.filled', { date: i18n.dayMonth(intake.filled, today) })
              : intake.status === 'sent' && intake.sent
                ? t('pk.dossier.intake.sent', { date: i18n.dayMonth(intake.sent, today) })
                : t('pk.dossier.intake.none')}
          </small>
        </div>
        {intake.status !== 'filled' ? (
          <button
            className="btn btn-ghost btn-small"
            onClick={() => {
              change({ intake: { status: 'sent', sent: new Date(now), filled: null } }, { key: 'pk.dossier.log.intakeSent' });
              demo(t('pk.dossier.in.sentToast', { email: client.email }));
            }}
          >
            {t('pk.dossier.in.sendNow')}
          </button>
        ) : (
          <Chip tone="good" icon="check">
            {t('pk.dossier.intake.short.filled')}
          </Chip>
        )}
      </div>
      <h3 className="pk-ds-h">{t('pk.dossier.ep.invoices')}</h3>
      {episode.invoices.length ? (
        <ul className="pk-list pk-ds-invoices">
          {[...episode.invoices].reverse().map((inv) => (
            <li key={inv.number + inv.date.getTime()}>
              <span className="pk-mono">{inv.number}</span>
              <span className="pk-muted pk-small pk-ds-grow">{i18n.dayMonth(inv.date, today)}</span>
              <span className="pk-num">{money(inv.amount)}</span>
              <Chip tone={inv.paid ? 'good' : 'warn'}>{inv.paid ? t('pk.dossier.ep.paid') : t('pk.dossier.ep.unpaid')}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pk-muted pk-small">{t('pk.dossier.ep.noInvoices')}</p>
      )}
      <button className="btn btn-ghost btn-small pk-ds-mt" onClick={() => go('facturen')}>
        {t('pk.dossier.ep.toBilling')}
        <PkIcon name="arrow" size={14} />
      </button>
    </Card>
  );
}

function AnamnesisCard({ episode, change }: { episode: DsEpisode; change: (patch: Partial<DsEpisode>, line?: Parameters<Update>[1]) => void }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const { today, now } = usePraktijk();
  const txt = useTxt();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [value, setValue] = useState('');
  const questions = questionsFor(episode.condition);
  const max = Math.max(1, ...episode.measures.map((m) => m.value));

  useEffect(() => setEditing(false), [episode.id]);

  return (
    <Card
      eyebrow={t('pk.dossier.anam.title')}
      title={`${t('pk.dossier.anam.title')} · ${t(conditionById(episode.condition).label)}`}
      help={t('pk.dossier.anam.help')}
      feature="e.anamnesis"
      actions={
        editing ? (
          <>
            <button className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary btn-small"
              onClick={() => {
                const anamnesis = { ...episode.anamnesis };
                for (const q of questions) if (draft[q] !== undefined && draft[q] !== txt(anamnesis[q])) anamnesis[q] = { text: draft[q] };
                change({ anamnesis }, { key: 'pk.dossier.log.anamnesis' });
                setEditing(false);
              }}
            >
              {t('pk.common.save')}
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost btn-small"
            onClick={() => {
              setDraft(Object.fromEntries(questions.map((q) => [q, txt(episode.anamnesis[q])])));
              setEditing(true);
            }}
          >
            <PkIcon name="edit" size={14} />
            {t('pk.common.edit')}
          </button>
        )
      }
    >
      <div className="pk-ds-anam">
        <dl className="pk-kv">
          {questions.map((q) => (
            <div key={q}>
              <dt>{t(`pk.dossier.anam.${q}`)}</dt>
              <dd>
                {editing ? (
                  <input className="pk-input" value={draft[q] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [q]: e.target.value }))} />
                ) : (
                  txt(episode.anamnesis[q]) || <span className="pk-muted">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="pk-ds-measures">
          <h3 className="pk-ds-h">
            {t('pk.dossier.measure.title')} · {t(`pk.dossier.measure.${episode.condition}`)}
          </h3>
          {episode.measures.length ? (
            <ul className="pk-ds-measure-list">
              {episode.measures.map((m) => (
                <li key={m.id}>
                  <span className="pk-muted pk-small nowrap">{i18n.dayMonth(m.date, today)}</span>
                  <Bar value={m.value} max={max} tone="brand" />
                  <strong className="pk-num">{num(m.value)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pk-muted pk-small">{t('pk.dossier.measure.none')}</p>
          )}
          <form
            className="pk-row pk-ds-mt"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(value.replace(',', '.'));
              if (!value.trim() || Number.isNaN(v)) return;
              change({ measures: [...episode.measures, { id: newId('m'), date: new Date(now), value: v }] }, { key: 'pk.dossier.log.measure' });
              setValue('');
            }}
          >
            <input
              className="pk-input pk-num pk-ds-measure-input"
              inputMode="decimal"
              value={value}
              aria-label={t('pk.dossier.measure.value')}
              placeholder={t('pk.dossier.measure.value')}
              onChange={(e) => setValue(e.target.value)}
            />
            <button className="btn btn-ghost btn-small" type="submit">
              <PkIcon name="plus" size={14} />
              {t('pk.dossier.measure.add')}
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}

function CosmeticCard({ state, update }: { state: DossierState; update: Update }) {
  const { t } = useI18n();
  const open = PREOP.filter((p) => !state.cosmetic.checks[p]).length;
  const step = state.cosmetic.step;
  return (
    <Card className="span-7" eyebrow={t('pk.dossier.cos.eyebrow')} title={t('pk.dossier.cos.title')} help={t('pk.dossier.cos.help')} feature="e.cosmetic">
      <div className="pk-ds-cos">
        <div>
          <h3 className="pk-ds-h">{t('pk.dossier.cos.checks')}</h3>
          <div className="pk-stack pk-ds-checks">
            {PREOP.map((p) => (
              <Check
                key={p}
                checked={state.cosmetic.checks[p]}
                onChange={(on) => update((s) => ({ ...s, cosmetic: { ...s.cosmetic, checks: { ...s.cosmetic.checks, [p]: on } } }), { key: 'pk.dossier.log.cosmetic' })}
                label={t(`pk.dossier.cos.${p}`)}
              />
            ))}
          </div>
          <p className={`pk-ds-status ${open ? 'bad' : 'good'}`}>
            <PkIcon name={open ? 'warning' : 'shieldCheck'} size={16} />
            {open ? t('pk.dossier.cos.notReady', { n: open }) : t('pk.dossier.cos.ready')}
          </p>
        </div>
        <div>
          <h3 className="pk-ds-h">{t('pk.dossier.cos.workflow')}</h3>
          <ol className="pk-ds-workflow">
            {WORKFLOW.map((w, i) => (
              <li key={w} className={i < step ? 'done' : i === step ? 'now' : ''}>
                <span className="pk-step-n">{i < step ? <PkIcon name="check" size={13} stroke={2.2} /> : i + 1}</span>
                {t(`pk.dossier.cos.step.${w}`)}
              </li>
            ))}
          </ol>
          <div className="pk-row pk-ds-mt">
            <button
              className="btn btn-primary btn-small"
              disabled={step >= WORKFLOW.length || (WORKFLOW[step] === 'treatment' && open > 0)}
              onClick={() => update((s) => ({ ...s, cosmetic: { ...s.cosmetic, step: s.cosmetic.step + 1 } }), { key: 'pk.dossier.log.cosmetic' })}
            >
              {t('pk.dossier.cos.next')}
              <PkIcon name="arrow" size={14} />
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => update((s) => ({ ...s, cosmetic: { ...s.cosmetic, step: 0 } }))}>
              <PkIcon name="refresh" size={14} />
              {t('pk.dossier.cos.restart')}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

const DOCTORS = [
  { name: 'dr. M. Hoekstra', role: 'pk.dossier.partner.cosmetic' as const },
  { name: 'dr. S. Kaya', role: 'pk.dossier.partner.derm' as const },
];

function PartnerCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now } = usePraktijk();
  const p = state.partner;
  return (
    <Card className="span-5" eyebrow={t('pk.dossier.partner.eyebrow')} title={t('pk.dossier.partner.title')} help={t('pk.dossier.partner.help')} feature="e.partner">
      <Toggle
        checked={p.on}
        onChange={(on) =>
          update(
            (s) => ({ ...s, partner: { ...s.partner, on, since: on ? new Date(now) : s.partner.since } }),
            on ? { key: 'pk.dossier.log.partnerOn', args: { doctor: p.doctor } } : { key: 'pk.dossier.log.partnerOff' },
          )
        }
        label={t('pk.dossier.partner.toggle')}
      />
      <Field label={t('pk.dossier.partner.doctor')}>
        <select className="pk-input" value={p.doctor} disabled={!p.on} onChange={(e) => update((s) => ({ ...s, partner: { ...s.partner, doctor: e.target.value } }), { key: 'pk.dossier.log.partnerOn', args: { doctor: e.target.value } })}>
          {DOCTORS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} · {t(d.role)}
            </option>
          ))}
        </select>
      </Field>
      {p.on ? (
        <div className="pk-ds-partner">
          <Chip tone="outline" icon="eye">
            {t('pk.dossier.partner.readonly')}
          </Chip>
          {p.since ? <span className="pk-muted pk-small">{t('pk.dossier.partner.since', { date: i18n.dayMonth(p.since, today) })}</span> : null}
          {p.lastView ? <span className="pk-muted pk-small">{t('pk.dossier.partner.lastView', { date: i18n.dayMonth(p.lastView, today) })}</span> : null}
          <button
            className="btn btn-ghost btn-small"
            onClick={() => update((s) => ({ ...s, partner: { ...s.partner, lastView: new Date(now) } }), { key: 'pk.dossier.log.partnerView', args: { doctor: p.doctor } })}
          >
            <PkIcon name="eye" size={14} />
            {t('pk.dossier.partner.simulate')}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

/** Who can give a condition's usual treatment at the client's location; anyone qualified when nobody there can. */
function practitionersFor(treatment: TreatmentId, client: PracticeClient): SpecialistId[] {
  const category = treatmentById(treatment).category;
  const here = SPECIALISTS.filter((s) => s.categories.includes(category) && s.locationId === client.locationId);
  return (here.length ? here : SPECIALISTS.filter((s) => s.categories.includes(category))).map((s) => s.id);
}

function NewEpisodeDialog({ open, client, onClose, update }: { open: boolean; client: PracticeClient; onClose: () => void; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const [condition, setCondition] = useState<ConditionId>('acne');
  const [treatment, setTreatment] = useState<TreatmentId>('acne');
  const [practitioner, setPractitioner] = useState<SpecialistId>('loubna');
  const [billing, setBilling] = useState<'client' | 'insurer'>('client');
  const [start, setStart] = useState(toInput(today));
  const zt = useMemo(() => makeZt(today), [open]);
  const options = practitionersFor(treatment, client);

  useEffect(() => {
    if (!open) return;
    pickCondition('acne');
    setStart(toInput(today));
  }, [open]);

  const pickCondition = (id: ConditionId) => {
    const c = conditionById(id);
    setCondition(id);
    setTreatment(c.treatments[0]);
    setBilling(c.insured ? 'insurer' : 'client');
    setPractitioner(practitionersFor(c.treatments[0], client)[0]);
  };

  const create = () => {
    const plan = planOf(treatment);
    const episode = blankEpisode({
      id: newId(`${client.id}-${condition}`),
      condition,
      treatment,
      practitioner: options.includes(practitioner) ? practitioner : options[0],
      billing,
      zt,
      start: fromInput(start) ?? today,
      price: null,
      minutes: null,
      sessions: { done: 0, total: plan.sessions },
      step: 'screening',
      closed: false,
    });
    update((s) => ({ ...s, episodes: [episode, ...s.episodes], selected: episode.id }), {
      key: 'pk.dossier.log.episode',
      args: { condition: { msg: conditionById(condition).label }, zt },
    });
    demo(t('pk.dossier.ep.created', { zt }));
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('pk.dossier.ep.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={create}>
            {t('pk.dossier.ep.create')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.dossier.ep.newHelp', { zt })}</p>
      <div className="pk-form pk-ds-modal">
        <Field label={t('pk.common.condition')}>
          <select className="pk-input" value={condition} onChange={(e) => pickCondition(e.target.value as ConditionId)}>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.dossier.ep.treatment')}>
          <select
            className="pk-input"
            value={treatment}
            onChange={(e) => {
              const id = e.target.value as TreatmentId;
              setTreatment(id);
              setPractitioner(practitionersFor(id, client)[0]);
            }}
          >
            {conditionById(condition).treatments.map((id) => (
              <option key={id} value={id}>
                {i18n.text(treatmentById(id).name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.dossier.ep.practitioner')}>
          <select className="pk-input" value={practitioner} onChange={(e) => setPractitioner(e.target.value as SpecialistId)}>
            {options.map((id) => (
              <option key={id} value={id}>
                {specialistById(id).name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.dossier.ep.start')}>
          <input className="pk-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('pk.dossier.ep.billing')} wide>
          <Seg
            value={billing}
            label={t('pk.dossier.ep.billing')}
            onChange={setBilling}
            options={[
              { value: 'client', label: t('pk.billing.client') },
              { value: 'insurer', label: t('pk.billing.insurer') },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

function MergeEpisodesDialog({ open, state, onClose, update }: { open: boolean; state: DossierState; onClose: () => void; update: Update }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [keep, setKeep] = useState('');
  const [into, setInto] = useState('');
  useEffect(() => {
    if (!open) return;
    setKeep(state.episodes[0]?.id ?? '');
    setInto(state.episodes[1]?.id ?? '');
  }, [open]);
  const enough = state.episodes.length >= 2;
  const label = (e: DsEpisode) => `${t(conditionById(e.condition).label)} · ${e.zt}`;

  const merge = () => {
    update(
      (s) => {
        const a = s.episodes.find((e) => e.id === keep);
        const b = s.episodes.find((e) => e.id === into);
        if (!a || !b) return s;
        const merged: DsEpisode = {
          ...a,
          history: [...a.history, ...b.history].sort((x, y) => x.date.getTime() - y.date.getTime()),
          planned: [...a.planned, ...b.planned].sort((x, y) => x.date.getTime() - y.date.getTime()),
          invoices: [...a.invoices, ...b.invoices].sort((x, y) => x.date.getTime() - y.date.getTime()),
          measures: [...a.measures, ...b.measures],
          sessions: { done: a.sessions.done + b.sessions.done, total: Math.max(a.sessions.total, a.sessions.done + b.sessions.done) },
          closed: a.closed && b.closed,
        };
        return { ...s, episodes: s.episodes.filter((e) => e.id !== b.id).map((e) => (e.id === a.id ? merged : e)), selected: a.id };
      },
      { key: 'pk.dossier.log.merged' },
    );
    demo(t('pk.dossier.ep.merged'));
    onClose();
  };

  return (
    <Modal
      open={open}
      title={t('pk.dossier.ep.mergeTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!enough || keep === into} onClick={merge}>
            <PkIcon name="merge" size={16} />
            {t('pk.dossier.ep.mergeDo')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.dossier.ep.mergeHelp')}</p>
      {enough ? (
        <div className="pk-form">
          <Field label={t('pk.dossier.ep.keep')}>
            <select className="pk-input" value={keep} onChange={(e) => setKeep(e.target.value)}>
              {state.episodes.map((e) => (
                <option key={e.id} value={e.id}>
                  {label(e)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.dossier.ep.into')}>
            <select className="pk-input" value={into} onChange={(e) => setInto(e.target.value)}>
              {state.episodes.map((e) => (
                <option key={e.id} value={e.id}>
                  {label(e)}
                </option>
              ))}
            </select>
          </Field>
          {keep === into ? <p className="pk-ds-bad pk-field--wide">{t('pk.dossier.ep.mergeSame')}</p> : null}
        </div>
      ) : (
        <p className="pk-empty">{t('pk.dossier.ep.mergeNeedTwo')}</p>
      )}
    </Modal>
  );
}

