import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { useI18n } from '../../../i18n';
import {
  DEPTHS,
  newId,
  POINT_COLOURS,
  ZONES,
  zoneColor,
  type Depth,
  type DossierState,
  type FacePoint,
  type PointSize,
  type Unit,
  type ZoneId,
} from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Card, Modal, Seg, TableWrap, useDecimal } from '../../kit';
import type { Update } from './useDossier';
import { capture } from './util';

// The face canvas of a cosmetic report: injection points per treatment zone, as in SkinAdmin's flexible reports.
// Points live in face coordinates (a 400 × 480 drawing), so the face never mirrors and points stay put in Arabic.

const W = 400;
const H = 480;
const RADIUS: Record<PointSize, number> = { S: 5, M: 7.5, L: 10.5 };

/** Where each zone sits on the drawing, to light it up when it is chosen. */
const AREAS: Record<ZoneId, [number, number, number, number][]> = {
  forehead: [[200, 140, 72, 30]],
  glabella: [[200, 186, 15, 12]],
  crowsfeet: [
    [127, 204, 12, 19],
    [273, 204, 12, 19],
  ],
  cheeks: [
    [150, 278, 32, 36],
    [250, 278, 32, 36],
  ],
  nasolabial: [
    [176, 300, 11, 24],
    [224, 300, 11, 24],
  ],
  lips: [[200, 321, 34, 15]],
  chin: [[200, 384, 26, 18]],
  jaw: [
    [146, 356, 17, 34],
    [254, 356, 17, 34],
  ],
};

type Pending = { x: number; y: number; unit: Unit | ''; amount: string; depth: Depth | ''; note: string };
type Drag = { ids: string[]; x: number; y: number; origin: Map<string, { x: number; y: number }>; moved: boolean; id: string; wasSelected: boolean };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function FaceCanvas({ state, update }: { state: DossierState; update: Update }) {
  const { t } = useI18n();
  const dec = useDecimal();
  const svg = useRef<SVGSVGElement>(null);
  const [zone, setZone] = useState<ZoneId>('cheeks');
  const [size, setSize] = useState<PointSize>('M');
  const [unit, setUnit] = useState<Unit>('ml');
  const [colour, setColour] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [table, setTable] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState<Map<string, { x: number; y: number }> | null>(null);
  const drag = useRef<Drag | null>(null);

  const points = state.points;
  const shown = (p: FacePoint) => draft?.get(p.id) ?? p;
  const colourNow = colour ?? zoneColor(zone);

  const toFace = (e: { clientX: number; clientY: number }) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: clamp(p.x, 8, W - 8), y: clamp(p.y, 8, H - 8) };
  };

  const setPoints = (next: FacePoint[], log = true) =>
    update((s) => ({ ...s, points: next }), log ? { key: 'pk.dossier.log.points', args: { n: next.length } } : undefined);

  const down = (e: PointerEvent<SVGSVGElement>) => {
    const p = toFace(e);
    const hit = (e.target as Element).closest('[data-point]')?.getAttribute('data-point');
    if (hit) {
      e.preventDefault();
      capture(e);
      const wasSelected = selected.has(hit);
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      const next = wasSelected ? new Set(selected) : multi ? new Set([...selected, hit]) : new Set([hit]);
      setSelected(next);
      const ids = [...next];
      drag.current = {
        ids,
        x: p.x,
        y: p.y,
        origin: new Map(points.filter((pt) => next.has(pt.id)).map((pt) => [pt.id, { x: pt.x, y: pt.y }])),
        moved: false,
        id: hit,
        wasSelected,
      };
      return;
    }
    // A click on the face: a new point waits for its unit, amount and depth.
    setSelected(new Set());
    setPending((old) => ({ x: p.x, y: p.y, unit: old?.unit ?? unit, amount: old?.amount ?? '', depth: old?.depth ?? '', note: old?.note ?? '' }));
  };

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toFace(e);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 2.5) return;
    d.moved = true;
    const next = new Map<string, { x: number; y: number }>();
    for (const [id, o] of d.origin) next.set(id, { x: clamp(o.x + dx, 8, W - 8), y: clamp(o.y + dy, 8, H - 8) });
    setDraft(next);
  };

  const up = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && draft) {
      setPoints(points.map((pt) => ({ ...pt, ...(draft.get(pt.id) ?? {}) })));
    } else if (d.wasSelected) {
      // A click on a chosen point lets go of it again.
      const next = new Set(selected);
      if (e.shiftKey || e.metaKey || e.ctrlKey || next.size === 1) next.delete(d.id);
      else {
        next.clear();
        next.add(d.id);
      }
      setSelected(next);
    }
    setDraft(null);
  };

  const keyOnPoint = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      removeSelected();
    }
  };

  const savePending = () => {
    if (!pending || !pending.unit) return;
    const amount = pending.amount.trim() ? Number(pending.amount.replace(',', '.')) : null;
    const point: FacePoint = {
      id: newId('pt'),
      x: pending.x,
      y: pending.y,
      zone,
      color: colourNow,
      size,
      unit: pending.unit,
      amount: amount !== null && !Number.isNaN(amount) ? amount : null,
      depth: pending.depth || null,
      note: pending.note.trim(),
    };
    setPoints([...points, point]);
    setPending(null);
  };

  const removeSelected = () => {
    if (!selected.size) return;
    setPoints(points.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
  };

  const edit = (id: string, patch: Partial<FacePoint>) => setPoints(points.map((p) => (p.id === id ? { ...p, ...patch } : p)), false);

  const totals = useMemo(() => {
    return ZONES.map((z) => {
      const list = points.filter((p) => p.zone === z.id);
      const sum = (u: Unit) => list.filter((p) => p.unit === u).reduce((s, p) => s + (p.amount ?? 0), 0);
      return { zone: z.id, count: list.length, colours: [...new Set(list.map((p) => p.color))], ml: sum('ml'), e: sum('E') };
    }).filter((x) => x.count > 0);
  }, [points]);
  const allMl = totals.reduce((s, x) => s + x.ml, 0);
  const allE = totals.reduce((s, x) => s + x.e, 0);
  const amounts = (ml: number, e: number) => [ml ? `${dec(ml)} ml` : '', e ? `${dec(e)} ${t('pk.dossier.cv.unitShort')}` : ''].filter(Boolean).join(' · ');

  return (
    <Card
      eyebrow={t('pk.dossier.cv.eyebrow')}
      title={t('pk.dossier.cv.title')}
      help={t('pk.dossier.cv.help')}
      feature="g.canvas"
      actions={
        <button className={`btn btn-small ${table ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={table} onClick={() => setTable(!table)}>
          <PkIcon name="list" size={15} />
          {t('pk.dossier.cv.table')}
        </button>
      }
    >
      <div className="pk-ds-canvas">
        <div className="pk-ds-face">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={t('pk.dossier.cv.face')}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => {
              drag.current = null;
              setDraft(null);
            }}
          >
            <rect width={W} height={H} rx="18" className="pk-ds-face-bg" />
            <FaceDrawing />
            {AREAS[zone].map(([cx, cy, rx, ry], i) => (
              <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} className="pk-ds-zone" style={{ fill: colourNow, stroke: colourNow }} />
            ))}
            {points.map((p, i) => {
              const at = shown(p);
              const r = RADIUS[p.size];
              const isOn = selected.has(p.id);
              return (
                <g
                  key={p.id}
                  data-point={p.id}
                  className={`pk-ds-point ${isOn ? 'is-on' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isOn}
                  aria-label={t('pk.dossier.cv.pointLabel', { n: i + 1, zone: t(`pk.dossier.zone.${p.zone}`) })}
                  onKeyDown={(e) => keyOnPoint(e, p.id)}
                >
                  {isOn ? <circle cx={at.x} cy={at.y} r={r + 3.5} className="pk-ds-point-ring" /> : null}
                  <circle cx={at.x} cy={at.y} r={r} fill={p.color} className="pk-ds-point-dot" />
                  <text x={at.x + r + 2.5} y={at.y - r + 1} className="pk-ds-point-n">
                    {i + 1}
                  </text>
                </g>
              );
            })}
            {pending ? (
              <g className="pk-ds-pending" pointerEvents="none">
                <circle cx={pending.x} cy={pending.y} r={RADIUS[size] + 4} />
                <circle cx={pending.x} cy={pending.y} r={RADIUS[size]} style={{ fill: colourNow }} />
              </g>
            ) : null}
          </svg>
        </div>

        <div className="pk-ds-tools">
          <div className="pk-field">
            <span className="pk-field-label">{t('pk.dossier.cv.zone')}</span>
            <div className="pk-ds-zones">
              {ZONES.map((z) => (
                <button
                  key={z.id}
                  aria-pressed={z.id === zone}
                  onClick={() => {
                    setZone(z.id);
                    setColour(null);
                  }}
                >
                  <i style={{ background: z.color }} />
                  {t(`pk.dossier.zone.${z.id}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="pk-row">
            <div className="pk-field">
              <span className="pk-field-label">{t('pk.dossier.cv.size')}</span>
              <Seg value={size} onChange={setSize} label={t('pk.dossier.cv.size')} options={(['S', 'M', 'L'] as const).map((s) => ({ value: s, label: s }))} />
            </div>
            <div className="pk-field">
              <span className="pk-field-label">{t('pk.dossier.cv.unit')}</span>
              <Seg
                value={unit}
                onChange={(u) => {
                  setUnit(u);
                  setPending((p) => (p ? { ...p, unit: u } : p));
                }}
                label={t('pk.dossier.cv.unit')}
                options={[
                  { value: 'ml', label: t('pk.dossier.cv.unitMl') },
                  { value: 'E', label: t('pk.dossier.cv.unitE') },
                ]}
              />
            </div>
          </div>
          <div className="pk-field">
            <span className="pk-field-label">{t('pk.dossier.cv.colour')}</span>
            <div className="pk-ds-swatches" role="radiogroup" aria-label={t('pk.dossier.cv.colour')}>
              {POINT_COLOURS.map((c) => (
                <button key={c} role="radio" aria-checked={c === colourNow} aria-label={c} style={{ background: c }} onClick={() => setColour(c)} />
              ))}
            </div>
          </div>

          {pending ? (
            <form
              className="pk-ds-pending-form"
              onSubmit={(e) => {
                e.preventDefault();
                savePending();
              }}
            >
              <strong>
                <i style={{ background: colourNow }} />
                {t('pk.dossier.cv.newPoint', { n: points.length + 1 })} · {t(`pk.dossier.zone.${zone}`)}
              </strong>
              <div className="pk-form">
                <label className="pk-field">
                  <span className="pk-field-label">{t('pk.dossier.cv.unit')} *</span>
                  <select className="pk-input" value={pending.unit} aria-invalid={!pending.unit} onChange={(e) => setPending({ ...pending, unit: e.target.value as Unit | '' })}>
                    <option value="">{t('pk.dossier.cv.choose')}</option>
                    <option value="ml">{t('pk.dossier.cv.unitMl')}</option>
                    <option value="E">{t('pk.dossier.cv.unitE')}</option>
                  </select>
                </label>
                <label className="pk-field">
                  <span className="pk-field-label">
                    {t('pk.dossier.cv.amount')} <small>({t('pk.dossier.cv.optional')})</small>
                  </span>
                  <input className="pk-input pk-num" inputMode="decimal" value={pending.amount} onChange={(e) => setPending({ ...pending, amount: e.target.value })} />
                </label>
                <label className="pk-field">
                  <span className="pk-field-label">
                    {t('pk.dossier.cv.depth')} <small>({t('pk.dossier.cv.optional')})</small>
                  </span>
                  <select className="pk-input" value={pending.depth} onChange={(e) => setPending({ ...pending, depth: e.target.value as Depth | '' })}>
                    <option value="">—</option>
                    {DEPTHS.map((d) => (
                      <option key={d} value={d}>
                        {t(`pk.dossier.depth.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pk-field">
                  <span className="pk-field-label">
                    {t('pk.dossier.cv.note')} <small>({t('pk.dossier.cv.optional')})</small>
                  </span>
                  <input className="pk-input" value={pending.note} onChange={(e) => setPending({ ...pending, note: e.target.value })} />
                </label>
              </div>
              {!pending.unit ? <small className="pk-ds-bad">{t('pk.dossier.cv.unitRequired')}</small> : null}
              <div className="pk-row">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setPending(null)}>
                  {t('pk.common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary btn-small" disabled={!pending.unit}>
                  {t('pk.common.save')}
                </button>
              </div>
            </form>
          ) : null}

          <div className="pk-ds-selbar">
            <span className="pk-muted pk-small">{t('pk.dossier.cv.selected', { n: selected.size })}</span>
            <button className="btn btn-ghost btn-small" disabled={!selected.size} onClick={removeSelected}>
              <PkIcon name="trash" size={14} />
              {t('pk.dossier.cv.delete', { n: selected.size })}
            </button>
            <button className="btn btn-ghost btn-small" disabled={!points.length} onClick={() => setConfirm(true)}>
              {t('pk.dossier.cv.clear')}
            </button>
          </div>

          <div className="pk-ds-totals">
            <span className="pk-field-label">{t('pk.dossier.cv.totals')}</span>
            {totals.length ? (
              <ul>
                {totals.map((x) => {
                  const ids = points.filter((p) => p.zone === x.zone).map((p) => p.id);
                  const on = ids.every((id) => selected.has(id));
                  return (
                    <li key={x.zone}>
                      <button aria-pressed={on} onClick={() => setSelected(new Set(ids))}>
                        <span className="pk-ds-dots">
                          {x.colours.map((c) => (
                            <i key={c} style={{ background: c }} />
                          ))}
                        </span>
                        <span className="pk-ds-grow">{t(`pk.dossier.zone.${x.zone}`)}</span>
                        <span className="pk-num">{x.count}×</span>
                        <span className="pk-num pk-muted pk-ds-ltr">{amounts(x.ml, x.e)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="pk-muted pk-small">{t('pk.dossier.cv.none')}</p>
            )}
            <p className="pk-ds-total">
              <strong>{t('pk.dossier.cv.total', { n: points.length })}</strong>
              <span className="pk-num pk-ds-ltr">{amounts(allMl, allE)}</span>
            </p>
            <small className="pk-muted">{t('pk.dossier.cv.selectHint')}</small>
          </div>
        </div>
      </div>

      {table ? (
        <TableWrap label={t('pk.dossier.cv.table')}>
          <table className="pk-table pk-ds-points-table">
            <thead>
              <tr>
                <th>{t('pk.dossier.cv.order')}</th>
                <th>{t('pk.dossier.cv.zone')}</th>
                <th>{t('pk.dossier.cv.unit')}</th>
                <th>{t('pk.dossier.cv.amount')}</th>
                <th>{t('pk.dossier.cv.depth')}</th>
                <th>{t('pk.dossier.cv.note')}</th>
                <th>{t('pk.dossier.cv.colour')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.id} aria-selected={selected.has(p.id)} onClick={() => setSelected(new Set([p.id]))}>
                  <td className="pk-num">{i + 1}</td>
                  <td>
                    <select className="pk-input" value={p.zone} onChange={(e) => edit(p.id, { zone: e.target.value as ZoneId })}>
                      {ZONES.map((z) => (
                        <option key={z.id} value={z.id}>
                          {t(`pk.dossier.zone.${z.id}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="pk-input" value={p.unit} onChange={(e) => edit(p.id, { unit: e.target.value as Unit })}>
                      <option value="ml">{t('pk.dossier.cv.unitMl')}</option>
                      <option value="E">{t('pk.dossier.cv.unitE')}</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="pk-input pk-num pk-ds-narrow"
                      inputMode="decimal"
                      value={p.amount ?? ''}
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(',', '.'));
                        edit(p.id, { amount: e.target.value.trim() === '' || Number.isNaN(v) ? null : v });
                      }}
                    />
                  </td>
                  <td>
                    <select className="pk-input" value={p.depth ?? ''} onChange={(e) => edit(p.id, { depth: (e.target.value || null) as Depth | null })}>
                      <option value="">—</option>
                      {DEPTHS.map((d) => (
                        <option key={d} value={d}>
                          {t(`pk.dossier.depth.${d}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="pk-input" value={p.note} onChange={(e) => edit(p.id, { note: e.target.value })} />
                  </td>
                  <td>
                    <span className="pk-ds-swatches pk-ds-swatches--small">
                      {POINT_COLOURS.slice(0, 8).map((c) => (
                        <button
                          key={c}
                          aria-label={c}
                          aria-pressed={p.color === c}
                          style={{ background: c }}
                          onClick={(e) => {
                            e.stopPropagation();
                            edit(p.id, { color: c });
                          }}
                        />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : null}

      <Modal
        open={confirm}
        title={t('pk.dossier.cv.clearTitle')}
        onClose={() => setConfirm(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setPoints([]);
                setSelected(new Set());
                setConfirm(false);
              }}
            >
              {t('pk.dossier.cv.clear')}
            </button>
          </>
        }
      >
        <p>{t('pk.dossier.cv.clearConfirm', { n: points.length })}</p>
      </Modal>
    </Card>
  );
}

/** A calm line drawing of a face from the front, in the panel's taupe: hair, brows, eyes, nose, lips, ears and neck. */
function FaceDrawing() {
  return (
    <g className="pk-ds-face-lines">
      <path className="pk-ds-neck" d="M156 398 C160 424 160 452 152 480 M244 398 C240 424 240 452 248 480" />
      <path className="pk-ds-skin" d="M200 58 C140 58 104 104 102 170 C100 226 108 276 124 318 C142 364 170 404 200 412 C230 404 258 364 276 318 C292 276 300 226 298 170 C296 104 260 58 200 58 Z" />
      <path className="pk-ds-ear" d="M103 200 C88 192 82 216 88 238 C92 254 102 260 110 256 M297 200 C312 192 318 216 312 238 C308 254 298 260 290 256" />
      <path className="pk-ds-hair" d="M99 192 C86 108 140 40 204 42 C270 46 318 104 301 192 C296 146 266 102 200 100 C138 102 106 142 99 192 Z" />
      <path d="M140 178 C152 168 172 166 188 174 M260 178 C248 168 228 166 212 174" />
      <path d="M144 202 C156 192 174 192 186 202 C174 210 156 210 144 202 Z M214 202 C226 192 244 192 256 202 C244 210 226 210 214 202 Z" />
      <circle className="pk-ds-iris" cx="165" cy="201" r="5.2" />
      <circle className="pk-ds-iris" cx="235" cy="201" r="5.2" />
      <path d="M197 212 C195 238 190 256 184 266 M203 212 C205 238 210 256 216 266 M184 266 C190 276 210 276 216 266" />
      <path className="pk-ds-soft" d="M182 280 C170 294 166 306 168 320 M218 280 C230 294 234 306 232 320 M188 374 C196 378 204 378 212 374" />
      <path d="M170 318 C182 310 192 309 200 314 C208 309 218 310 230 318 C214 323 186 323 170 318 Z M172 320 C186 338 214 338 228 320" />
    </g>
  );
}
