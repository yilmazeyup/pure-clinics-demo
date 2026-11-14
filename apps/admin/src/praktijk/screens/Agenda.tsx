import {
  addDays,
  dateKey,
  LOCATIONS,
  openingHours,
  sameDay,
  startOfDay,
  startOfWeek,
  treatmentById,
  type LocationId,
  type SpecialistId,
} from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { CATEGORY_COLOR } from '../../components/ClinicsView';
import { useI18n } from '../../i18n';
import { usePraktijk, useShared, type ApptRef } from '../context';
import {
  blocksOn,
  columnFree,
  columnsFor,
  confirmable,
  dayAppts,
  minutesOf,
  moveAppt,
  onlineBookings,
  partOf,
  rescheduleAppt,
  reportFilled,
  seedAgenda,
  statusOf,
  waitingList,
  atMinutes,
  type AgAppt,
  type AgendaState,
  type ApptStatus,
  type BlockItem,
  type Column,
  type Mode,
  type Waiting,
} from '../data/agenda';
import { cityOf, clientFor, roleKey, STAFF, staffById, type StaffId } from '../data/core';
import { seedAgendaAccess, type AgendaAccess } from '../data/shared';
import { PkIcon } from '../icons';
import { Avatar, Card, Chip, Seg } from '../kit';
import { BlockInfoModal, BlockModal, BookModal, ConfirmModal, DetailModal, OnlineModal, type BlockDraft, type BookDraft } from './agenda/dialogs';
import { Grid, type ApptInfo, type GridCol } from './agenda/Grid';
import { CalendarCross, ReportMark, StatusMark } from './agenda/marks';
import './Agenda.css';

type View = 'day' | 'workweek' | 'week' | 'month';
type Place = LocationId | 'all';

/** ISO week number, as Dutch diaries show it. */
function weekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const addMonths = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth() + n, 1);

/** The agenda of both clinics: SkinAdmin's views, icons and actions on Pure's own diary. */
export function AgendaScreen() {
  const i18n = useI18n();
  const { t, dayLong, dayMonth, monthYear, weekdayShort } = i18n;
  const { now, today, go, demo } = usePraktijk();
  const [state, setState] = useShared<AgendaState>('agenda', () => seedAgenda(today));
  const [access] = useShared<AgendaAccess>('agendaAccess', seedAgendaAccess);

  const [date, setDate] = useState(today);
  const [view, setView] = useState<View>('day');
  const [mode, setMode] = useState<Mode>('room');
  const [place, setPlace] = useState<Place>('all');
  const [viewAs, setViewAs] = useState<'admin' | StaffId>('admin');
  const [weekCol, setWeekCol] = useState<StaffId>('loubna');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [book, setBook] = useState<BookDraft | null>(null);
  const [detail, setDetail] = useState<AgAppt | null>(null);
  const [confirm, setConfirm] = useState<AgAppt | null>(null);
  const [block, setBlock] = useState<BlockDraft | null>(null);
  const [blockInfo, setBlockInfo] = useState<BlockItem | null>(null);
  const [showOnline, setShowOnline] = useState(false);

  const canSee = (col: StaffId) => viewAs === 'admin' || col === viewAs || col === 'husna' || (access[viewAs] ?? []).includes(col as SpecialistId);
  const info = (a: AgAppt): ApptInfo => {
    const typed = state.notes[a.id];
    return {
      status: statusOf(a, now, state, today),
      report: reportFilled(a, now, state),
      note: typed !== undefined ? typed || null : a.noteKey ? t(a.noteKey) : null,
    };
  };

  const online = useMemo(() => onlineBookings(today, now, state), [today, state.deleted, state.moved, dateKey(now)]);
  const columns = columnsFor(mode, place);
  const weekColumn: Column = columns.find((c) => c.id === weekCol) ?? columns[0];

  /* ---------- What the grid shows ---------- */

  const days = useMemo(() => {
    if (view === 'day') return [date];
    const monday = startOfWeek(date);
    return Array.from({ length: view === 'workweek' ? 5 : 6 }, (_, i) => addDays(monday, i));
  }, [view, dateKey(date)]);

  const appts = useMemo(() => days.flatMap((d) => dayAppts(d, state)), [days, state]);
  const blocks = useMemo(() => days.flatMap((d) => blocksOn(d, state.rules)), [days, state.rules]);

  const head = (c: Column) =>
    c.room ? (
      <>
        <span className="pk-ag-head-room">
          {t('pk.agenda.room', { n: c.room })} · {cityOf(c.clinic)}
        </span>
        <span className="pk-ag-head-who">
          <Avatar staff={c.staff} size={22} />
          <strong>{c.staff.role === 'beauty' ? 'Blanche Beauty Studio' : c.staff.name}</strong>
        </span>
      </>
    ) : (
      <>
        <span className="pk-ag-head-room">
          {t(roleKey(c.staff.role))} · {cityOf(c.clinic)}
        </span>
        <span className="pk-ag-head-who">
          <Avatar staff={c.staff} size={22} />
          <strong>{c.staff.name}</strong>
        </span>
      </>
    );

  const stateOf = (day: Date, c: Column): GridCol['state'] =>
    !openingHours(day, c.clinic) ? 'closed' : c.staff.days.includes(day.getDay()) ? 'open' : 'off';

  const gridCols: GridCol[] =
    view === 'day'
      ? columns.map((c) => ({ key: c.id, day: date, col: c.id, clinic: c.clinic, head: head(c), state: stateOf(date, c) }))
      : days.map((d) => ({
          key: dateKey(d),
          day: d,
          col: weekColumn.id,
          clinic: weekColumn.clinic,
          head: (
            <>
              <span className="pk-ag-head-room">{weekdayShort(d)}</span>
              <span className="pk-ag-head-who">
                <strong className={sameDay(d, today) ? 'pk-ag-today' : ''}>{dayMonth(d, today)}</strong>
              </span>
            </>
          ),
          state: stateOf(d, weekColumn),
        }));

  const span = useMemo(() => {
    const spans = gridCols.map((c) => openingHours(c.day, c.clinic)).filter((h) => h !== null);
    if (!spans.length) return { open: 9, close: 17 };
    return { open: Math.min(...spans.map((h) => h.open)), close: Math.max(...spans.map((h) => h.close)) };
  }, [gridCols.map((c) => `${c.key}-${c.clinic}`).join()]);

  /* ---------- Actions ---------- */

  const refOf = (a: AgAppt): ApptRef => ({
    id: a.id,
    client: a.client,
    clientId: clientFor(a.client, a.clinic, today).id,
    treatment: a.treatment.id,
    specialistId: a.col as SpecialistId,
    clinic: a.clinic,
    start: a.start,
    end: a.end,
    price: a.price,
  });

  const onStatus = (a: AgAppt, status: ApptStatus) => {
    if (status === 'unconfirmed') setConfirm(a);
    else if (status === 'client') go('facturen', { appt: refOf(a), feature: 'i.agenda' });
    else if (status === 'insurer') go('declaraties', { appt: refOf(a) });
    else if (status === 'future') demo(t('pk.agenda.tooEarly'));
    else setDetail(a);
  };

  const doConfirm = (a: AgAppt) => {
    setState((s) => ({ ...s, confirmed: [...s.confirmed, a.id] }));
    setConfirm(null);
    setDetail(null);
    demo(t('pk.agenda.confirmed', { client: a.client, time: a.start }));
  };

  const onReport = (a: AgAppt) => {
    const filled = !reportFilled(a, now, state);
    setState((s) => ({ ...s, reports: { ...s.reports, [a.id]: filled } }));
    demo(t(filled ? 'pk.agenda.reportOn' : 'pk.agenda.reportOff', { client: a.client }));
  };

  const onFile = (a: AgAppt) => go('dossier', { clientId: clientFor(a.client, a.clinic, today).id });

  const onDrop = (a: AgAppt, col: GridCol, minutes: number) => {
    const hours = openingHours(col.day, col.clinic);
    const length = (a.end.getTime() - a.start.getTime()) / 60000;
    if (col.clinic !== a.clinic || col.state !== 'open' || !hours || minutes < hours.open * 60 || minutes + length > hours.close * 60) {
      demo(t('pk.agenda.moveBlocked'));
      return;
    }
    const start = atMinutes(col.day, minutes);
    setState((s) => (sameDay(start, a.start) ? moveAppt(s, a, start, col.col) : rescheduleAppt(s, a, start, col.col)));
    const where = staffById(col.col);
    demo(t('pk.agenda.moved', { client: a.client, time: start, where: `${view === 'day' ? '' : `${dayMonth(start, today)}, `}${where.name}` }));
  };

  const remove = (ids: string[]) =>
    setState((s) => ({
      ...s,
      deleted: [...s.deleted, ...ids.filter((id) => !s.added.some((a) => a.id === id))],
      added: s.added.filter((a) => !ids.includes(a.id)),
    }));

  const planWaiting = (w: Waiting) => {
    const treatment = treatmentById(w.treatment);
    const team = STAFF.filter((s) => s.locationId === w.client.locationId && s.role !== 'reception' && s.categories.includes(treatment.category));
    for (const day of [today, addDays(today, 1), addDays(today, 2)]) {
      const hours = openingHours(day, w.client.locationId);
      if (!hours) continue;
      const list = dayAppts(day, state);
      const dayBlocks = blocksOn(day, state.rules);
      const earliest = sameDay(day, now) ? Math.ceil((minutesOf(now) + 15) / 15) * 15 : hours.open * 60;
      const starts: number[] = [];
      for (let m = Math.max(earliest, hours.open * 60); m + treatment.minutes <= hours.close * 60; m += 15) starts.push(m);
      // The preferred part of the day first, then any other free moment.
      starts.sort((a, b) => Number(partOf(b) === w.part) - Number(partOf(a) === w.part) || a - b);
      for (const m of starts) {
        const start = atMinutes(day, m);
        const end = new Date(start.getTime() + treatment.minutes * 60000);
        const who = team.find((s) => s.days.includes(day.getDay()) && columnFree(s.id, start, end, list, dayBlocks));
        if (!who) continue;
        const appt: AgAppt = {
          id: `wait-${w.client.id}`,
          clinic: who.locationId,
          col: who.id,
          treatment,
          client: w.client.short,
          start,
          end,
          price: treatment.priceFrom,
          online: false,
          noteKey: null,
          added: true,
        };
        setState((s) => ({ ...s, added: [...s.added, appt], waitPlanned: [...s.waitPlanned, w.client.id] }));
        demo(t('pk.agenda.wait.planned', { client: w.client.short, day: { date: start }, time: start, name: who.name }));
        return;
      }
    }
    demo(t('pk.agenda.wait.none', { client: w.client.short }));
  };

  /* ---------- Toolbar ---------- */

  const step = (n: number) =>
    setDate((d) => (view === 'month' ? addMonths(d, n) : view === 'day' ? addDays(d, n) : addDays(d, n * 7)));

  const label =
    view === 'day'
      ? dayLong(date)
      : view === 'month'
        ? monthYear(date)
        : `${t('pk.agenda.week', { n: weekNumber(date) })} · ${dayMonth(days[0], today)} – ${dayMonth(days[days.length - 1], today)}`;

  const waiting = waitingList(today).filter((w) => !state.waitPlanned.includes(w.client.id));
  const selectedIds = [...selected];

  return (
    <div className="pk-ag">
      <section className="card pk-card pk-ag-main">
        <div className="pk-ag-toolbar">
          <div className="pk-ag-nav" data-feature="a.views">
            <button className="icon-button small pk-ag-step" onClick={() => step(-1)} aria-label={t('pk.agenda.prev')}>
              <span className="pk-flip">
                <PkIcon name="chevronStart" size={18} />
              </span>
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => setDate(today)}>
              {t('pk.common.today')}
            </button>
            <button className="icon-button small pk-ag-step" onClick={() => step(1)} aria-label={t('pk.agenda.next')}>
              <span className="pk-flip">
                <PkIcon name="chevronEnd" size={18} />
              </span>
            </button>
            <h3 className="pk-ag-date">{label}</h3>
          </div>
          <div className="pk-row">
            <span data-feature="a.views">
              <Seg
                label={t('pk.agenda.viewLabel')}
                value={view}
                onChange={setView}
                options={(['day', 'workweek', 'week', 'month'] as View[]).map((v) => ({ value: v, label: t(`pk.agenda.view.${v}`) }))}
              />
            </span>
            <span data-feature="a.modes">
              <Seg
                label={t('pk.agenda.modeLabel')}
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'room', label: t('pk.agenda.mode.room'), icon: 'grid' },
                  { value: 'staff', label: t('pk.agenda.mode.staff'), icon: 'users' },
                ]}
              />
            </span>
          </div>
        </div>

        <div className="pk-ag-toolbar pk-ag-toolbar--second">
          <div className="pk-row">
            <Seg
              label={t('pk.agenda.locationLabel')}
              value={place}
              onChange={setPlace}
              options={[{ value: 'all', label: t('pk.common.all') }, ...LOCATIONS.map((l) => ({ value: l.id as Place, label: l.city }))]}
            />
            {view === 'workweek' || view === 'week' ? (
              <label className="pk-ag-pick">
                <span>{t('pk.agenda.agendaLabel')}</span>
                <select className="pk-input" value={weekColumn.id} onChange={(e) => setWeekCol(e.target.value as StaffId)}>
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.room ? `${t('pk.agenda.room', { n: c.room })} · ${c.staff.name}` : c.staff.name} · {cityOf(c.clinic)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="pk-ag-pick" data-feature="a.busy" title={t('pk.agenda.viewAsHint')}>
              <PkIcon name="eye" size={15} />
              <span>{t('pk.agenda.viewAs')}</span>
              <select className="pk-input" value={viewAs} onChange={(e) => setViewAs(e.target.value as 'admin' | StaffId)}>
                <option value="admin">{t('pk.agenda.viewAs.admin')}</option>
                {STAFF.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {t(roleKey(s.role))}
                  </option>
                ))}
              </select>
            </label>
            <button className="pk-ag-online" onClick={() => setShowOnline(true)} data-feature="a.online">
              <PkIcon name="globe" size={15} />
              {t('pk.agenda.online', { n: online.length })}
            </button>
          </div>
          <div className="pk-row">
            <button
              className={`btn btn-small ${selecting ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
              data-feature="a.delete"
            >
              <PkIcon name="check" size={14} />
              {selecting ? t('pk.agenda.selectDone') : t('pk.agenda.select')}
            </button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => setBlock({ day: date, minutes: 12 * 60, col: mode === 'staff' ? 'husna' : (columns[0]?.id ?? 'loubna') })}
              data-feature="a.block"
            >
              <PkIcon name="plus" size={14} />
              {t('pk.agenda.newBlock')}
            </button>
            <button
              className="btn btn-small btn-primary"
              onClick={() => {
                const c = columns.find((x) => x.staff.role !== 'reception') ?? columnsFor('room', 'all')[0];
                const hours = openingHours(date, c.clinic) ?? { open: 9, close: 17 };
                // Today the form opens on the next free quarter; other days an hour after opening.
                const next = sameDay(date, now) ? Math.ceil((minutesOf(now) + 15) / 15) * 15 : hours.open * 60 + 60;
                setBook({ day: date, minutes: Math.min(Math.max(next, hours.open * 60), hours.close * 60 - 30), col: c.id, clinic: c.clinic });
              }}
              data-feature="a.book a.mail"
            >
              <PkIcon name="plus" size={14} />
              {t('pk.agenda.newAppt')}
            </button>
          </div>
        </div>

        {selecting ? (
          <div className="pk-ag-bulk" role="status">
            <span>{t('pk.agenda.selectHelp')}</span>
            <button
              className="btn btn-small btn-primary"
              disabled={!selected.size}
              onClick={() => {
                remove(selectedIds);
                demo(t('pk.agenda.deletedN', { n: selected.size }));
                setSelected(new Set());
                setSelecting(false);
              }}
            >
              <PkIcon name="trash" size={14} />
              {t('pk.agenda.deleteN', { n: selected.size })}
            </button>
          </div>
        ) : null}

        {view === 'month' ? (
          <MonthView
            date={date}
            place={place}
            state={state}
            onDay={(d) => {
              setDate(d);
              setView('day');
            }}
          />
        ) : (
          <div data-feature="a.drag">
            <Grid
              cols={gridCols}
              span={span}
              appts={appts}
              blocks={blocks}
              now={now}
              compact={view !== 'day'}
              label={label}
              canSee={canSee}
              info={info}
              selecting={selecting}
              selected={selected}
              onToggle={(id) =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onOpen={setDetail}
              onStatus={onStatus}
              onReport={onReport}
              onFile={onFile}
              onBlock={setBlockInfo}
              onEmpty={(c, minutes) =>
                c.col === 'husna' ? setBlock({ day: c.day, minutes, col: c.col }) : setBook({ day: c.day, minutes, col: c.col, clinic: c.clinic })
              }
              onDrop={onDrop}
            />
            <p className="pk-ag-hint">{t('pk.agenda.dragHint')}</p>
          </div>
        )}
      </section>

      <div className="pk-grid">
        <Card
          className="span-7"
          eyebrow={t('pk.agenda.legend.eyebrow')}
          title={t('pk.agenda.legend.title')}
          help={t('pk.agenda.legend.help')}
          feature="a.status"
        >
          <ul className="pk-ag-legend">
            {(['unconfirmed', 'client', 'insurer', 'invoiced'] as ApptStatus[]).map((s) => (
              <li key={s}>
                <StatusMark status={s} size={15} />
                {t(`pk.agenda.st.${s}`)}
              </li>
            ))}
            <li>
              <ReportMark filled={false} color={CATEGORY_COLOR.removal} />
              {t('pk.agenda.st.reportEmpty')}
            </li>
            <li>
              <ReportMark filled color={CATEGORY_COLOR.removal} />
              {t('pk.agenda.st.reportFilled')}
            </li>
            <li>
              <span className="pk-ag-legend-ico">
                <PkIcon name="user" size={15} stroke={2} />
              </span>
              {t('pk.agenda.st.file')}
            </li>
            <li data-feature="a.note">
              <span className="pk-ag-legend-ico">
                <PkIcon name="chat" size={15} stroke={2} />
              </span>
              {t('pk.agenda.st.note')}
            </li>
            <li>
              <span className="pk-ag-legend-ico">
                <PkIcon name="globe" size={15} />
              </span>
              {t('pk.agenda.st.online')}
            </li>
            <li>
              <span className="pk-ag-legend-swatch is-busy" />
              {t('pk.agenda.st.busy')}
            </li>
            <li>
              <span className="pk-ag-legend-swatch is-block" />
              {t('pk.agenda.st.block')}
            </li>
            <li>
              <span className="pk-ag-legend-ico">
                <CalendarCross size={15} />
              </span>
              {t('pk.agenda.onlineMoved')}
            </li>
          </ul>
        </Card>

        <Card
          className="span-5"
          eyebrow={t('pk.agenda.wait.eyebrow')}
          title={t('pk.agenda.wait.title')}
          help={t('pk.agenda.wait.help')}
          feature="more.waitlist"
          actions={<Chip tone="brand">{waiting.length}</Chip>}
        >
          {waiting.length ? (
            <ul className="pk-list pk-ag-wait">
              {waiting.map((w) => (
                <li key={w.client.id}>
                  <span className="pk-ag-wait-text">
                    <strong>
                      {w.client.first} {w.client.last}
                    </strong>
                    <span>
                      {i18n.text(treatmentById(w.treatment).name)} · {t('pk.agenda.wait.prefers', { part: t(`pk.agenda.part.${w.part}`), city: cityOf(w.client.locationId) })}
                    </span>
                    <small>{t('pk.agenda.wait.since', { date: { date: w.since } })}</small>
                  </span>
                  <button className="btn btn-small btn-ghost" onClick={() => planWaiting(w)}>
                    <PkIcon name="calendar" size={14} />
                    {t('pk.agenda.wait.plan')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pk-empty">{t('pk.agenda.wait.empty')}</p>
          )}
        </Card>
      </div>

      {book ? (
        <BookModal
          draft={book}
          state={state}
          onClose={() => setBook(null)}
          onSave={(appt, note, client, mail) => {
            setState((s) => ({ ...s, added: [...s.added, appt], notes: note ? { ...s.notes, [appt.id]: note } : s.notes }));
            setBook(null);
            setDate(startOfDay(appt.start));
            demo(
              mail
                ? t('pk.agenda.book.mailed', { email: client.email })
                : t('pk.agenda.book.saved', { client: appt.client, day: { date: appt.start }, time: appt.start }),
            );
          }}
        />
      ) : null}

      {detail ? (
        <DetailModal
          key={detail.id}
          appt={detail}
          status={statusOf(detail, now, state, today)}
          note={info(detail).note ?? ''}
          confirmable={confirmable(detail, now)}
          onClose={() => setDetail(null)}
          onNote={(note) => {
            setState((s) => ({ ...s, notes: { ...s.notes, [detail.id]: note } }));
            demo(t('pk.agenda.detail.noteSaved'));
          }}
          onConfirm={() => doConfirm(detail)}
          onInvoice={() => {
            setDetail(null);
            go('facturen', { appt: refOf(detail), feature: 'i.agenda' });
          }}
          onFile={() => {
            setDetail(null);
            onFile(detail);
          }}
          onDelete={() => {
            remove([detail.id]);
            setDetail(null);
            demo(t('pk.agenda.detail.deleted', { client: detail.client }));
          }}
          onMail={() => demo(t('pk.agenda.detail.mailed', { email: clientFor(detail.client, detail.clinic, today).email }))}
        />
      ) : null}

      {confirm ? <ConfirmModal appt={confirm} onClose={() => setConfirm(null)} onConfirm={() => doConfirm(confirm)} /> : null}

      {block ? (
        <BlockModal
          draft={block}
          onClose={() => setBlock(null)}
          onSave={(rule) => {
            setState((s) => ({ ...s, rules: [...s.rules, rule] }));
            setBlock(null);
            if (mode === 'room' && rule.col === 'husna') setMode('staff');
            demo(t('pk.agenda.block.saved', { title: rule.kind ? t(`pk.agenda.block.k.${rule.kind}`) : rule.title }));
          }}
        />
      ) : null}

      {blockInfo ? (
        <BlockInfoModal
          block={blockInfo}
          onClose={() => setBlockInfo(null)}
          onDeleteOne={() => {
            setState((s) => ({
              ...s,
              rules: s.rules.map((r) => (r.id === blockInfo.rule.id ? { ...r, skip: [...r.skip, dateKey(blockInfo.start)] } : r)),
            }));
            setBlockInfo(null);
            demo(t('pk.agenda.block.removed'));
          }}
          onDeleteAll={() => {
            setState((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== blockInfo.rule.id) }));
            setBlockInfo(null);
            demo(t('pk.agenda.block.removed'));
          }}
        />
      ) : null}

      {showOnline ? <OnlineModal list={online} onClose={() => setShowOnline(false)} /> : null}
    </div>
  );
}

/** Six weeks from the Monday before the first of the month: appointments and booked revenue per day. */
function MonthView({ date, place, state, onDay }: { date: Date; place: Place; state: AgendaState; onDay: (day: Date) => void }) {
  const { t, eur, weekdayShort, dayLong } = useI18n();
  const { today } = usePraktijk();
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="pk-ag-month" role="grid">
      {cells.slice(0, 7).map((d) => (
        <span key={`h-${dateKey(d)}`} className="pk-ag-month-head">
          {weekdayShort(d)}
        </span>
      ))}
      {cells.map((d) => {
        const list = dayAppts(d, state).filter((a) => place === 'all' || a.clinic === place);
        const closed = !openingHours(d, place === 'all' ? undefined : place);
        const outside = d.getMonth() !== date.getMonth();
        const revenue = list.reduce((s, a) => s + a.price, 0);
        return (
          <button
            key={dateKey(d)}
            className={`pk-ag-month-cell ${outside ? 'is-outside' : ''} ${closed ? 'is-closed' : ''} ${sameDay(d, today) ? 'is-today' : ''}`}
            onClick={() => onDay(d)}
            aria-label={t('pk.agenda.month.open', { day: dayLong(d) })}
          >
            <span className="pk-ag-month-n">{d.getDate()}</span>
            {closed ? (
              <small>{t('pk.agenda.month.closed')}</small>
            ) : (
              <>
                <span className="pk-ag-month-short">{list.length}</span>
                <small>{t('pk.agenda.month.appts', { n: list.length })}</small>
                <strong>{eur(revenue)}</strong>
                <span className="pk-ag-month-bar">
                  <i style={{ width: `${Math.min(100, (list.length / 48) * 100)}%` }} />
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
