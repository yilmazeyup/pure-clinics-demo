import { openingHours, sameDay, type LocationId } from '@pure-clinics/shared';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { CATEGORY_COLOR } from '../../../components/ClinicsView';
import { useI18n } from '../../../i18n';
import { lanes, minutesOf, type AgAppt, type ApptStatus, type BlockItem } from '../../data/agenda';
import type { StaffId } from '../../data/core';
import { PkIcon } from '../../icons';
import { isolate } from '../../kit';
import { ReportMark, StatusMark } from './marks';

/** Height of one quarter of an hour, in pixels. */
export const ROW = 22;

/** One column of the grid: an agenda on a day (day view), or one agenda on each day of a week. */
export type GridCol = { key: string; day: Date; col: StaffId; clinic: LocationId; head: ReactNode; state: 'open' | 'closed' | 'off' };

export type ApptInfo = { status: ApptStatus; report: boolean; note: string | null };

type Props = {
  cols: GridCol[];
  /** Opening and closing hour of the whole grid. */
  span: { open: number; close: number };
  appts: AgAppt[];
  blocks: BlockItem[];
  now: Date;
  compact: boolean;
  label: string;
  canSee: (col: StaffId) => boolean;
  info: (a: AgAppt) => ApptInfo;
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (a: AgAppt) => void;
  onStatus: (a: AgAppt, status: ApptStatus) => void;
  onReport: (a: AgAppt) => void;
  onFile: (a: AgAppt) => void;
  onBlock: (b: BlockItem) => void;
  onEmpty: (col: GridCol, minutes: number) => void;
  onDrop: (a: AgAppt, col: GridCol, minutes: number) => void;
};

type Drag = { id: string; key: string; minutes: number; moved: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
export const hm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Text on dark treatment colours is white; the others keep the ink colour. */
const DARK = new Set(['conditions', 'hair']);

/**
 * The agenda on a quarter-hour grid: a column per agenda or per day, appointments with SkinAdmin's icons, blocks without a
 * client, "Bezet" where the viewer has no access, and a line for now. Appointments can be dragged to another time or
 * column of the same location; a click on an empty quarter starts a new appointment.
 */
export function Grid(props: Props) {
  const { cols, span, appts, blocks, now, compact, canSee, info, selecting, selected } = props;
  const { t, text, clock } = useI18n();
  const body = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const origin = useRef<{ appt: AgAppt; x: number; y: number; startMin: number; colKey: string; rects: { key: string; left: number; right: number }[] } | null>(
    null,
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const rows = (span.close - span.open) * 4;
  const top = (minutes: number) => ((minutes - span.open * 60) / 15) * ROW;
  const nowMin = minutesOf(now);
  const hasToday = cols.some((c) => sameDay(c.day, now));

  // Open on the current hour when today is on screen, otherwise at the start of the day.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = hasToday && nowMin > span.open * 60 + 120 ? Math.max(0, top(nowMin) - 160) : 0;
  }, [cols.map((c) => c.key).join(), span.open]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>, a: AgAppt, colKey: string, handle: boolean) => {
    if (selecting || event.button !== 0) return;
    // On a touch screen only the grip drags, so the page can still scroll.
    if (event.pointerType === 'touch' && !handle) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rects = Array.from(body.current?.querySelectorAll<HTMLElement>('[data-gcol]') ?? []).map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.dataset.gcol!, left: r.left, right: r.right };
    });
    origin.current = { appt: a, x: event.clientX, y: event.clientY, startMin: minutesOf(a.start), colKey, rects };
    setDrag({ id: a.id, key: colKey, minutes: minutesOf(a.start), moved: false });
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const o = origin.current;
    if (!o) return;
    const dx = event.clientX - o.x;
    const dy = event.clientY - o.y;
    const moved = Math.abs(dx) > 4 || Math.abs(dy) > 4;
    const minutes = o.startMin + Math.round(dy / ROW) * 15;
    const over = o.rects.find((r) => event.clientX >= r.left && event.clientX <= r.right)?.key ?? o.colKey;
    setDrag({ id: o.appt.id, key: over, minutes, moved });
  };

  const endDrag = () => {
    const o = origin.current;
    const d = drag;
    origin.current = null;
    setDrag(null);
    if (!o || !d) return;
    if (!d.moved) {
      props.onOpen(o.appt);
      return;
    }
    const col = cols.find((c) => c.key === d.key);
    if (col && (col.key !== o.colKey || d.minutes !== o.startMin)) props.onDrop(o.appt, col, d.minutes);
  };

  return (
    <div className="pk-ag-scroll" ref={scroller} role="region" aria-label={props.label} tabIndex={0}>
      <div className={`pk-ag-grid ${compact ? 'is-compact' : ''}`} style={{ '--cols': cols.length } as CSSProperties}>
        <div className="pk-ag-corner" />
        {cols.map((c) => (
          <div key={c.key} className="pk-ag-head">
            {c.head}
          </div>
        ))}

        <div className="pk-ag-axis" style={{ height: rows * ROW }}>
          {Array.from({ length: span.close - span.open + 1 }, (_, i) => (
            <span key={i} style={{ top: i * 4 * ROW }}>
              {hm((span.open + i) * 60)}
            </span>
          ))}
          {hasToday && nowMin >= span.open * 60 && nowMin <= span.close * 60 ? (
            <b className="pk-ag-axis-now" style={{ top: top(nowMin) }}>
              {clock(now)}
            </b>
          ) : null}
        </div>

        <div className="pk-ag-body" ref={body} style={{ gridColumn: `2 / span ${cols.length}`, height: rows * ROW }}>
          {cols.map((c) => {
            const hours = openingHours(c.day, c.clinic);
            const own = appts.filter((a) => a.col === c.col && a.clinic === c.clinic && sameDay(a.start, c.day));
            const ownBlocks = blocks.filter((b) => b.col === c.col && sameDay(b.start, c.day));
            const placed = lanes([...own, ...ownBlocks]);
            const visible = canSee(c.col);
            return (
              <div
                key={c.key}
                data-gcol={c.key}
                className={`pk-ag-col ${drag?.moved && drag.key === c.key ? 'is-target' : ''}`}
                onClick={(event) => {
                  if (event.target !== event.currentTarget || selecting || c.state !== 'open') return;
                  const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
                  props.onEmpty(c, span.open * 60 + Math.floor(y / ROW) * 15);
                }}
                title={c.state === 'open' ? t('pk.agenda.dragHint') : undefined}
              >
                {c.state !== 'open' ? (
                  <div className="pk-ag-shade pk-ag-shade--full">
                    <span>{c.state === 'closed' ? t('pk.agenda.closed') : t('pk.agenda.off')}</span>
                  </div>
                ) : hours ? (
                  <>
                    {hours.open > span.open ? <div className="pk-ag-shade" style={{ top: 0, height: top(hours.open * 60) }} /> : null}
                    {hours.close < span.close ? <div className="pk-ag-shade" style={{ top: top(hours.close * 60), bottom: 0 }} /> : null}
                  </>
                ) : null}

                {ownBlocks.map((b) => {
                  const lane = placed.get(b.id) ?? { lane: 0, of: 1 };
                  const title = b.rule.kind ? t(`pk.agenda.block.k.${b.rule.kind}`) : b.rule.title;
                  return (
                    <button
                      key={b.id}
                      className="pk-ag-block"
                      style={place(top(minutesOf(b.start)), top(minutesOf(b.end)) - top(minutesOf(b.start)), lane)}
                      onClick={() => props.onBlock(b)}
                    >
                      <span className="pk-ag-time">
                        {clock(b.start)}–{clock(b.end)}
                      </span>
                      <strong>
                        {b.rule.repeat !== 'none' ? <PkIcon name="repeat" size={11} stroke={2} /> : null}
                        {title}
                      </strong>
                    </button>
                  );
                })}

                {own.map((a) => {
                  const lane = placed.get(a.id) ?? { lane: 0, of: 1 };
                  const isDragging = drag?.id === a.id && drag.moved;
                  const startMin = isDragging ? drag.minutes : minutesOf(a.start);
                  const length = (a.end.getTime() - a.start.getTime()) / 60000;
                  const y = top(startMin);
                  const h = (length / 15) * ROW;
                  if (!visible)
                    return (
                      <div key={a.id} className="pk-ag-busy" style={place(y, h, lane)} title={t('pk.agenda.st.busy')}>
                        {t('pk.agenda.busy')}
                      </div>
                    );
                  const i = info(a);
                  const color = CATEGORY_COLOR[a.treatment.category];
                  const isSelected = selected.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`pk-ag-appt ${length <= 30 ? 'is-short' : ''} ${DARK.has(a.treatment.category) ? 'is-dark' : ''} ${isDragging ? 'is-dragging' : ''} ${isSelected ? 'is-selected' : ''} ${a.end <= now ? 'is-past' : ''}`}
                      style={{ ...place(y, h, lane), ['--c' as string]: color, ...(isDragging && drag.key !== c.key ? hidden : null) }}
                      onPointerDown={(e) => startDrag(e, a, c.key, false)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={() => {
                        origin.current = null;
                        setDrag(null);
                      }}
                      onClick={() => selecting && props.onToggle(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (selecting ? props.onToggle(a.id) : props.onOpen(a));
                      }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selecting ? isSelected : undefined}
                      aria-label={`${clock(a.start)} ${a.client} · ${text(a.treatment.name)}`}
                    >
                      <div className="pk-ag-line">
                        {selecting ? (
                          <span className={`pk-ag-tick ${isSelected ? 'on' : ''}`}>{isSelected ? <PkIcon name="check" size={11} stroke={2.6} /> : null}</span>
                        ) : (
                          <span
                            className="pk-ag-grip"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              startDrag(e, a, c.key, true);
                            }}
                            aria-label={t('pk.agenda.dragHandle', { client: a.client })}
                          >
                            <PkIcon name="grip" size={11} />
                          </span>
                        )}
                        <span className="pk-ag-time">{isDragging ? hm(startMin) : clock(a.start)}</span>
                        {compact ? null : (
                          <span className="pk-ag-icons" onPointerDown={(e) => e.stopPropagation()}>
                            <button
                              className="pk-ag-ico"
                              title={t(`pk.agenda.st.${i.status}`)}
                              aria-label={t(`pk.agenda.status.${i.status}`)}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onStatus(a, i.status);
                              }}
                            >
                              <StatusMark status={i.status} size={12} />
                            </button>
                            <button
                              className="pk-ag-ico"
                              title={t(i.report ? 'pk.agenda.st.reportFilled' : 'pk.agenda.st.reportEmpty')}
                              aria-label={t('pk.agenda.toggleReport')}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onReport(a);
                              }}
                            >
                              <ReportMark filled={i.report} color={color} />
                            </button>
                            <button
                              className="pk-ag-ico"
                              title={t('pk.agenda.openFile', { client: a.client })}
                              aria-label={t('pk.agenda.openFile', { client: a.client })}
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onFile(a);
                              }}
                            >
                              <PkIcon name="user" size={12} stroke={2} />
                            </button>
                            {i.note ? (
                              <span className="pk-ag-ico pk-ag-note" title={i.note} aria-label={i.note} tabIndex={0}>
                                <PkIcon name="chat" size={12} stroke={2} />
                              </span>
                            ) : null}
                            {a.online ? (
                              <span className="pk-ag-ico" title={t('pk.agenda.st.online')}>
                                <PkIcon name="globe" size={12} stroke={1.9} />
                              </span>
                            ) : null}
                          </span>
                        )}
                      </div>
                      <strong className="pk-ag-client">{isolate(a.client)}</strong>
                      {compact ? null : <span className="pk-ag-treat">{text(a.treatment.name)}</span>}
                    </div>
                  );
                })}

                {/* The appointment that is being dragged in from another column. */}
                {drag?.moved && drag.key === c.key
                  ? own.length === 0 || !own.some((a) => a.id === drag.id)
                    ? ghost(appts.find((a) => a.id === drag.id), drag.minutes, top)
                    : null
                  : null}

                {sameDay(c.day, now) && nowMin >= span.open * 60 && nowMin <= span.close * 60 ? (
                  <i className="pk-ag-now" style={{ top: top(nowMin) }} aria-hidden="true" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const hidden: CSSProperties = { opacity: 0.25 };

function place(y: number, h: number, lane: { lane: number; of: number }): CSSProperties {
  return {
    top: y + 1,
    height: Math.max(ROW - 2, h - 2),
    insetInlineStart: `calc(${(lane.lane / lane.of) * 100}% + 3px)`,
    width: `calc(${100 / lane.of}% - 6px)`,
  };
}

function ghost(a: AgAppt | undefined, minutes: number, top: (m: number) => number) {
  if (!a) return null;
  const length = (a.end.getTime() - a.start.getTime()) / 60000;
  return (
    <div
      className="pk-ag-appt is-ghost"
      style={{ ...place(top(minutes), (length / 15) * ROW, { lane: 0, of: 1 }), ['--c' as string]: CATEGORY_COLOR[a.treatment.category] }}
    >
      <div className="pk-ag-line">
        <span className="pk-ag-time">{hm(minutes)}</span>
      </div>
      <strong className="pk-ag-client">{a.client}</strong>
    </div>
  );
}
