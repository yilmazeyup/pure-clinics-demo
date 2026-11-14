import { dateKey, LOCATIONS, openingHours, TREATMENTS, treatmentById, type LocationId, type TreatmentId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import {
  atMinutes,
  BLOCK_KINDS,
  blocksOn,
  columnFree,
  dayAppts,
  REPEATS,
  type AgAppt,
  type AgendaState,
  type ApptStatus,
  type BlockItem,
  type BlockKind,
  type BlockRule,
  type OnlineBooking,
  type Repeat,
} from '../../data/agenda';
import { cityOf, conditionById, dmy, practiceClients, STAFF, staffById, type PracticeClient, type StaffId } from '../../data/core';
import { PkIcon } from '../../icons';
import { Field, Kv, Modal, TableWrap, useMoney } from '../../kit';
import { hm } from './Grid';
import { CalendarCross, StatusMark } from './marks';

const parseDay = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Quarter-hour start times inside a location's opening hours on a day. */
function quarterTimes(day: Date, location: LocationId): number[] {
  const hours = openingHours(day, location);
  if (!hours) return [];
  return Array.from({ length: (hours.close - hours.open) * 4 }, (_, i) => hours.open * 60 + i * 15);
}

/* ---------- New appointment ---------- */

export type BookDraft = { day: Date; minutes: number; col: StaffId; clinic: LocationId };

/** Book with client, episode, location and employee; the end time follows from the treatment or the episode. */
export function BookModal({
  draft,
  state,
  onClose,
  onSave,
}: {
  draft: BookDraft;
  state: AgendaState;
  onClose: () => void;
  onSave: (appt: AgAppt, note: string, client: PracticeClient, mail: boolean) => void;
}) {
  const { t, text } = useI18n();
  const { today } = usePraktijk();
  const clients = practiceClients(today);
  const [query, setQuery] = useState('');
  const [client, setClient] = useState<PracticeClient | null>(null);
  const [episodeId, setEpisodeId] = useState('');
  const [treatment, setTreatment] = useState<TreatmentId>(staffById(draft.col).categories.includes('removal') ? 'laser' : 'consult');
  const [location, setLocation] = useState<LocationId>(draft.clinic);
  const [day, setDay] = useState(draft.day);
  const [minutes, setMinutes] = useState(draft.minutes);
  const [staffId, setStaffId] = useState<StaffId>(draft.col);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const episode = client?.episodes.find((e) => e.id === episodeId) ?? null;
  const length = episode?.minutes ?? treatmentById(treatment).minutes;
  const start = atMinutes(day, minutes);
  const end = new Date(start.getTime() + length * 60000);
  const appts = dayAppts(day, state);
  const blocks = blocksOn(day, state.rules);
  const category = treatmentById(treatment).category;
  const team = STAFF.filter((s) => s.locationId === location && s.role !== 'reception' && s.categories.includes(category) && s.days.includes(day.getDay()));
  const freeOf = (id: StaffId) => columnFree(id, start, end, appts, blocks);
  const times = quarterTimes(day, location);
  // The chosen employee, or the first free one who gives this treatment there that day.
  const employee = team.some((s) => s.id === staffId) ? staffId : (team.find((s) => freeOf(s.id)) ?? team[0])?.id;

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => `${c.first} ${c.last}`.toLowerCase().includes(q) || dmy(c.birth).includes(q)).slice(0, 6);
  }, [query, clients]);

  const choose = (c: PracticeClient) => {
    setClient(c);
    setQuery('');
    const open = c.episodes.find((e) => !e.closed);
    setEpisodeId(open?.id ?? '');
    if (open) setTreatment(open.treatment);
    setError('');
  };

  const save = (mail: boolean) => {
    if (!client) {
      setError(t('pk.agenda.book.pickClient'));
      return;
    }
    if (!employee || !freeOf(employee)) {
      setError(t('pk.agenda.book.noFree'));
      return;
    }
    const appt: AgAppt = {
      id: `new-${Date.now()}`,
      clinic: location,
      col: employee,
      treatment: treatmentById(treatment),
      client: client.short,
      start,
      end,
      price: episode?.price ?? treatmentById(treatment).priceFrom,
      online: false,
      noteKey: null,
      added: true,
    };
    onSave(appt, note.trim(), client, mail);
  };

  return (
    <Modal
      open
      wide
      title={t('pk.agenda.book.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-ghost" onClick={() => save(false)}>
            {t('pk.common.save')}
          </button>
          <button className="btn btn-primary" onClick={() => save(true)} data-feature="a.mail">
            <PkIcon name="send" size={15} />
            {t('pk.agenda.book.saveMail')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.common.client')} wide>
          {client ? (
            <div className="pk-ag-chosen">
              <span>
                <strong>
                  {client.first} {client.last}
                </strong>
                <small className="pk-muted"> · {dmy(client.birth)} · {client.city}</small>
              </span>
              <button className="btn btn-small btn-ghost" onClick={() => setClient(null)}>
                {t('pk.common.edit')}
              </button>
            </div>
          ) : (
            <div className="pk-ag-finder">
              <span className="pk-search">
                <PkIcon name="search" size={16} />
                <input className="pk-input" value={query} placeholder={t('pk.agenda.book.search')} onChange={(e) => setQuery(e.target.value)} autoFocus />
              </span>
              {found.length ? (
                <ul className="pk-ag-found">
                  {found.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => choose(c)}>
                        <strong>
                          {c.first} {c.last}
                        </strong>
                        <span>
                          {dmy(c.birth)} · {c.city}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Field>
        <Field label={t('pk.agenda.book.episode')}>
          <select
            className="pk-input"
            value={episodeId}
            disabled={!client}
            onChange={(e) => {
              setEpisodeId(e.target.value);
              const ep = client?.episodes.find((x) => x.id === e.target.value);
              setTreatment(ep ? ep.treatment : 'consult');
            }}
          >
            <option value="">{t('pk.agenda.book.newEpisode')}</option>
            {client?.episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {t(conditionById(ep.condition).label)} · {ep.zt}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.common.treatment')}>
          <select className="pk-input" value={treatment} onChange={(e) => setTreatment(e.target.value as TreatmentId)}>
            {TREATMENTS.map((x) => (
              <option key={x.id} value={x.id}>
                {text(x.name)}
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
        <Field label={t('pk.agenda.book.date')}>
          <input className="pk-input" type="date" value={dateKey(day)} onChange={(e) => e.target.value && setDay(parseDay(e.target.value))} />
        </Field>
        <Field label={t('pk.agenda.book.start')}>
          <select className="pk-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {(times.includes(minutes) ? times : [minutes, ...times]).map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.agenda.book.end')} hint={episode?.minutes ? t('pk.agenda.book.endEpisode', { n: length }) : t('pk.agenda.book.endHint', { n: length })}>
          <input className="pk-input pk-num" value={hm(minutes + length)} readOnly />
        </Field>
        <Field label={t('pk.common.employee')}>
          <select className="pk-input" value={employee ?? ''} onChange={(e) => setStaffId(e.target.value as StaffId)}>
            {team.length ? null : <option value="">—</option>}
            {team.map((s) => (
              <option key={s.id} value={s.id} disabled={!freeOf(s.id)}>
                {freeOf(s.id) ? s.name : t('pk.agenda.book.busyOption', { name: s.name })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.common.note')} hint={t('pk.agenda.book.noteHint')} wide>
          <textarea className="pk-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {error ? (
        <p className="pk-ag-error" role="alert">
          <PkIcon name="warning" size={15} />
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

/* ---------- Appointment details ---------- */

type DetailProps = {
  appt: AgAppt;
  status: ApptStatus;
  note: string;
  confirmable: boolean;
  onClose: () => void;
  onNote: (note: string) => void;
  onConfirm: () => void;
  onInvoice: () => void;
  onFile: () => void;
  onDelete: () => void;
  onMail: () => void;
};

export function DetailModal({ appt, status, note, confirmable, onClose, onNote, onConfirm, onInvoice, onFile, onDelete, onMail }: DetailProps) {
  const { t, text, dayLong, clock, eur } = useI18n();
  const [draft, setDraft] = useState(note);
  const staff = staffById(appt.col);
  return (
    <Modal
      open
      title={`${appt.client} · ${text(appt.treatment.name)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onDelete} data-feature="a.delete">
            <PkIcon name="trash" size={15} />
            {t('pk.common.delete')}
          </button>
          <button className="btn btn-ghost" onClick={onMail}>
            <PkIcon name="send" size={15} />
            {t('pk.agenda.detail.mail')}
          </button>
          <button className="btn btn-ghost" onClick={onFile}>
            <PkIcon name="user" size={15} />
            {t('pk.screen.dossier')}
          </button>
          {status === 'unconfirmed' && confirmable ? (
            <button className="btn btn-primary" onClick={onConfirm}>
              <PkIcon name="check" size={15} />
              {t('pk.common.confirm')}
            </button>
          ) : null}
          {status === 'client' ? (
            <button className="btn btn-primary" onClick={onInvoice}>
              <PkIcon name="euro" size={15} />
              {t('pk.agenda.detail.invoice')}
            </button>
          ) : null}
        </>
      }
    >
      <Kv
        rows={[
          [t('pk.agenda.detail.when'), `${dayLong(appt.start)} · ${clock(appt.start)}–${clock(appt.end)}`],
          [
            t('pk.agenda.detail.where'),
            `${cityOf(appt.clinic)} · ${staff.role === 'reception' ? t('pk.common.reception') : t('pk.agenda.room', { n: roomNumber(appt) })} · ${staff.name}`,
          ],
          [t('pk.common.price'), appt.price === 0 ? t('appt.free') : eur(appt.price)],
          [
            t('pk.common.status'),
            <span className="pk-ag-status-line">
              <StatusMark status={status} />
              {t(`pk.agenda.status.${status}`)}
            </span>,
          ],
          [t('pk.agenda.detail.how'), appt.online ? t('pk.agenda.detail.online') : t('pk.agenda.detail.inClinic')],
        ]}
      />
      <div className="pk-ag-note-edit" data-feature="a.note">
        <Field label={t('pk.common.note')} hint={t('pk.agenda.book.noteHint')}>
          <textarea className="pk-input" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <button className="btn btn-small btn-ghost" onClick={() => onNote(draft.trim())} disabled={draft.trim() === note}>
          {t('pk.common.save')}
        </button>
      </div>
    </Modal>
  );
}

const roomNumber = (a: AgAppt) => {
  const ids = STAFF.filter((s) => s.locationId === a.clinic && s.role !== 'reception').map((s) => s.id);
  return ids.indexOf(a.col) + 1;
};

/* ---------- Confirm ---------- */

export function ConfirmModal({ appt, onClose, onConfirm }: { appt: AgAppt; onClose: () => void; onConfirm: () => void }) {
  const { t, text, clock, eur } = useI18n();
  return (
    <Modal
      open
      title={t('pk.agenda.confirmTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <PkIcon name="check" size={15} />
            {t('pk.common.confirm')}
          </button>
        </>
      }
    >
      <p className="help">{t('pk.agenda.confirmHelp')}</p>
      <Kv
        rows={[
          [t('pk.common.client'), appt.client],
          [t('pk.common.treatment'), text(appt.treatment.name)],
          [t('pk.common.time'), `${clock(appt.start)}–${clock(appt.end)}`],
          [t('pk.common.employee'), staffById(appt.col).name],
          [t('pk.common.price'), appt.price === 0 ? t('appt.free') : eur(appt.price)],
        ]}
      />
    </Modal>
  );
}

/* ---------- Block without a client ---------- */

export type BlockDraft = { day: Date; minutes: number; col: StaffId };

export function BlockModal({ draft, onClose, onSave }: { draft: BlockDraft; onClose: () => void; onSave: (rule: BlockRule) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<BlockKind | 'own'>('meeting');
  const [own, setOwn] = useState('');
  const [col, setCol] = useState<StaffId>(draft.col);
  const [day, setDay] = useState(draft.day);
  const [from, setFrom] = useState(draft.minutes);
  const [to, setTo] = useState(draft.minutes + 60);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [until, setUntil] = useState('');
  const [error, setError] = useState('');
  const steps = Array.from({ length: (22 - 7) * 4 + 1 }, (_, i) => 7 * 60 + i * 15);
  const save = () => {
    if (to <= from) {
      setError(t('pk.agenda.block.badTime'));
      return;
    }
    if (kind === 'own' && !own.trim()) {
      setError(t('pk.agenda.block.ownPlaceholder'));
      return;
    }
    onSave({
      id: `r-${Date.now()}`,
      kind: kind === 'own' ? null : kind,
      title: kind === 'own' ? own.trim() : '',
      col,
      clinic: staffById(col).locationId,
      first: day,
      from,
      to,
      repeat,
      until: repeat !== 'none' && until ? parseDay(until) : null,
      skip: [],
    });
  };
  return (
    <Modal
      open
      title={t('pk.agenda.block.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={save}>
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.agenda.block.what')}>
          <select className="pk-input" value={kind} onChange={(e) => setKind(e.target.value as BlockKind | 'own')}>
            {BLOCK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`pk.agenda.block.k.${k}`)}
              </option>
            ))}
            <option value="own">{t('pk.agenda.block.own')}</option>
          </select>
        </Field>
        {kind === 'own' ? (
          <Field label={t('pk.agenda.block.own')}>
            <input className="pk-input" value={own} placeholder={t('pk.agenda.block.ownPlaceholder')} onChange={(e) => setOwn(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t('pk.agenda.block.who')}>
          <select className="pk-input" value={col} onChange={(e) => setCol(e.target.value as StaffId)}>
            {STAFF.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {cityOf(s.locationId)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.common.date')}>
          <input className="pk-input" type="date" value={dateKey(day)} onChange={(e) => e.target.value && setDay(parseDay(e.target.value))} />
        </Field>
        <Field label={t('pk.agenda.block.from')}>
          <select className="pk-input" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {steps.map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.agenda.block.to')}>
          <select className="pk-input" value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {steps.map((m) => (
              <option key={m} value={m}>
                {hm(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.agenda.block.repeat')}>
          <select className="pk-input" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {REPEATS.map((r) => (
              <option key={r} value={r}>
                {t(`pk.agenda.repeat.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        {repeat !== 'none' ? (
          <Field label={t('pk.agenda.block.until')} hint={t('pk.agenda.block.untilHint')}>
            <input className="pk-input" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        ) : null}
      </div>
      {error ? (
        <p className="pk-ag-error" role="alert">
          <PkIcon name="warning" size={15} />
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

export function BlockInfoModal({ block, onClose, onDeleteOne, onDeleteAll }: { block: BlockItem; onClose: () => void; onDeleteOne: () => void; onDeleteAll: () => void }) {
  const { t, dayLong, clock } = useI18n();
  const title = block.rule.kind ? t(`pk.agenda.block.k.${block.rule.kind}`) : block.rule.title;
  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          {block.rule.repeat !== 'none' ? (
            <button className="btn btn-ghost" onClick={onDeleteOne}>
              {t('pk.agenda.block.deleteOne')}
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={onDeleteAll}>
            <PkIcon name="trash" size={15} />
            {block.rule.repeat !== 'none' ? t('pk.agenda.block.deleteSeries') : t('pk.common.delete')}
          </button>
        </>
      }
    >
      <Kv
        rows={[
          [t('pk.agenda.detail.when'), `${dayLong(block.start)} · ${clock(block.start)}–${clock(block.end)}`],
          [t('pk.agenda.block.who'), `${staffById(block.col).name} · ${cityOf(block.clinic)}`],
          [t('pk.agenda.block.repeat'), t(`pk.agenda.repeat.${block.rule.repeat}`)],
        ]}
      />
    </Modal>
  );
}

/* ---------- Online bookings ---------- */

export function OnlineModal({ list, onClose }: { list: OnlineBooking[]; onClose: () => void }) {
  const { t, text, dateShort, clock } = useI18n();
  const money = useMoney();
  const shown = list.slice(0, 60);
  return (
    <Modal open wide title={t('pk.agenda.onlineTitle')} onClose={onClose}>
      <p className="help">{t('pk.agenda.onlineHelp')}</p>
      <TableWrap label={t('pk.agenda.onlineTitle')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.agenda.onlineBooked')}</th>
              <th>{t('pk.agenda.onlineFor')}</th>
              <th>{t('pk.common.client')}</th>
              <th>{t('pk.common.treatment')}</th>
              <th>{t('pk.common.location')}</th>
              <th className="end">{t('pk.common.price')}</th>
              <th aria-label={t('pk.common.status')} />
            </tr>
          </thead>
          <tbody>
            {shown.map(({ appt, bookedAt, changed }) => (
              <tr key={appt.id}>
                <td className="nowrap">
                  {dateShort(bookedAt)} · {clock(bookedAt)}
                </td>
                <td className="nowrap">
                  {dateShort(appt.start)} · {clock(appt.start)}
                </td>
                <td className="nowrap">{appt.client}</td>
                <td>{text(appt.treatment.name)}</td>
                <td>{cityOf(appt.clinic)}</td>
                <td className="end nowrap">{appt.price === 0 ? t('appt.free') : money(appt.price)}</td>
                <td>
                  {changed ? (
                    <span className={`pk-ag-changed ${changed}`} title={t(changed === 'moved' ? 'pk.agenda.onlineMoved' : 'pk.agenda.onlineDeleted')}>
                      <CalendarCross size={16} />
                      <span>{t(changed === 'moved' ? 'pk.agenda.onlineMoved' : 'pk.agenda.onlineDeleted')}</span>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {list.length > shown.length ? <p className="pk-muted pk-small pk-ag-more">{t('pk.agenda.onlineMore', { n: list.length - shown.length })}</p> : null}
    </Modal>
  );
}
