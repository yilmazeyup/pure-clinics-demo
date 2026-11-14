import { useRef, useState, type PointerEvent } from 'react';

import { useI18n } from '../../../i18n';
import { newId, POINT_COLOURS, type Annotation, type DossierState } from '../../data/dossier';
import type { PracticeClient } from '../../data/core';
import { PkIcon } from '../../icons';
import { Card, Seg } from '../../kit';
import { SkinPhoto } from './SkinPhoto';
import { useTxt, type Update } from './useDossier';
import { capture } from './util';

type Tool = Annotation['kind'];

/** Circles, arrows and words drawn on a photo of the skin; kept with the report. */
export function AnnotateCard({ client, state, update }: { client: PracticeClient; state: DossierState; update: Update }) {
  const { t } = useI18n();
  const txt = useTxt();
  const svg = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('circle');
  const [colour, setColour] = useState(POINT_COLOURS[1]);
  const [label, setLabel] = useState(() => t('pk.dossier.an.defaultText'));
  const [draft, setDraft] = useState<Annotation | null>(null);
  const main = state.episodes.find((e) => e.id === state.selected) ?? state.episodes[0];

  const at = (e: PointerEvent<SVGSVGElement>) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const add = (a: Annotation) => update((s) => ({ ...s, annotations: [...s.annotations, a] }), { key: 'pk.dossier.log.annotate' });

  const down = (e: PointerEvent<SVGSVGElement>) => {
    const p = at(e);
    if (tool === 'text') {
      if (label.trim()) add({ id: newId('an'), kind: 'text', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: colour, text: { text: label.trim() } });
      return;
    }
    capture(e);
    setDraft({ id: newId('an'), kind: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: colour });
  };

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const p = at(e);
    setDraft({ ...draft, x2: p.x, y2: p.y });
  };

  const up = () => {
    if (draft && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6) add(draft);
    setDraft(null);
  };

  const shapes = draft ? [...state.annotations, draft] : state.annotations;
  return (
    <Card
      className="span-6"
      eyebrow={t('pk.dossier.an.eyebrow')}
      title={t('pk.dossier.an.title')}
      help={t('pk.dossier.an.help')}
      feature="g.annotate"
    >
      <div className="pk-ds-an-tools">
        <Seg
          value={tool}
          onChange={setTool}
          label={t('pk.dossier.an.eyebrow')}
          options={[
            { value: 'circle', label: t('pk.dossier.an.circle') },
            { value: 'arrow', label: t('pk.dossier.an.arrow'), icon: 'arrow' },
            { value: 'text', label: t('pk.dossier.an.text') },
          ]}
        />
        <span className="pk-ds-swatches" role="radiogroup" aria-label={t('pk.dossier.cv.colour')}>
          {POINT_COLOURS.slice(0, 6).map((c) => (
            <button key={c} role="radio" aria-checked={c === colour} aria-label={c} style={{ background: c }} onClick={() => setColour(c)} />
          ))}
        </span>
        {tool === 'text' ? <input className="pk-input pk-ds-an-text" value={label} aria-label={t('pk.dossier.an.textLabel')} onChange={(e) => setLabel(e.target.value)} /> : null}
      </div>
      <div className="pk-ds-an">
        <SkinPhoto className="pk-ds-an-photo" seed={`${client.id}-a`} condition={main?.condition ?? 'acne'} stage="before" />
        <svg ref={svg} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label={t('pk.dossier.an.image')} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          <defs>
            {POINT_COLOURS.map((c) => (
              <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {shapes.map((a) =>
            a.kind === 'circle' ? (
              <circle key={a.id} cx={a.x1} cy={a.y1} r={Math.hypot(a.x2 - a.x1, a.y2 - a.y1)} fill="none" stroke={a.color} strokeWidth={3} />
            ) : a.kind === 'arrow' ? (
              <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth={3} markerEnd={`url(#arrow-${a.color.slice(1)})`} />
            ) : (
              <text key={a.id} x={a.x1} y={a.y1} fill={a.color} className="pk-ds-an-label">
                {txt(a.text)}
              </text>
            ),
          )}
        </svg>
      </div>
      <div className="pk-row pk-ds-mt">
        <button
          className="btn btn-ghost btn-small"
          disabled={!state.annotations.length}
          onClick={() => update((s) => ({ ...s, annotations: s.annotations.slice(0, -1) }))}
        >
          <PkIcon name="undo" size={14} />
          {t('pk.dossier.an.undo')}
        </button>
        <button className="btn btn-ghost btn-small" disabled={!state.annotations.length} onClick={() => update((s) => ({ ...s, annotations: [] }))}>
          {t('pk.dossier.an.clear')}
        </button>
      </div>
    </Card>
  );
}
