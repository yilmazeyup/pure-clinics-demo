import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import type { PracticeClient } from '../../data/core';
import { DOC_TYPES, newId, planOf, type Doc, type DocType, type DossierState, type Photo } from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Bar, Card, Chip, Modal, TableWrap } from '../../kit';
import { SkinPhoto } from './SkinPhoto';
import { useTxt, type Update } from './useDossier';
import { capture } from './util';

type Props = { client: PracticeClient; state: DossierState; update: Update };

/** Photos with a before/after comparison, the document library, and the treatment plan with its evaluations. */
export function MediaTab({ state, update }: Props) {
  return (
    <div className="pk-grid">
      <PhotosCard state={state} update={update} />
      <PlanCard state={state} update={update} />
      <DocsCard state={state} update={update} />
    </div>
  );
}

function Picture({ photo, className }: { photo: Photo; className?: string }) {
  return photo.url ? <img className={className} src={photo.url} alt="" draggable={false} /> : <SkinPhoto className={className} seed={photo.seed} condition={photo.condition} stage={photo.stage} />;
}

function PhotosCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now } = usePraktijk();
  const photos = state.photos;
  const [before, setBefore] = useState(() => photos.find((p) => p.stage === 'before')?.id ?? photos[0]?.id ?? '');
  const [after, setAfter] = useState(() => [...photos].reverse().find((p) => p.stage === 'after')?.id ?? photos[photos.length - 1]?.id ?? '');
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const a = photos.find((p) => p.id === before);
  const b = photos.find((p) => p.id === after);

  const slide = (e: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setSplit(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const main = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];
    const added: Photo[] = [...files].map((file) => ({
      id: newId('ph'),
      date: new Date(now),
      area: photos[0]?.area ?? 'cheekL',
      stage: 'after',
      seed: file.name,
      condition: main?.condition ?? 'acne',
      url: URL.createObjectURL(file),
    }));
    update((s) => ({ ...s, photos: [...s.photos, ...added] }), { key: 'pk.dossier.log.photo' });
    setAfter(added[added.length - 1].id);
  };

  return (
    <Card
      className="span-7"
      eyebrow={t('pk.dossier.ph.eyebrow')}
      title={t('pk.dossier.ph.title')}
      help={t('pk.dossier.ph.help')}
      feature="h.photos"
      actions={
        <>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button className="btn btn-ghost btn-small" onClick={() => input.current?.click()}>
            <PkIcon name="upload" size={15} />
            {t('pk.dossier.ph.upload')}
          </button>
        </>
      }
    >
      {a && b ? (
        <div
          ref={box}
          className="pk-ds-compare"
          onPointerDown={(e) => {
            dragging.current = true;
            capture(e);
            slide(e);
          }}
          onPointerMove={(e) => dragging.current && slide(e)}
          onPointerUp={() => (dragging.current = false)}
        >
          <Picture photo={a} className="pk-ds-compare-img" />
          <div className="pk-ds-compare-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
            <Picture photo={b} className="pk-ds-compare-img" />
          </div>
          <span className="pk-ds-compare-line" style={{ left: `${split}%` }}>
            <i>
              <PkIcon name="chevronStart" size={14} />
              <PkIcon name="chevronEnd" size={14} />
            </i>
          </span>
          <span className="pk-ds-compare-tag start">
            {t('pk.dossier.ph.before')} · {i18n.dayMonth(a.date, today)}
          </span>
          <span className="pk-ds-compare-tag end">
            {t('pk.dossier.ph.after')} · {i18n.dayMonth(b.date, today)}
          </span>
        </div>
      ) : null}
      <input
        className="pk-ds-range"
        type="range"
        min={0}
        max={100}
        value={split}
        aria-label={t('pk.dossier.ph.slider')}
        onChange={(e) => setSplit(Number(e.target.value))}
      />
      <ul className="pk-ds-gallery">
        {photos.map((p) => (
          <li key={p.id} className={p.id === before || p.id === after ? 'is-on' : ''}>
            <Picture photo={p} className="pk-ds-thumb" />
            <div className="pk-ds-gallery-text">
              <span className="pk-row">
                <Chip tone={p.stage === 'after' ? 'good' : p.stage === 'before' ? 'brand' : 'neutral'}>{t(`pk.dossier.ph.${p.stage}`)}</Chip>
                {p.url ? <Chip tone="outline">{t('pk.dossier.ph.uploaded')}</Chip> : null}
              </span>
              <small className="pk-muted">
                {i18n.dayMonth(p.date, today)} · {t(`pk.dossier.area.${p.area}`)}
              </small>
              <span className="pk-row">
                <button className="btn btn-ghost btn-small" aria-pressed={p.id === before} onClick={() => setBefore(p.id)}>
                  {t('pk.dossier.ph.setBefore')}
                </button>
                <button className="btn btn-ghost btn-small" aria-pressed={p.id === after} onClick={() => setAfter(p.id)}>
                  {t('pk.dossier.ph.setAfter')}
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="pk-muted pk-small pk-ds-mt">{t('pk.dossier.ph.demo')}</p>
    </Card>
  );
}

function PlanCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, now } = usePraktijk();
  const txt = useTxt();
  const [goal, setGoal] = useState('');
  const [score, setScore] = useState(7);
  const [note, setNote] = useState('');
  const main = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];
  const plan = main ? planOf(main.treatment) : null;
  return (
    <Card className="span-5" eyebrow={t('pk.dossier.plan.eyebrow')} title={t('pk.dossier.plan.title')} feature="h.plan">
      {main && plan ? (
        <p className="pk-ds-plan-line">
          <PkIcon name="calendar" size={16} />
          {t('pk.dossier.plan.sessions', { n: main.sessions.total, weeks: plan.weeks, done: main.sessions.done })}
        </p>
      ) : null}
      <h3 className="pk-ds-h">{t('pk.dossier.plan.goals')}</h3>
      <ul className="pk-list">
        {state.goals.map((g, i) => (
          <li key={i}>
            <PkIcon name="flag" size={15} />
            <span className="pk-ds-grow">{txt(g)}</span>
            <button
              className="icon-button small"
              aria-label={t('pk.common.delete')}
              onClick={() => update((s) => ({ ...s, goals: s.goals.filter((_, j) => j !== i) }), { key: 'pk.dossier.log.plan' })}
            >
              <PkIcon name="close" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="pk-row pk-ds-mt"
        onSubmit={(e) => {
          e.preventDefault();
          if (!goal.trim()) return;
          update((s) => ({ ...s, goals: [...s.goals, { text: goal.trim() }] }), { key: 'pk.dossier.log.plan' });
          setGoal('');
        }}
      >
        <input className="pk-input pk-ds-grow pk-ds-goal" value={goal} placeholder={t('pk.dossier.plan.goalPlaceholder')} onChange={(e) => setGoal(e.target.value)} />
        <button className="btn btn-ghost btn-small" type="submit">
          <PkIcon name="plus" size={14} />
          {t('pk.dossier.plan.addGoal')}
        </button>
      </form>

      <h3 className="pk-ds-h">{t('pk.dossier.plan.evaluations')}</h3>
      <ul className="pk-ds-evals">
        {[...state.evaluations].reverse().map((ev) => (
          <li key={ev.id}>
            <span className="pk-row pk-row--between">
              <span className="pk-muted pk-small">{i18n.dayMonth(ev.date, today)}</span>
              <strong className="pk-num">{ev.score}/10</strong>
            </span>
            <Bar value={ev.score} max={10} tone={ev.score >= 7 ? 'good' : 'brand'} />
            <span className="pk-small">{txt(ev.note)}</span>
          </li>
        ))}
      </ul>
      <form
        className="pk-ds-eval-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!note.trim()) return;
          update((s) => ({ ...s, evaluations: [...s.evaluations, { id: newId('ev'), date: new Date(now), score, note: { text: note.trim() } }] }), {
            key: 'pk.dossier.log.plan',
          });
          setNote('');
        }}
      >
        <label className="pk-ds-score">
          <span className="pk-field-label">{t('pk.dossier.plan.score')}</span>
          <select className="pk-input" value={score} onChange={(e) => setScore(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <input className="pk-input pk-ds-grow" value={note} placeholder={t('pk.dossier.plan.evalPlaceholder')} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-ghost btn-small" type="submit">
          <PkIcon name="plus" size={14} />
          {t('pk.dossier.plan.addEval')}
        </button>
      </form>
    </Card>
  );
}

function DocsCard({ state, update }: { state: DossierState; update: Update }) {
  const i18n = useI18n();
  const { t, num } = i18n;
  const { today, now } = usePraktijk();
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<DocType>('other');
  const [viewing, setViewing] = useState<Doc | null>(null);

  // Uploaded files stay in the browser only; let them go when the file closes.
  useEffect(() => () => state.docs.forEach((d) => d.url && URL.revokeObjectURL(d.url)), []);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const docs: Doc[] = [...files].map((f) => ({ id: newId('doc'), type, date: new Date(now), name: f.name, kb: Math.max(1, Math.round(f.size / 1024)), url: URL.createObjectURL(f) }));
    update((s) => ({ ...s, docs: [...docs, ...s.docs] }), { key: 'pk.dossier.log.doc', args: { name: docs[0].name } });
  };

  return (
    <Card
      eyebrow={t('pk.dossier.doc.eyebrow')}
      title={t('pk.dossier.doc.title')}
      feature="h.docs"
      actions={
        <>
          <select className="pk-input pk-ds-doc-type" value={type} aria-label={t('pk.dossier.doc.type')} onChange={(e) => setType(e.target.value as DocType)}>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`pk.dossier.doc.${d}`)}
              </option>
            ))}
          </select>
          <input ref={input} type="file" hidden multiple onChange={(e) => upload(e.target.files)} />
          <button className="btn btn-ghost btn-small" onClick={() => input.current?.click()}>
            <PkIcon name="upload" size={15} />
            {t('pk.dossier.doc.upload')}
          </button>
        </>
      }
    >
      <TableWrap label={t('pk.dossier.doc.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.dossier.doc.type')}</th>
              <th>{t('pk.dossier.doc.name')}</th>
              <th>{t('pk.common.date')}</th>
              <th className="end">{t('pk.dossier.doc.size')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.docs.map((d) => (
              <tr key={d.id}>
                <td className="nowrap">
                  <span className="pk-ds-doc">
                    <PkIcon name="file" size={15} />
                    {t(`pk.dossier.doc.${d.type}`)}
                  </span>
                </td>
                <td className="pk-mono">{d.name}</td>
                <td className="nowrap">{i18n.dayMonth(d.date, today)}</td>
                <td className="end nowrap">{t('pk.dossier.doc.kb', { n: num(d.kb) })}</td>
                <td className="end">
                  <button className="btn btn-ghost btn-small" onClick={() => setViewing(d)}>
                    <PkIcon name="eye" size={14} />
                    {t('pk.common.view')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <Modal open={Boolean(viewing)} title={viewing ? t(`pk.dossier.doc.${viewing.type}`) : ''} onClose={() => setViewing(null)}>
        {viewing?.url && /\.(png|jpe?g|gif|webp)$/i.test(viewing.name) ? (
          <img className="pk-ds-doc-img" src={viewing.url} alt="" />
        ) : viewing?.url ? (
          <a className="btn btn-ghost" href={viewing.url} target="_blank" rel="noopener">
            <PkIcon name="eye" size={15} />
            {viewing.name}
          </a>
        ) : (
          <div className="pk-ds-doc-preview">
            <PkIcon name="file" size={28} />
            <p>{viewing ? t('pk.dossier.doc.previewText', { name: viewing.name }) : ''}</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
