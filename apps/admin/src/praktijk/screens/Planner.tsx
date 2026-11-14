import {
  addDays,
  dateKey,
  LOCATIONS,
  openingHours,
  startOfDay,
  startOfWeek,
  TREATMENTS,
  treatmentById,
  type LocationId,
  type SpecialistId,
  type TreatmentId,
} from '@pure-clinics/shared';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk, useShared } from '../context';
import {
  dayAppts,
  excepted,
  minutesOf,
  reservations,
  rescheduleAppt,
  seedAgenda,
  seedEquipment,
  seedExceptions,
  type AgendaState,
  type EquipmentState,
  type Exception,
  type Part,
} from '../data/agenda';
import { AGENDAS, cityOf, clientById, conditionById, EQUIPMENT, practiceClients, STAFF, staffById, type EquipmentId, type StaffId } from '../data/core';
import { findAppt, machineAppointments, planOptions, type PlanItem, type PlanOption, type Pos } from '../data/planner';
import { PkIcon, type PkIconName } from '../icons';
import { Avatar, Bar, Card, Check, Chip, Field, Modal, Seg, TableWrap, Toggle, useDecimal } from '../kit';
import './Planner.css';

type Tab = 'plan' | 'equipment' | 'availability' | 'occupancy';

/** Where each feature of the inventory lives, so a jump from the feature overview opens the right tab. */
const FEATURE_TAB: Record<string, Tab> = {
  'b.prefs': 'plan',
  'b.multi': 'plan',
  'b.gap': 'plan',
  'b.dates': 'plan',
  'b.move': 'plan',
  'b.strict': 'plan',
  'b.equipment': 'equipment',
  'b.availability': 'availability',
  'b.occupancy': 'occupancy',
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6];
const PARTS: Part[] = ['morning', 'afternoon', 'evening'];
const PART_KEY = { morning: 'pk.common.morning', afternoon: 'pk.common.afternoon', evening: 'pk.common.evening' } as const;

const machineName = (id: EquipmentId | null, list: EquipmentState[]) => (id ? (list.find((m) => m.id === id)?.name ?? id) : null);

/** Planner & middelen: SkinAdmin's planagenda, the equipment register, availability and daily occupancy. */
export function PlannerScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const [tab, setTab] = useState<Tab>('plan');

  useEffect(() => {
    const next = target?.feature ? FEATURE_TAB[target.feature] : undefined;
    if (next) setTab(next);
  }, [target?.at]);

  return (
    <div className="pk-pl">
      <Seg
        variant="tabs"
        label={t('pk.planner.tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plan', label: t('pk.planner.tab.plan'), icon: 'calendar' },
          { value: 'equipment', label: t('pk.planner.tab.equipment'), icon: 'device' },
          { value: 'availability', label: t('pk.planner.tab.availability'), icon: 'clock' },
          { value: 'occupancy', label: t('pk.planner.tab.occupancy'), icon: 'chart' },
        ]}
      />
      {tab === 'plan' ? <PlanTab /> : tab === 'equipment' ? <EquipmentTab /> : tab === 'availability' ? <AvailabilityTab /> : <OccupancyTab />}
    </div>
  );
}

/* ---------- Shared state of the planner ---------- */

function usePlannerState() {
  const { today } = usePraktijk();
  const [agenda, setAgenda] = useShared<AgendaState>('agenda', () => seedAgenda(today));
  const [equipment, setEquipment] = useShared<EquipmentState[]>('equipment', seedEquipment);
  const [exceptions, setExceptions] = useShared<Exception[]>('availability', () => seedExceptions(today));
  const [strict, setStrict] = useShared<SpecialistId[]>('strictAgendas', () => ['loubna', 'nadila']);
  return { agenda, setAgenda, equipment, setEquipment, exceptions, setExceptions, strict, setStrict };
}

const POS_ICON: Record<Pos, PkIconName | null> = { float: null, before: 'down', fill: 'thumb', after: 'up' };

function PosMark({ pos }: { pos: Pos }) {
  const { t } = useI18n();
  const icon = POS_ICON[pos];
  return (
    <span className={`pk-pl-pos pk-pl-pos--${pos}`} title={t(`pk.planner.pos.${pos}`)} aria-label={t(`pk.planner.pos.${pos}`)}>
      {icon ? <PkIcon name={icon} size={14} stroke={2} /> : null}
    </span>
  );
}

/* ---------- Planner ---------- */

type Planned = { id: string; day: string; followed?: boolean };

function PlanTab() {
  const i18n = useI18n();
  const { t, text, dateShort, weekdayShort, clock } = i18n;
  const { now, today, clientId, demo } = usePraktijk();
  const { agenda, setAgenda, equipment, exceptions, strict, setStrict } = usePlannerState();

  const clients = useMemo(() => practiceClients(today).filter((c) => c.episodes.some((e) => !e.closed)), [today]);
  // Without a client from the dossier, the planner opens on a laser client, so the machine column has something to show.
  const sample = useMemo(
    () =>
      clients.find((c) => c.locationId === 'nijmegen' && c.episodes.length === 1 && c.episodes[0].treatment === 'laser' && !c.episodes[0].closed) ??
      clients[0],
    [clients],
  );
  const fromContext = clientId ? clientById(clientId, today) : undefined;
  const [chosenId, setChosenId] = useState(fromContext?.id ?? sample.id);
  useEffect(() => {
    if (fromContext) setChosenId(fromContext.id);
  }, [clientId]);
  const client = clientById(chosenId, today) ?? sample;
  // Open episodes first, the ones that need a machine at the client's location before the rest.
  const episodes = [...client.episodes]
    .filter((e) => !e.closed || client.episodes.every((x) => x.closed))
    .sort((a, b) => Number(EQUIPMENT.some((m) => m.treatments.includes(b.treatment))) - Number(EQUIPMENT.some((m) => m.treatments.includes(a.treatment))));

  const [episodeId, setEpisodeId] = useState(episodes[0]?.id ?? '');
  const episode = episodes.find((e) => e.id === episodeId) ?? episodes[0];
  const [location, setLocation] = useState<LocationId>(client.locationId);
  const [practitioner, setPractitioner] = useState<SpecialistId | 'all'>('all');
  const [whenMode, setWhenMode] = useState<'parts' | 'date'>('parts');
  const [date, setDate] = useState(dateKey(addDays(today, 2)));
  const [parts, setParts] = useState<Record<number, Part[]>>(() => Object.fromEntries(WEEKDAYS.map((d) => [d, ['morning', 'afternoon']])));
  const [items, setItems] = useState<PlanItem[]>(() => [{ treatment: episode?.treatment ?? 'consult', minutes: episode?.minutes ?? treatmentById(episode?.treatment ?? 'consult').minutes }]);
  const [order, setOrder] = useState<'date' | 'room'>('date');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(14);
  const [planned, setPlanned] = useShared<Planned[]>('plannerBooked', () =>
    machineAppointments(today, 'nijmegen', seedEquipment(), seedExceptions(today)).map((x) => ({ id: x.id, day: dateKey(x.day) })),
  );
  const [moving, setMoving] = useState<Planned | null>(null);

  // A new client or episode resets the visit to that episode's treatment, at the client's own location.
  useEffect(() => {
    setLocation(client.locationId);
    setEpisodeId(episodes[0]?.id ?? '');
    const ep = episodes[0];
    if (ep) setItems([{ treatment: ep.treatment, minutes: ep.minutes ?? treatmentById(ep.treatment).minutes }]);
    setPicked(new Set());
  }, [client.id]);

  const parseDay = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const result = useMemo(
    () =>
      planOptions(
        { location, practitioner, items, parts: whenMode === 'parts' ? parts : null, date: whenMode === 'date' ? parseDay(date) : null, from: now, days: 28 },
        agenda,
        equipment,
        exceptions,
        strict,
      ),
    [location, practitioner, items, parts, whenMode, date, agenda, equipment, exceptions, strict, dateKey(now), Math.floor(minutesOf(now) / 15)],
  );
  const sorted = useMemo(
    () =>
      [...result.options].sort((a, b) =>
        order === 'date' ? a.start.getTime() - b.start.getTime() : a.room - b.room || a.start.getTime() - b.start.getTime(),
      ),
    [result, order],
  );
  const shown = sorted.slice(0, limit);
  const team = STAFF.filter((s) => s.locationId === location && s.role !== 'reception' && items.every((i) => s.categories.includes(treatmentById(i.treatment).category)));

  const book = () => {
    const chosen = sorted.filter((o) => picked.has(o.id));
    if (!chosen.length) return;
    const added = chosen.flatMap((o) => {
      let at = o.start.getTime();
      return items.map((item, n) => {
        const start = new Date(at);
        at += item.minutes * 60000;
        return {
          id: `plan-${o.id}-${n}`,
          clinic: location,
          col: o.staff as StaffId,
          treatment: treatmentById(item.treatment),
          client: client.short,
          start,
          end: new Date(at),
          price: n === 0 && episode?.price ? episode.price : treatmentById(item.treatment).priceFrom,
          online: false,
          noteKey: null,
          added: true,
        };
      });
    });
    setAgenda((s) => ({ ...s, added: [...s.added, ...added] }));
    setPlanned((list) => [...added.filter((a) => a.id.endsWith('-0')).map((a) => ({ id: a.id, day: dateKey(a.start) })), ...list]);
    setPicked(new Set());
    demo(t('pk.planner.booked', { client: client.short, n: added.length }));
  };

  return (
    <div className="pk-grid">
      <Card className="span-8" eyebrow={t('pk.planner.eyebrow')} title={t('pk.planner.heading')} help={t('pk.planner.help')} feature="b.prefs">
        <div className="pk-form">
          <Field label={t('pk.common.client')}>
            <select className="pk-input" value={client.id} onChange={(e) => setChosenId(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.last}, {c.first} · {cityOf(c.locationId)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.planner.episode')}>
            <select
              className="pk-input"
              value={episode?.id ?? ''}
              onChange={(e) => {
                setEpisodeId(e.target.value);
                const ep = episodes.find((x) => x.id === e.target.value);
                if (ep) setItems([{ treatment: ep.treatment, minutes: ep.minutes ?? treatmentById(ep.treatment).minutes }]);
              }}
            >
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {t(conditionById(ep.condition).label)} · {ep.zt}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.common.location')}>
            <select className="pk-input" value={location} onChange={(e) => setLocation(e.target.value as LocationId)}>
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.city}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.planner.practitioner')}>
            <select className="pk-input" value={practitioner} onChange={(e) => setPractitioner(e.target.value as SpecialistId | 'all')}>
              <option value="all">{t('pk.planner.anyone')}</option>
              {team.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="pk-pl-when">
          <div className="pk-row pk-row--between">
            <span className="pk-field-label">{t('pk.planner.when')}</span>
            <Seg
              label={t('pk.planner.when')}
              value={whenMode}
              onChange={setWhenMode}
              options={[
                { value: 'parts', label: t('pk.planner.byParts') },
                { value: 'date', label: t('pk.planner.byDate') },
              ]}
            />
          </div>
          {whenMode === 'parts' ? (
            <div className="pk-pl-parts" role="group" aria-label={t('pk.planner.partsHelp')}>
              <span />
              {WEEKDAYS.map((d) => (
                <span key={d} className="pk-pl-parts-day">
                  {weekdayShort(addDays(startOfWeek(today), d - 1))}
                </span>
              ))}
              {PARTS.map((p) => (
                <PartRow
                  key={p}
                  label={t(PART_KEY[p])}
                  values={WEEKDAYS.map((d) => parts[d]?.includes(p) ?? false)}
                  onToggle={(index) =>
                    setParts((all) => {
                      const d = WEEKDAYS[index];
                      const list = all[d] ?? [];
                      return { ...all, [d]: list.includes(p) ? list.filter((x) => x !== p) : [...list, p] };
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="pk-form">
              <Field label={t('pk.common.date')}>
                <input className="pk-input" type="date" value={date} min={dateKey(today)} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <div className="pk-pl-items" data-feature="b.multi">
          {items.map((item, n) => {
            const machines = EQUIPMENT.filter((m) => m.locationId === location && m.treatments.includes(item.treatment));
            return (
              <div key={n} className="pk-pl-item">
                <span className="pk-pl-item-n">{n + 1}</span>
                <Field label={t('pk.common.treatment')}>
                  <select
                    className="pk-input"
                    value={item.treatment}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((x, i) =>
                          i === n ? { treatment: e.target.value as TreatmentId, minutes: treatmentById(e.target.value as TreatmentId).minutes } : x,
                        ),
                      )
                    }
                  >
                    {TREATMENTS.map((x) => (
                      <option key={x.id} value={x.id}>
                        {text(x.name)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('pk.planner.duration')}>
                  <select
                    className="pk-input"
                    value={item.minutes}
                    onChange={(e) => setItems((list) => list.map((x, i) => (i === n ? { ...x, minutes: Number(e.target.value) } : x)))}
                  >
                    {[15, 30, 45, 60, 75, 90, 105, 120].map((m) => (
                      <option key={m} value={m}>
                        {t('pk.common.minutes', { n: m })}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="pk-field">
                  <span className="pk-field-label">{t('pk.planner.equipment')}</span>
                  <span className="pk-pl-machines">
                    {machines.length ? (
                      machines.map((m) => (
                        <Chip key={m.id} tone="brand" icon="device">
                          {m.name}
                        </Chip>
                      ))
                    ) : (
                      <Chip tone="outline">{t('pk.planner.noEquipment')}</Chip>
                    )}
                  </span>
                </div>
                {n > 0 ? (
                  <button className="icon-button small" onClick={() => setItems((list) => list.filter((_, i) => i !== n))} aria-label={t('pk.planner.remove')}>
                    <PkIcon name="close" size={16} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <div className="pk-row pk-row--between">
            <button
              className="btn btn-small btn-ghost"
              onClick={() => setItems((list) => [...list, { treatment: 'peel', minutes: treatmentById('peel').minutes }])}
              disabled={items.length >= 3}
            >
              <PkIcon name="plus" size={14} />
              {t('pk.planner.addTreatment')}
            </button>
            <small className="pk-muted">{t('pk.planner.backToBack')}</small>
          </div>
        </div>

        <div className="pk-pl-results" data-feature="b.gap b.dates">
          <div className="pk-row pk-row--between">
            <Seg
              label={t('pk.planner.order')}
              value={order}
              onChange={setOrder}
              options={[
                { value: 'date', label: t('pk.planner.byDateOrder'), icon: 'calendar' },
                { value: 'room', label: t('pk.planner.byRoomOrder'), icon: 'grid' },
              ]}
            />
            <span className="pk-muted pk-small">{t('pk.planner.results', { n: result.options.length })}</span>
          </div>
          {result.excluded ? (
            <p className="pk-pl-note">
              <PkIcon name="info" size={15} />
              {t('pk.planner.excluded', { n: result.excluded })}
            </p>
          ) : null}
          {sorted.length ? (
            <>
              <TableWrap label={t('pk.planner.results', { n: sorted.length })}>
                <table className="pk-table pk-pl-table">
                  <thead>
                    <tr>
                      <th aria-label={t('pk.common.add')} />
                      <th>{t('pk.planner.col.when')}</th>
                      <th>{t('pk.planner.col.time')}</th>
                      <th>{t('pk.planner.col.who')}</th>
                      <th>{t('pk.planner.col.room')}</th>
                      <th>{t('pk.planner.col.machine')}</th>
                      <th title={t('pk.planner.pos.title')}>{t('pk.planner.col.pos')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((o) => (
                      <OptionRow
                        key={o.id}
                        option={o}
                        equipment={equipment}
                        checked={picked.has(o.id)}
                        onCheck={(on) =>
                          setPicked((s) => {
                            const next = new Set(s);
                            if (on) next.add(o.id);
                            else next.delete(o.id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              <div className="pk-row pk-row--between pk-pl-actions">
                {sorted.length > shown.length ? (
                  <button className="btn btn-small btn-ghost" onClick={() => setLimit((n) => n + 14)}>
                    {t('pk.planner.showMore')}
                  </button>
                ) : (
                  <span />
                )}
                <span className="pk-row">
                  <small className="pk-muted">{t('pk.planner.pick')}</small>
                  <button className="btn btn-primary" disabled={!picked.size} onClick={book}>
                    <PkIcon name="calendar" size={15} />
                    {t('pk.planner.book', { n: picked.size })}
                  </button>
                </span>
              </div>
            </>
          ) : (
            <p className="pk-empty">{t('pk.planner.none')}</p>
          )}
          <ul className="pk-pl-poslegend" aria-label={t('pk.planner.pos.title')}>
            {(['float', 'before', 'fill', 'after'] as Pos[]).map((p) => (
              <li key={p}>
                <PosMark pos={p} />
                {t(`pk.planner.pos.${p}`)}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="span-4 pk-stack">
        <Card eyebrow={t('pk.planner.strict.eyebrow')} title={t('pk.planner.strict.title')} help={t('pk.planner.strict.help')} feature="b.strict">
          {AGENDAS.map((a) => (
            <Toggle
              key={a.id}
              label={`${t('pk.agenda.room', { n: a.index + 1 })} · ${a.staff.name}`}
              hint={cityOf(a.locationId)}
              checked={strict.includes(a.id)}
              onChange={(on) => {
                setStrict((list) => (on ? [...list, a.id] : list.filter((x) => x !== a.id)));
                demo(
                  t('pk.planner.strict.changed', {
                    room: `${t('pk.agenda.room', { n: a.index + 1 })} (${a.staff.name})`,
                    state: t(on ? 'pk.planner.strict.stateOn' : 'pk.planner.strict.stateOff'),
                  }),
                );
              }}
            />
          ))}
        </Card>

        <Card eyebrow={t('pk.planner.planned.eyebrow')} title={t('pk.planner.planned.title')} help={t('pk.planner.planned.help')} feature="b.move">
          {planned.length ? (
            <ul className="pk-list pk-pl-planned">
              {planned.slice(0, 6).map((p) => {
                const day = new Date(`${p.day}T00:00`);
                const a = findAppt(p.id, day, agenda);
                if (!a)
                  return (
                    <li key={p.id} className="pk-muted pk-small">
                      {t('pk.planner.planned.gone')}
                    </li>
                  );
                const held = reservations(dayAppts(day, agenda), equipment, day, exceptions).get(a.id);
                const machine = machineName(held?.machine ?? null, equipment);
                return (
                  <li key={p.id}>
                    <span className="pk-pl-planned-text">
                      <strong>
                        {a.client} · {text(a.treatment.name)}
                      </strong>
                      <span>
                        {dateShort(a.start)} · {clock(a.start)}–{clock(a.end)} · {staffById(a.col).name}
                      </span>
                      <span className="pk-row">
                        {machine ? (
                          <Chip tone={p.followed ? 'good' : 'brand'} icon="device">
                            {machine}
                          </Chip>
                        ) : (
                          <Chip tone="outline">{t('pk.planner.noEquipment')}</Chip>
                        )}
                        {p.followed ? <small className="pk-pl-followed">{t('pk.planner.planned.followed')}</small> : null}
                      </span>
                    </span>
                    <button className="btn btn-small btn-ghost" onClick={() => setMoving(p)}>
                      <PkIcon name="swap" size={14} />
                      {t('pk.planner.planned.move')}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pk-empty">{t('pk.planner.planned.empty')}</p>
          )}
        </Card>
      </div>

      {moving ? (
        <MoveModal
          planned={moving}
          onClose={() => setMoving(null)}
          onMove={(option, machine) => {
            const day = new Date(`${moving.day}T00:00`);
            const a = findAppt(moving.id, day, agenda);
            if (!a) return;
            const newId = `${moving.id.split('-v')[0]}-v${Date.now() % 100000}`;
            const sameDayMove = dateKey(option.start) === moving.day;
            setAgenda((s) => rescheduleAppt(s, a, option.start, option.staff, newId));
            setPlanned((list) =>
              list.map((x) => (x.id === moving.id ? { id: sameDayMove ? x.id : newId, day: dateKey(option.start), followed: true } : x)),
            );
            setMoving(null);
            demo(t('pk.planner.planned.moved', { day: { date: option.start }, time: option.start, machine: machine ?? '—' }));
          }}
        />
      ) : null}
    </div>
  );
}

function PartRow({ label, values, onToggle }: { label: string; values: boolean[]; onToggle: (index: number) => void }) {
  return (
    <>
      <span className="pk-pl-parts-label">{label}</span>
      {values.map((on, i) => (
        <button key={i} className={`pk-pl-part ${on ? 'is-on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onToggle(i)}>
          {on ? <PkIcon name="check" size={13} stroke={2.4} /> : null}
        </button>
      ))}
    </>
  );
}

function OptionRow({ option, equipment, checked, onCheck }: { option: PlanOption; equipment: EquipmentState[]; checked: boolean; onCheck: (on: boolean) => void }) {
  const { t, weekdayShort, dayMonth, clock } = useI18n();
  const { today } = usePraktijk();
  const staff = staffById(option.staff);
  const machines = option.machines.map((m) => machineName(m, equipment)).filter(Boolean) as string[];
  return (
    <tr aria-selected={checked} onClick={() => onCheck(!checked)} className="pk-pl-row">
      <td onClick={(e) => e.stopPropagation()}>
        <Check checked={checked} onChange={onCheck} label={<span className="pk-pl-sr">{t('pk.common.add')}</span>} />
      </td>
      <td className="nowrap">
        <span className="pk-pl-wd">{weekdayShort(option.start)}</span> {dayMonth(option.start, today)}
      </td>
      <td className="nowrap pk-num">
        {clock(option.start)}–{clock(option.end)}
      </td>
      <td>
        <span className="pk-pl-who">
          <Avatar staff={staff} size={22} />
          {staff.name}
        </span>
      </td>
      <td className="nowrap">{t('pk.agenda.room', { n: option.room })}</td>
      <td>
        {machines.length ? (
          <span className="pk-row">
            {machines.join(' + ')}
            {option.clash ? (
              <Chip tone="warn" icon="warning">
                {t('pk.planner.machineBusy')}
              </Chip>
            ) : null}
          </span>
        ) : (
          <span className="pk-muted">—</span>
        )}
      </td>
      <td>
        <PosMark pos={option.pos} />
      </td>
    </tr>
  );
}

/** Another moment for an appointment with a machine; its reservation goes along. */
function MoveModal({ planned, onClose, onMove }: { planned: Planned; onClose: () => void; onMove: (option: PlanOption, machine: string | null) => void }) {
  const { t, text, weekdayShort, dayMonth, clock } = useI18n();
  const { now, today } = usePraktijk();
  const { agenda, equipment, exceptions } = usePlannerState();
  const day = new Date(`${planned.day}T00:00`);
  const a = findAppt(planned.id, day, agenda);
  const [choice, setChoice] = useState<string | null>(null);
  const options = useMemo(() => {
    if (!a) return [];
    const minutes = (a.end.getTime() - a.start.getTime()) / 60000;
    return planOptions(
      { location: a.clinic, practitioner: a.col as SpecialistId, items: [{ treatment: a.treatment.id, minutes }], parts: null, date: null, from: now > today ? now : today, days: 14 },
      agenda,
      equipment,
      exceptions,
      AGENDAS.map((x) => x.id),
    )
      .options.filter((o) => o.start.getTime() !== a.start.getTime())
      .slice(0, 8);
  }, [planned.id]);
  const chosen = options.find((o) => o.id === choice);
  return (
    <Modal
      open
      title={t('pk.planner.planned.moveTitle', { client: a?.client ?? '' })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!chosen} onClick={() => chosen && onMove(chosen, machineName(chosen.machines[0], equipment))}>
            <PkIcon name="swap" size={15} />
            {t('pk.planner.planned.move')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.planner.planned.moveHelp')}</p>
      {a ? (
        <p className="pk-pl-moving">
          <strong>{text(a.treatment.name)}</strong> · {weekdayShort(a.start)} {dayMonth(a.start, today)} · {clock(a.start)}
        </p>
      ) : null}
      {options.length ? (
        <ul className="pk-pl-choices">
          {options.map((o) => (
            <li key={o.id}>
              <label className={`pk-pl-choice ${choice === o.id ? 'is-on' : ''}`}>
                <input type="radio" name="move" checked={choice === o.id} onChange={() => setChoice(o.id)} />
                <span className="pk-num">
                  {weekdayShort(o.start)} {dayMonth(o.start, today)} · {clock(o.start)}–{clock(o.end)}
                </span>
                <span className="pk-muted">{machineName(o.machines[0], equipment) ?? t('pk.planner.noEquipment')}</span>
                <PosMark pos={o.pos} />
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pk-empty">{t('pk.planner.planned.none')}</p>
      )}
    </Modal>
  );
}

/* ---------- Equipment register ---------- */

function EquipmentTab() {
  const { t, text, dateShort } = useI18n();
  const { demo } = usePraktijk();
  const { equipment, setEquipment } = usePlannerState();
  const [adding, setAdding] = useState(false);
  return (
    <Card
      eyebrow={t('pk.planner.eq.eyebrow')}
      title={t('pk.planner.eq.title')}
      help={t('pk.planner.eq.help')}
      feature="b.equipment"
      actions={
        <button className="btn btn-small btn-primary" onClick={() => setAdding(true)}>
          <PkIcon name="plus" size={14} />
          {t('pk.planner.eq.add')}
        </button>
      }
    >
      <TableWrap label={t('pk.planner.eq.title')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.planner.eq.name')}</th>
              <th>{t('pk.common.location')}</th>
              <th>{t('pk.planner.eq.treatments')}</th>
              <th>{t('pk.planner.eq.serial')}</th>
              <th>{t('pk.planner.eq.service')}</th>
              <th>{t('pk.common.status')}</th>
              <th aria-label={t('pk.common.edit')} />
            </tr>
          </thead>
          <tbody>
            {equipment.map((m) => (
              <tr key={m.id}>
                <td className="nowrap">
                  <span className="pk-pl-who">
                    <span className="pk-pl-dev">
                      <PkIcon name="device" size={15} />
                    </span>
                    <strong>{m.name}</strong>
                  </span>
                </td>
                <td>{cityOf(m.locationId)}</td>
                <td className="pk-pl-for">{m.treatments.map((id) => text(treatmentById(id).name)).join(', ')}</td>
                <td>
                  <span className="pk-mono">{m.serial}</span>
                </td>
                <td className="nowrap">{dateShort(new Date(`${m.service}T00:00`))}</td>
                <td>
                  <Chip tone={m.maintenance ? 'warn' : 'good'}>{m.maintenance ? t('pk.planner.eq.maintenance') : t('pk.planner.eq.inUse')}</Chip>
                </td>
                <td className="end">
                  <button
                    className="btn btn-small btn-ghost"
                    onClick={() => {
                      setEquipment((list) => list.map((x) => (x.id === m.id ? { ...x, maintenance: !x.maintenance } : x)));
                      demo(t('pk.planner.eq.toggled', { name: m.name, state: t(m.maintenance ? 'pk.planner.eq.inUse' : 'pk.planner.eq.maintenance') }));
                    }}
                  >
                    {m.maintenance ? t('pk.planner.eq.back') : t('pk.planner.eq.toMaintenance')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {adding ? (
        <AddEquipmentModal
          onClose={() => setAdding(false)}
          onSave={(m) => {
            setEquipment((list) => [...list, m]);
            setAdding(false);
            demo(t('pk.planner.eq.added', { name: m.name }));
          }}
        />
      ) : null}
    </Card>
  );
}

function AddEquipmentModal({ onClose, onSave }: { onClose: () => void; onSave: (m: EquipmentState) => void }) {
  const { t, text } = useI18n();
  const { today } = usePraktijk();
  const [name, setName] = useState('');
  const [location, setLocation] = useState<LocationId>('nijmegen');
  const [serial, setSerial] = useState('');
  const [service, setService] = useState(dateKey(addDays(today, 180)));
  const [treatments, setTreatments] = useState<TreatmentId[]>(['laser']);
  const [error, setError] = useState(false);
  return (
    <Modal
      open
      title={t('pk.planner.eq.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!name.trim()) {
                setError(true);
                return;
              }
              onSave({
                id: `new-${Date.now()}` as EquipmentId,
                name: name.trim(),
                locationId: location,
                treatments,
                serial: serial.trim() || '—',
                service,
                maintenance: false,
              });
            }}
          >
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.planner.eq.name')} hint={error ? t('pk.planner.eq.needName') : undefined}>
          <input className="pk-input" value={name} aria-invalid={error} onChange={(e) => setName(e.target.value)} placeholder="Diodelaser 3" />
        </Field>
        <Field label={t('pk.common.location')}>
          <select className="pk-input" value={location} onChange={(e) => setLocation(e.target.value as LocationId)}>
            {LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.planner.eq.serial')}>
          <input className="pk-input" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="DL-2400" />
        </Field>
        <Field label={t('pk.planner.eq.service')}>
          <input className="pk-input" type="date" value={service} onChange={(e) => setService(e.target.value)} />
        </Field>
      </div>
      <p className="pk-field-label pk-pl-checks-label">{t('pk.planner.eq.treatmentsLabel')}</p>
      <div className="pk-pl-checks">
        {TREATMENTS.filter((x) => x.category !== 'consult').map((x) => (
          <Check
            key={x.id}
            label={text(x.name)}
            checked={treatments.includes(x.id)}
            onChange={(on) => setTreatments((list) => (on ? [...list, x.id] : list.filter((y) => y !== x.id)))}
          />
        ))}
      </div>
    </Modal>
  );
}

/* ---------- Availability ---------- */

const KINDS: Exception['kind'][] = ['holiday', 'course', 'sick', 'service'];

function AvailabilityTab() {
  const { t, weekdayShort, dayMonth, dateShort, pct } = useI18n();
  const { today, demo } = usePraktijk();
  const { agenda, equipment, exceptions, setExceptions } = usePlannerState();
  const [show, setShow] = useState<'staff' | 'machines'>('staff');
  const [monday, setMonday] = useState(startOfWeek(today));
  const [adding, setAdding] = useState(false);
  const days = WEEKDAYS.map((d) => addDays(monday, d - 1));
  const nameOf = (who: string) => STAFF.find((s) => s.id === who)?.name ?? equipment.find((m) => m.id === who)?.name ?? who;

  return (
    <div className="pk-grid">
      <Card
        className="span-8"
        eyebrow={t('pk.planner.av.eyebrow')}
        title={t('pk.planner.av.title')}
        help={t('pk.planner.av.help')}
        feature="b.availability"
        actions={
          <Seg
            label={t('pk.planner.av.show')}
            value={show}
            onChange={setShow}
            options={[
              { value: 'staff', label: t('pk.planner.av.staff'), icon: 'users' },
              { value: 'machines', label: t('pk.planner.av.machines'), icon: 'device' },
            ]}
          />
        }
      >
        <div className="pk-row pk-pl-weeknav">
          <button className="icon-button small pk-pl-step" onClick={() => setMonday((d) => addDays(d, -7))} aria-label={t('pk.agenda.prev')}>
            <span className="pk-flip">
              <PkIcon name="chevronStart" size={18} />
            </span>
          </button>
          <strong>{t('pk.planner.av.weekOf', { date: dayMonth(monday, today) })}</strong>
          <button className="icon-button small pk-pl-step" onClick={() => setMonday((d) => addDays(d, 7))} aria-label={t('pk.agenda.next')}>
            <span className="pk-flip">
              <PkIcon name="chevronEnd" size={18} />
            </span>
          </button>
        </div>
        <TableWrap label={t('pk.planner.av.title')}>
          <table className="pk-table pk-pl-av">
            <thead>
              <tr>
                <th>{show === 'staff' ? t('pk.planner.av.staff') : t('pk.planner.av.machines')}</th>
                {days.map((d) => (
                  <th key={dateKey(d)}>
                    {weekdayShort(d)} {d.getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {show === 'staff'
                ? STAFF.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="pk-pl-who">
                          <Avatar staff={s} size={24} />
                          <span>
                            <strong>{s.name}</strong>
                            <small className="pk-muted"> · {cityOf(s.locationId)}</small>
                          </span>
                        </span>
                      </td>
                      {days.map((d) => {
                        const hours = openingHours(d, s.locationId);
                        const exception = exceptions.find((x) => x.who === s.id && excepted(s.id, d, [x]));
                        return (
                          <td key={dateKey(d)} className="pk-pl-cell">
                            {exception ? (
                              <Chip tone="warn">{t(`pk.planner.av.k.${exception.kind}`)}</Chip>
                            ) : !hours ? (
                              <span className="pk-pl-dim">{t('pk.planner.av.closed')}</span>
                            ) : !s.days.includes(d.getDay()) ? (
                              <span className="pk-pl-dim">{t('pk.planner.av.off')}</span>
                            ) : (
                              <span className="pk-pl-hours">
                                {hours.open}–{hours.close}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                : equipment.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="pk-pl-who">
                          <span className="pk-pl-dev">
                            <PkIcon name="device" size={15} />
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small className="pk-muted"> · {cityOf(m.locationId)}</small>
                          </span>
                        </span>
                      </td>
                      {days.map((d) => {
                        const hours = openingHours(d, m.locationId);
                        const exception = exceptions.find((x) => x.who === m.id && excepted(m.id, d, [x]));
                        if (m.maintenance || exception)
                          return (
                            <td key={dateKey(d)} className="pk-pl-cell">
                              <Chip tone="warn">{t(exception ? `pk.planner.av.k.${exception.kind}` : 'pk.planner.eq.maintenance')}</Chip>
                            </td>
                          );
                        if (!hours)
                          return (
                            <td key={dateKey(d)} className="pk-pl-cell">
                              <span className="pk-pl-dim">{t('pk.planner.av.closed')}</span>
                            </td>
                          );
                        const list = dayAppts(d, agenda);
                        const held = reservations(list, equipment, d, exceptions);
                        const used = list.filter((a) => held.get(a.id)?.machine === m.id).reduce((sum, a) => sum + (a.end.getTime() - a.start.getTime()) / 60000, 0);
                        const share = used / ((hours.close - hours.open) * 60);
                        return (
                          <td key={dateKey(d)} className="pk-pl-cell">
                            <span className="pk-pl-hours">
                              {hours.open}–{hours.close}
                            </span>
                            <Bar value={share} tone={share > 0.8 ? 'bad' : 'brand'} />
                            <small className="pk-muted">{t('pk.planner.av.reserved', { pct: pct(share) })}</small>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        className="span-4"
        eyebrow={t('pk.planner.av.exceptions')}
        title={t('pk.planner.av.exceptionsTitle')}
        actions={
          <button className="btn btn-small btn-primary" onClick={() => setAdding(true)}>
            <PkIcon name="plus" size={14} />
            {t('pk.planner.av.add')}
          </button>
        }
      >
        {exceptions.length ? (
          <ul className="pk-list">
            {exceptions.map((x) => (
              <li key={x.id}>
                <Chip tone="warn">{t(`pk.planner.av.k.${x.kind}`)}</Chip>
                <span className="pk-pl-planned-text">
                  <strong>{nameOf(x.who)}</strong>
                  <span>{startOfDay(x.from).getTime() === startOfDay(x.to).getTime() ? dateShort(x.from) : `${dateShort(x.from)} – ${dateShort(x.to)}`}</span>
                </span>
                <button
                  className="icon-button small"
                  aria-label={t('pk.common.delete')}
                  onClick={() => {
                    setExceptions((list) => list.filter((y) => y.id !== x.id));
                    demo(t('pk.planner.av.removed'));
                  }}
                >
                  <PkIcon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pk-empty">{t('pk.planner.av.none')}</p>
        )}
      </Card>

      {adding ? (
        <ExceptionModal
          equipment={equipment}
          onClose={() => setAdding(false)}
          onSave={(x) => {
            setExceptions((list) => [...list, x]);
            setAdding(false);
            demo(t('pk.planner.av.added'));
          }}
        />
      ) : null}
    </div>
  );
}

function ExceptionModal({ equipment, onClose, onSave }: { equipment: EquipmentState[]; onClose: () => void; onSave: (x: Exception) => void }) {
  const { t } = useI18n();
  const { today } = usePraktijk();
  const [who, setWho] = useState<string>('maud');
  const [kind, setKind] = useState<Exception['kind']>('holiday');
  const [from, setFrom] = useState(dateKey(addDays(today, 7)));
  const [to, setTo] = useState(dateKey(addDays(today, 9)));
  const parse = (v: string) => new Date(`${v}T00:00`);
  return (
    <Modal
      open
      title={t('pk.planner.av.addTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              onSave({ id: `x-${Date.now()}`, who: who as Exception['who'], kind, from: parse(from), to: parse(to) < parse(from) ? parse(from) : parse(to) })
            }
          >
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.planner.av.who')}>
          <select className="pk-input" value={who} onChange={(e) => setWho(e.target.value)}>
            <optgroup label={t('pk.planner.av.staff')}>
              {STAFF.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('pk.planner.av.machines')}>
              {equipment.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label={t('pk.planner.av.kind')}>
          <select className="pk-input" value={kind} onChange={(e) => setKind(e.target.value as Exception['kind'])}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`pk.planner.av.k.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.planner.av.from')}>
          <input className="pk-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('pk.planner.av.to')}>
          <input className="pk-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- Occupancy ---------- */

function OccupancyTab() {
  const { t, dayLong, pct } = useI18n();
  const { today } = usePraktijk();
  const { agenda, equipment, exceptions } = usePlannerState();
  const [day, setDay] = useState(today);
  const list = dayAppts(day, agenda);
  const held = reservations(list, equipment, day, exceptions);
  const decimal = useDecimal();
  const hours1 = (minutes: number) => decimal(minutes / 60);

  const staffRows = STAFF.filter((s) => s.role !== 'reception').map((s) => {
    const hours = openingHours(day, s.locationId);
    const scheduled = hours && s.days.includes(day.getDay()) && !excepted(s.id, day, exceptions) ? (hours.close - hours.open) * 60 : 0;
    const booked = list.filter((a) => a.col === s.id).reduce((sum, a) => sum + (a.end.getTime() - a.start.getTime()) / 60000, 0);
    return { s, scheduled, booked, closed: !hours };
  });
  const teamShare = staffRows.reduce((a, r) => a + r.booked, 0) / Math.max(1, staffRows.reduce((a, r) => a + r.scheduled, 0));

  return (
    <Card
      eyebrow={t('pk.planner.occ.eyebrow')}
      title={t('pk.planner.occ.title')}
      help={t('pk.planner.occ.help')}
      feature="b.occupancy"
      actions={
        <div className="pk-row">
          <button className="icon-button small pk-pl-step" onClick={() => setDay((d) => addDays(d, -1))} aria-label={t('pk.agenda.prev')}>
            <span className="pk-flip">
              <PkIcon name="chevronStart" size={18} />
            </span>
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setDay(today)}>
            {t('pk.common.today')}
          </button>
          <button className="icon-button small pk-pl-step" onClick={() => setDay((d) => addDays(d, 1))} aria-label={t('pk.agenda.next')}>
            <span className="pk-flip">
              <PkIcon name="chevronEnd" size={18} />
            </span>
          </button>
        </div>
      }
    >
      <p className="pk-pl-day">
        {dayLong(day)} · <span className="pk-muted">{t('pk.planner.occ.total', { pct: pct(teamShare) })}</span>
      </p>
      <div className="pk-grid">
        <div className="span-6">
          <h3 className="pk-subtitle">{t('pk.planner.occ.staff')}</h3>
          <ul className="pk-list pk-pl-occ">
            {staffRows.map(({ s, scheduled, booked, closed }) => (
              <li key={s.id}>
                <Avatar staff={s} size={28} />
                <span className="pk-pl-occ-text">
                  <span className="pk-row pk-row--between">
                    <strong>{s.name}</strong>
                    <small className="pk-muted">
                      {scheduled
                        ? t('pk.planner.occ.hours', { booked: hours1(booked), open: hours1(scheduled) })
                        : closed
                          ? t('pk.planner.occ.closed')
                          : t('pk.planner.occ.notScheduled')}
                    </small>
                  </span>
                  <Bar value={scheduled ? booked / scheduled : 0} tone={scheduled && booked / scheduled > 0.85 ? 'now' : 'brand'} />
                </span>
                <b className="pk-pl-occ-pct">{scheduled ? pct(booked / scheduled) : '—'}</b>
              </li>
            ))}
          </ul>
        </div>
        <div className="span-6">
          <h3 className="pk-subtitle">{t('pk.planner.occ.machines')}</h3>
          <ul className="pk-list pk-pl-occ">
            {equipment.map((m) => {
              const hours = openingHours(day, m.locationId);
              const open = hours && !m.maintenance && !excepted(m.id, day, exceptions) ? (hours.close - hours.open) * 60 : 0;
              const used = list.filter((a) => held.get(a.id)?.machine === m.id).reduce((sum, a) => sum + (a.end.getTime() - a.start.getTime()) / 60000, 0);
              return (
                <li key={m.id}>
                  <span className="pk-pl-dev">
                    <PkIcon name="device" size={15} />
                  </span>
                  <span className="pk-pl-occ-text">
                    <span className="pk-row pk-row--between">
                      <strong>
                        {m.name} <small className="pk-muted">· {cityOf(m.locationId)}</small>
                      </strong>
                      <small className="pk-muted">
                        {open
                          ? t('pk.planner.occ.hours', { booked: hours1(used), open: hours1(open) })
                          : m.maintenance
                            ? t('pk.planner.eq.maintenance')
                            : !hours
                              ? t('pk.planner.occ.closed')
                              : t('pk.planner.av.k.service')}
                      </small>
                    </span>
                    <Bar value={open ? used / open : 0} tone={open && used / open > 0.85 ? 'bad' : 'brand'} />
                  </span>
                  <b className="pk-pl-occ-pct">{open ? pct(used / open) : '—'}</b>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}
