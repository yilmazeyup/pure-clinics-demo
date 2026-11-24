import { addDays, LASER_ZONES, specialistById, treatmentById, type TreatmentId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { rng } from '../../../data/random';
import { usePraktijk } from '../../context';
import type { PracticeClient } from '../../data/core';
import {
  CHECK_ITEMS,
  COMPLICATION_TYPES,
  lotNumber,
  newId,
  TEMPLATES,
  templateById,
  type ComplicationType,
  type DossierState,
  type Template,
  type TemplateId,
} from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Card, Check, Chip, Field, Modal, Seg, TableWrap } from '../../kit';
import { AnnotateCard } from './Annotate';
import { FaceCanvas } from './FaceCanvas';
import { useTxt, type Update } from './useDossier';
import { CommitInput, fromInput, toInput } from './util';

type Props = { client: PracticeClient; state: DossierState; update: Update };

/** Cosmetic products that come with a lot number in the report. */
const COSMETIC: TreatmentId[] = ['skinbooster', 'pdrn', 'exosomes', 'prx', 'tca'];

/** Templates, the last five reports, checklists, the cosmetic report with lots and the face canvas, images and complications. */
export function ReportsTab({ client, state, update }: Props) {
  return (
    <div className="pk-grid">
      <TemplatesCard state={state} />
      <FlexReports state={state} update={update} />
      <ChecklistCard state={state} update={update} />
      <CosmeticReport state={state} update={update} />
      <div className="span-12">
        <FaceCanvas state={state} update={update} />
      </div>
      <AnnotateCard client={client} state={state} update={update} />
      <Complications state={state} update={update} />
    </div>
  );
}

function TemplatesCard({ state }: { state: DossierState }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Template['kind']>('therapeutic');
  return (
    <Card className="span-5" eyebrow={t('pk.dossier.tpl.eyebrow')} title={t('pk.dossier.tpl.title')} help={t('pk.dossier.tpl.help')} feature="g.templates">
      <Seg
        value={kind}
        onChange={setKind}
        label={t('pk.dossier.tpl.eyebrow')}
        options={[
          { value: 'therapeutic', label: t('pk.dossier.tpl.therapeutic') },
          { value: 'cosmetic', label: t('pk.dossier.tpl.cosmetic') },
        ]}
      />
      <ul className="pk-ds-templates">
        {TEMPLATES.filter((tpl) => tpl.kind === kind).map((tpl) => {
          const used = state.episodes.filter((e) => e.template === tpl.id).length;
          return (
            <li key={tpl.id}>
              <div className="pk-row pk-row--between">
                <strong>{t(`pk.dossier.tpl.${tpl.id}`)}</strong>
                {used ? <Chip tone="brand">{t('pk.dossier.tpl.inUse', { n: used })}</Chip> : null}
              </div>
              <ol className="pk-ds-sections">
                {tpl.sections.map((s) => (
                  <li key={s} className={s === 'pk.dossier.tplsec.checklist' ? 'is-slot' : ''}>
                    {t(s)}
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FlexReports({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t, clock } = i18n;
  const { today, demo } = usePraktijk();
  const txt = useTxt();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, { text: string; template: TemplateId }>>({});
  const all = state.reports.length > 0 && state.reports.every((r) => open.has(r.id));
  const fallback = (state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0])?.template ?? 'ther-general';

  const save = (id: string) => {
    const d = drafts[id];
    if (!d?.text.trim()) return;
    const report = state.reports.find((r) => r.id === id);
    update((s) => ({ ...s, reports: s.reports.map((r) => (r.id === id ? { ...r, text: { text: d.text.trim() }, template: d.template } : r)) }), {
      key: 'pk.dossier.log.report',
      args: { treatment: { treatment: report?.treatment ?? 'consult' } },
    });
    demo(t('pk.dossier.rep.saved'));
  };

  return (
    <Card
      className="span-7"
      eyebrow={t('pk.dossier.rep.eyebrow')}
      title={t('pk.dossier.rep.title')}
      help={t('pk.dossier.rep.help')}
      feature="g.flex"
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => setOpen(all ? new Set() : new Set(state.reports.map((r) => r.id)))}>
          <PkIcon name={all ? 'up' : 'chevronDown'} size={14} />
          {all ? t('pk.dossier.rep.collapseAll') : t('pk.dossier.rep.expandAll')}
        </button>
      }
    >
      <ul className="pk-ds-reports">
        {state.reports.map((r) => {
          const filled = Boolean(r.text);
          const isOpen = open.has(r.id);
          const d = drafts[r.id] ?? { text: '', template: fallback };
          return (
            <li key={r.id} className={filled ? 'is-filled' : 'is-empty'}>
              <button
                className="pk-ds-report-head"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(r.id)) next.delete(r.id);
                    else next.add(r.id);
                    return next;
                  })
                }
              >
                <i className="pk-ds-report-dot" />
                <span className="pk-ds-grow pk-ds-cell">
                  <strong>
                    {i18n.dayMonth(r.date, today)} · {clock(r.date)} · {i18n.text(treatmentById(r.treatment).name)}
                  </strong>
                  <small className="pk-muted">
                    {specialistById(r.specialist).name}
                    {r.template ? ` · ${t('pk.dossier.rep.template', { name: t(`pk.dossier.tpl.${r.template}`) })}` : ''}
                  </small>
                </span>
                <Chip tone={filled ? 'good' : 'outline'}>{filled ? t('pk.dossier.rep.filled') : t('pk.dossier.rep.empty')}</Chip>
                <PkIcon name="chevronDown" size={16} />
              </button>
              {isOpen ? (
                filled ? (
                  <p className="pk-ds-report-text">{txt(r.text)}</p>
                ) : (
                  <div className="pk-ds-report-form">
                    <p className="pk-muted pk-small">{t('pk.dossier.rep.emptyHint')}</p>
                    <Field label={t('pk.dossier.rep.chooseTemplate')}>
                      <select
                        className="pk-input"
                        value={d.template}
                        onChange={(e) => setDrafts((all) => ({ ...all, [r.id]: { ...d, template: e.target.value as TemplateId } }))}
                      >
                        {TEMPLATES.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {t(`pk.dossier.tpl.${tpl.kind}`)} · {t(`pk.dossier.tpl.${tpl.id}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p className="pk-ds-sections-inline">{templateById(d.template).sections.map((s) => t(s)).join(' · ')}</p>
                    <textarea
                      className="pk-input"
                      value={d.text}
                      placeholder={t('pk.dossier.rep.placeholder')}
                      onChange={(e) => setDrafts((all) => ({ ...all, [r.id]: { ...d, text: e.target.value } }))}
                    />
                    <div className="pk-row">
                      <button className="btn btn-primary btn-small" disabled={!d.text.trim()} onClick={() => save(r.id)}>
                        {t('pk.dossier.rep.save')}
                      </button>
                    </div>
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ChecklistCard({ state, update }: { state: DossierState; update: Update }) {
  const { t, text } = useI18n();
  const txt = useTxt();
  const episode = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];
  const list = episode?.checklist ?? 'laser';
  const items = CHECK_ITEMS[list];
  const key = (item: string) => `${episode?.id}:${item}`;
  const done = items.filter((i) => state.checks[key(i)]).length;
  const setRow = (id: string, patch: Partial<DossierState['settings'][number]>) =>
    update((s) => ({ ...s, settings: s.settings.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  return (
    <Card
      className="span-6"
      eyebrow={t('pk.dossier.chk.eyebrow')}
      title={t('pk.dossier.chk.title')}
      help={t('pk.dossier.chk.help')}
      feature="g.checklists"
      actions={<Chip tone={done === items.length && items.length ? 'good' : 'neutral'}>{t('pk.dossier.chk.done', { done, total: items.length })}</Chip>}
    >
      <p className="pk-muted pk-small">
        {t('pk.dossier.ep.checklist')}: <strong>{t(`pk.dossier.chk.list.${list}`)}</strong>
      </p>
      <div className="pk-stack pk-ds-checks pk-ds-mt">
        {items.map((item) => (
          <Check
            key={item}
            checked={Boolean(state.checks[key(item)])}
            onChange={(on) => update((s) => ({ ...s, checks: { ...s.checks, [key(item)]: on } }), { key: 'pk.dossier.log.checklist' })}
            label={t(item)}
          />
        ))}
      </div>
      <Field label={t('pk.dossier.chk.question')}>
        <CommitInput className="pk-input" value={txt(state.checkAnswer)} onCommit={(v) => update((s) => ({ ...s, checkAnswer: { text: v } }), { key: 'pk.dossier.log.checklist' })} />
      </Field>
      <h3 className="pk-ds-h">{t('pk.dossier.chk.table')}</h3>
      <TableWrap label={t('pk.dossier.chk.table')}>
        <table className="pk-table pk-ds-settings pk-cards">
          <thead>
            <tr>
              <th>{t('pk.dossier.chk.zone')}</th>
              <th>{t('pk.dossier.chk.energy')}</th>
              <th>{t('pk.dossier.chk.pulse')}</th>
              <th>{t('pk.dossier.chk.spot')}</th>
            </tr>
          </thead>
          <tbody>
            {state.settings.map((row) => (
              <tr key={row.id}>
                <td className="pk-cell-full">
                  <select className="pk-input" value={row.zone} onChange={(e) => setRow(row.id, { zone: e.target.value })}>
                    {LASER_ZONES.map((z) => (
                      <option key={z.id} value={z.id}>
                        {text(z.name)}
                      </option>
                    ))}
                  </select>
                </td>
                {(['energy', 'pulse', 'spot'] as const).map((f) => (
                  <td key={f} data-label={t(`pk.dossier.chk.${f}`)}>
                    <input className="pk-input pk-num pk-ds-narrow" inputMode="decimal" value={row[f]} onChange={(e) => setRow(row.id, { [f]: e.target.value })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <button
        className="btn btn-ghost btn-small pk-ds-mt"
        onClick={() => update((s) => ({ ...s, settings: [...s.settings, { id: newId('set'), zone: LASER_ZONES[0].id, energy: '', pulse: '', spot: '' }] }))}
      >
        <PkIcon name="plus" size={14} />
        {t('pk.dossier.chk.addRow')}
      </button>
    </Card>
  );
}

function CosmeticReport({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today } = usePraktijk();
  const name = (id: TreatmentId) => i18n.text(treatmentById(id).name);
  return (
    <Card className="span-6" eyebrow={t('pk.dossier.cosrep.eyebrow')} title={t('pk.dossier.cosrep.title')} help={t('pk.dossier.cosrep.help')}>
      <div data-feature="g.lots">
        <h3 className="pk-ds-h">{t('pk.dossier.lot.title')}</h3>
        <TableWrap label={t('pk.dossier.lot.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.dossier.lot.product')}</th>
                <th>{t('pk.dossier.lot.number')}</th>
                <th>{t('pk.dossier.lot.expiry')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.lots.map((lot) => {
                const expired = lot.expiry.getTime() < today.getTime();
                return (
                  <tr key={lot.id}>
                    <td className="pk-cell-main">
                      <select
                        className="pk-input"
                        value={lot.product}
                        onChange={(e) => update((s) => ({ ...s, lots: s.lots.map((l) => (l.id === lot.id ? { ...l, product: e.target.value as TreatmentId } : l)) }))}
                      >
                        {COSMETIC.map((id) => (
                          <option key={id} value={id}>
                            {name(id)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label={t('pk.dossier.lot.number')}>
                      <CommitInput
                        className="pk-input pk-mono pk-ds-lot"
                        value={lot.number}
                        onCommit={(number) => update((s) => ({ ...s, lots: s.lots.map((l) => (l.id === lot.id ? { ...l, number } : l)) }))}
                      />
                    </td>
                    <td data-label={t('pk.dossier.lot.expiry')}>
                      <input
                        className="pk-input"
                        type="date"
                        value={toInput(lot.expiry)}
                        aria-invalid={expired}
                        onChange={(e) => {
                          const expiry = fromInput(e.target.value);
                          if (expiry) update((s) => ({ ...s, lots: s.lots.map((l) => (l.id === lot.id ? { ...l, expiry } : l)) }));
                        }}
                      />
                    </td>
                    <td className="pk-cell-side">
                      <Chip tone={expired ? 'bad' : 'good'}>{expired ? t('pk.dossier.lot.expired') : t('pk.dossier.lot.valid')}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <button
          className="btn btn-ghost btn-small pk-ds-mt"
          onClick={() =>
            update(
              (s) => ({
                ...s,
                lots: [...s.lots, { id: newId('lot'), product: 'skinbooster', number: lotNumber(rng(`lot-${Date.now()}`), 'skinbooster'), expiry: addDays(today, 365) }],
              }),
              { key: 'pk.dossier.log.lot' },
            )
          }
        >
          {t('pk.dossier.lot.add')}
        </button>
      </div>

      <div data-feature="g.injectables">
        <h3 className="pk-ds-h">{t('pk.dossier.inj.title')}</h3>
        <TableWrap label={t('pk.dossier.inj.title')}>
          <table className="pk-table pk-cards">
            <thead>
              <tr>
                <th>{t('pk.dossier.lot.product')}</th>
                <th>{t('pk.dossier.inj.batch')}</th>
                <th>{t('pk.dossier.inj.dose')}</th>
                <th>{t('pk.dossier.inj.needle')}</th>
              </tr>
            </thead>
            <tbody>
              {state.injectables.map((row) => {
                const set = (patch: Partial<typeof row>) => update((s) => ({ ...s, injectables: s.injectables.map((x) => (x.id === row.id ? { ...x, ...patch } : x)) }));
                return (
                  <tr key={row.id}>
                    <td className="nowrap pk-cell-full">{name(row.product)}</td>
                    <td data-label={t('pk.dossier.inj.batch')}>
                      <CommitInput className="pk-input pk-mono pk-ds-lot" value={row.batch} onCommit={(batch) => set({ batch })} />
                    </td>
                    <td data-label={t('pk.dossier.inj.dose')}>
                      <CommitInput className="pk-input pk-num pk-ds-narrow" value={row.dose} onCommit={(dose) => set({ dose })} />
                    </td>
                    <td data-label={t('pk.dossier.inj.needle')}>
                      <CommitInput className="pk-input pk-ds-needle" value={row.needle} onCommit={(needle) => set({ needle })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <button
          className="btn btn-ghost btn-small pk-ds-mt"
          onClick={() =>
            update((s) => ({ ...s, injectables: [...s.injectables, { id: newId('inj'), product: 'skinbooster', batch: s.lots[0]?.number ?? '', dose: '1 ml', needle: '30G · 13 mm' }] }))
          }
        >
          <PkIcon name="plus" size={14} />
          {t('pk.dossier.inj.add')}
        </button>
      </div>
    </Card>
  );
}

function Complications({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now, demo } = usePraktijk();
  const txt = useTxt();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ComplicationType>('redness');
  const [severity, setSeverity] = useState<'1' | '2' | '3'>('1');
  const [action, setAction] = useState('');
  const [follow, setFollow] = useState(toInput(addDays(today, 14)));

  return (
    <Card
      className="span-6"
      eyebrow={t('pk.dossier.cx.eyebrow')}
      title={t('pk.dossier.cx.title')}
      help={t('pk.dossier.cx.help')}
      feature="g.complications"
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => setOpen(true)}>
          <PkIcon name="plus" size={14} />
          {t('pk.dossier.cx.add')}
        </button>
      }
    >
      {state.complications.length ? (
        <ul className="pk-ds-cx">
          {state.complications.map((c) => (
            <li key={c.id}>
              <div className="pk-row pk-row--between">
                <strong>{t(`pk.dossier.cx.${c.type}`)}</strong>
                <span className="pk-row">
                  <Chip tone={c.severity === 3 ? 'bad' : c.severity === 2 ? 'warn' : 'neutral'}>{t(`pk.dossier.cx.sev${c.severity}`)}</Chip>
                  <Chip tone={c.resolved ? 'good' : 'warn'}>{c.resolved ? t('pk.dossier.cx.resolved') : t('pk.dossier.cx.open')}</Chip>
                </span>
              </div>
              <span className="pk-muted pk-small">
                {i18n.dayMonth(c.date, today)}
                {c.follow ? ` · ${t('pk.dossier.cx.followOn', { date: i18n.dayMonth(c.follow, today) })}` : ''}
              </span>
              <p className="pk-small">{txt(c.action)}</p>
              {!c.resolved ? (
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => update((s) => ({ ...s, complications: s.complications.map((x) => (x.id === c.id ? { ...x, resolved: true } : x)) }))}
                >
                  <PkIcon name="check" size={14} />
                  {t('pk.dossier.cx.markResolved')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pk-empty">{t('pk.dossier.cx.none')}</p>
      )}

      <Modal
        open={open}
        title={t('pk.dossier.cx.add')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                update(
                  (s) => ({
                    ...s,
                    complications: [
                      {
                        id: newId('cx'),
                        date: new Date(now),
                        type,
                        severity: Number(severity) as 1 | 2 | 3,
                        action: { text: action.trim() || t('pk.dossier.cx.seedAction') },
                        follow: fromInput(follow),
                        resolved: false,
                      },
                      ...s.complications,
                    ],
                  }),
                  { key: 'pk.dossier.log.complication', args: { type: { msg: `pk.dossier.cx.${type}` } } },
                );
                demo(t('pk.dossier.cx.reported'));
                setAction('');
                setOpen(false);
              }}
            >
              {t('pk.common.save')}
            </button>
          </>
        }
      >
        <div className="pk-form">
          <Field label={t('pk.dossier.cx.type')}>
            <select className="pk-input" value={type} onChange={(e) => setType(e.target.value as ComplicationType)}>
              {COMPLICATION_TYPES.map((c) => (
                <option key={c} value={c}>
                  {t(`pk.dossier.cx.${c}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.dossier.cx.severity')}>
            <Seg
              value={severity}
              onChange={setSeverity}
              label={t('pk.dossier.cx.severity')}
              options={[
                { value: '1', label: t('pk.dossier.cx.sev1') },
                { value: '2', label: t('pk.dossier.cx.sev2') },
                { value: '3', label: t('pk.dossier.cx.sev3') },
              ]}
            />
          </Field>
          <Field label={t('pk.dossier.cx.action')} wide>
            <textarea className="pk-input" value={action} placeholder={t('pk.dossier.cx.actionPlaceholder')} onChange={(e) => setAction(e.target.value)} />
          </Field>
          <Field label={t('pk.dossier.cx.follow')}>
            <input className="pk-input" type="date" value={follow} onChange={(e) => setFollow(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}
