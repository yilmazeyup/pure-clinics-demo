import { addDays, startOfDay, treatmentById, type LocationId, type TreatmentId } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../../i18n';
import { usePraktijk, useShared, type ApptRef, type Detail } from '../context';
import { confirmable, dayAppts, reportFilled, seedAgenda, statusOf, type AgAppt, type AgendaState } from '../data/agenda';
import { totals, type Invoice } from '../data/billing';
import { ageOn, cityOf, clientById, clientFor, conditionById, insurerById, staffById, type PracticeClient } from '../data/core';
import { PkIcon, type PkIconName } from '../icons';
import { Avatar } from '../kit';
import { useBilling } from '../screens/billing/state';
import { useClients } from '../screens/clients/useClients';
import './details.css';

// One side panel for the whole module: click an appointment, a client or an invoice anywhere and its details slide in
// from the side. Inside it everything links on: the client of an appointment, that client's appointments and invoices.
// The back arrow walks the trail. Kept quiet on purpose: a title, a few lines, the actions at the bottom.

export function DetailPanel() {
  const { details, backDetail, closeDetail } = usePraktijk();
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const current = details[details.length - 1] ?? null;
  // Keep the last one on screen while the panel slides out.
  const [shown, setShown] = useState<Detail | null>(current);
  const open = current !== null;
  useEffect(() => {
    if (current) setShown(current);
    else {
      const id = window.setTimeout(() => setShown(null), 260);
      return () => window.clearTimeout(id);
    }
  }, [current]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    box.current?.querySelector('.pk-dt-body')?.scrollTo({ top: 0 });
  }, [current]);

  const host = document.querySelector('.app');
  if (!host || !shown) return null;
  return createPortal(
    <div className={`pk-dt-layer ${open ? 'is-open' : ''}`}>
      <div className="pk-dt-backdrop" onClick={closeDetail} aria-hidden="true" />
      <div ref={box} className="pk-dt" role="dialog" aria-modal="true" aria-label={t('pk.dt.label')} tabIndex={-1}>
        <div className="pk-dt-top">
          {details.length > 1 ? (
            <button type="button" className="pk-dt-icon" onClick={backDetail} aria-label={t('pk.common.back')}>
              <PkIcon name="chevronStart" size={20} />
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="pk-dt-icon" onClick={closeDetail} aria-label={t('pk.common.close')}>
            <PkIcon name="close" size={20} />
          </button>
        </div>
        {shown.kind === 'appt' ? <ApptView key={`a${shown.id}`} id={shown.id} day={shown.day} /> : null}
        {shown.kind === 'client' ? <ClientView key={`c${shown.id}`} id={shown.id} short={shown.short} clinic={shown.clinic} /> : null}
        {shown.kind === 'invoice' ? <InvoiceView key={`i${shown.id}`} id={shown.id} /> : null}
      </div>
    </div>,
    host,
  );
}

/* ---------- Building blocks ---------- */

function Head({ eyebrow, title, sub, chip }: { eyebrow: string; title: string; sub?: ReactNode; chip?: ReactNode }) {
  return (
    <header className="pk-dt-head">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {sub ? <p className="pk-dt-sub">{sub}</p> : null}
      {chip ? <div className="pk-dt-chips">{chip}</div> : null}
    </header>
  );
}

function Lines({ rows }: { rows: { icon: PkIconName; label: string; value: ReactNode }[] }) {
  return (
    <dl className="pk-dt-lines">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>
            <PkIcon name={r.icon} size={16} />
            {r.label}
          </dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="pk-dt-section">
      <h3>
        {title}
        {count !== undefined ? <small>{count}</small> : null}
      </h3>
      {children}
    </section>
  );
}

/** A tappable row in a list: a time or a date in front, two lines, and an arrow. */
function Row({ lead, title, sub, end, onClick, dim }: { lead: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; onClick: () => void; dim?: boolean }) {
  return (
    <li>
      <button type="button" className={`pk-dt-row ${dim ? 'is-dim' : ''}`} onClick={onClick}>
        <span className="pk-dt-row-lead">{lead}</span>
        <span className="pk-dt-row-text">
          <strong>{title}</strong>
          {sub ? <small>{sub}</small> : null}
        </span>
        {end ? <span className="pk-dt-row-end">{end}</span> : null}
        <PkIcon name="chevronEnd" size={16} />
      </button>
    </li>
  );
}

function Initials({ client, size = 48 }: { client: PracticeClient; size?: number }) {
  return (
    <span className="pk-dt-initials" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {client.first[0]}
      {client.last.replace(/^(de|van|van der|van den) /i, '')[0]}
    </span>
  );
}

function Foot({ children }: { children: ReactNode }) {
  return <div className="pk-dt-foot">{children}</div>;
}

/** A client as the register knows her now (with edits), else from the seeded world, else one met in the diary. */
function useClient(id: string, short?: string, clinic?: LocationId): PracticeClient | null {
  const { today } = usePraktijk();
  const { byId } = useClients();
  return byId(id) ?? clientById(id, today) ?? (short ? clientFor(short, clinic ?? 'nijmegen', today) : null);
}

/* ---------- Appointment ---------- */

function ApptView({ id, day }: { id: string; day: Date }) {
  const i18n = useI18n();
  const { t, text, dayLong, clock, eur } = i18n;
  const { now, today, go, demo, openDetail, closeDetail } = usePraktijk();
  const [state, setState] = useShared<AgendaState>('agenda', () => seedAgenda(today));
  const { byId } = useClients();
  const appt = useMemo(() => dayAppts(day, state).find((a) => a.id === id) ?? null, [day, state, id]);
  const typed = appt ? state.notes[appt.id] : undefined;
  const initialNote = appt ? (typed !== undefined ? typed : appt.noteKey ? t(appt.noteKey) : '') : '';
  const [note, setNote] = useState(initialNote);
  if (!appt) {
    return (
      <div className="pk-dt-body">
        <Head eyebrow={t('pk.dt.appt')} title={t('pk.dt.gone')} />
      </div>
    );
  }
  const met = clientFor(appt.client, appt.clinic, today);
  const client = byId(met.id) ?? met;
  const staff = staffById(appt.col);
  const status = statusOf(appt, now, state, today);
  const minutes = Math.round((appt.end.getTime() - appt.start.getTime()) / 60000);
  const report = reportFilled(appt, now, state);
  const ref: ApptRef = {
    id: appt.id,
    client: appt.client,
    clientId: client.id,
    treatment: appt.treatment.id,
    specialistId: appt.col as ApptRef['specialistId'],
    clinic: appt.clinic,
    start: appt.start,
    end: appt.end,
    price: appt.price,
  };
  const confirm = () => {
    setState((s) => ({ ...s, confirmed: [...s.confirmed, appt.id] }));
    demo(t('pk.agenda.confirmed', { client: appt.client, time: appt.start }));
  };
  const remove = () => {
    setState((s) => ({
      ...s,
      deleted: [...s.deleted, ...(s.added.some((a) => a.id === appt.id) ? [] : [appt.id])],
      added: s.added.filter((a) => a.id !== appt.id),
    }));
    closeDetail();
    demo(t('pk.agenda.detail.deleted', { client: appt.client }));
  };
  const saveNote = () => {
    setState((s) => ({ ...s, notes: { ...s.notes, [appt.id]: note.trim() } }));
    demo(t('pk.agenda.detail.noteSaved'));
  };

  return (
    <>
      <div className="pk-dt-body">
        <Head
          eyebrow={`${t('pk.dt.appt')} · ${dayLong(appt.start)}`}
          title={text(appt.treatment.name)}
          sub={
            <>
              <strong>
                {clock(appt.start)} – {clock(appt.end)}
              </strong>
              <span>{t('pk.dt.minutes', { n: minutes })}</span>
            </>
          }
          chip={
            <>
              <span className={`pk-dt-chip pk-dt-chip--${status}`}>{t(`pk.agenda.status.${status}`)}</span>
              {appt.online ? <span className="pk-dt-chip">{t('pk.agenda.detail.online')}</span> : null}
              {report ? <span className="pk-dt-chip">{t('pk.dt.reportDone')}</span> : null}
            </>
          }
        />

        <button type="button" className="pk-dt-person" onClick={() => openDetail({ kind: 'client', id: client.id, short: client.short, clinic: appt.clinic }, true)}>
          <Initials client={client} />
          <span className="pk-dt-person-text">
            <strong>
              {client.first} {client.last}
            </strong>
            <small>
              {t('pk.dt.age', { n: ageOn(client.birth, today) })} · {client.city}
            </small>
            {client.allergies.length ? (
              <em className="pk-dt-warn">
                <PkIcon name="warning" size={14} />
                {client.allergies.map((a) => t(`pk.dossier.allergy.${a}` as const)).join(', ')}
              </em>
            ) : null}
          </span>
          <PkIcon name="chevronEnd" size={18} />
        </button>

        <Lines
          rows={[
            {
              icon: 'user',
              label: t('pk.dt.with'),
              value: (
                <span className="pk-dt-staff">
                  <Avatar staff={staff} size={24} />
                  {staff.name}
                </span>
              ),
            },
            { icon: 'building', label: t('pk.common.location'), value: cityOf(appt.clinic) },
            { icon: 'euro', label: t('pk.common.price'), value: appt.price === 0 ? t('appt.free') : eur(appt.price) },
          ]}
        />

        <Section title={t('pk.common.note')}>
          <div className="pk-dt-note">
            <textarea rows={3} value={note} placeholder={t('pk.dt.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
            {note.trim() !== initialNote.trim() ? (
              <button type="button" className="btn btn-small btn-primary" onClick={saveNote}>
                {t('pk.common.save')}
              </button>
            ) : null}
          </div>
        </Section>
      </div>
      <Foot>
        {status === 'unconfirmed' && confirmable(appt, now) ? (
          <button type="button" className="btn btn-primary" onClick={confirm}>
            <PkIcon name="check" size={16} />
            {t('pk.common.confirm')}
          </button>
        ) : null}
        {status === 'client' ? (
          <button type="button" className="btn btn-primary" onClick={() => go('facturen', { appt: ref, feature: 'i.agenda' })}>
            <PkIcon name="euro" size={16} />
            {t('pk.agenda.detail.invoice')}
          </button>
        ) : null}
        {status === 'insurer' ? (
          <button type="button" className="btn btn-primary" onClick={() => go('declaraties', { appt: ref })}>
            <PkIcon name="shield" size={16} />
            {t('pk.dt.claim')}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={() => demo(t('pk.agenda.detail.mailed', { email: client.email }))}>
          <PkIcon name="send" size={16} />
          {t('pk.agenda.detail.mail')}
        </button>
        <button type="button" className="btn btn-ghost pk-dt-danger" onClick={remove}>
          <PkIcon name="trash" size={16} />
          {t('pk.common.delete')}
        </button>
      </Foot>
    </>
  );
}

/* ---------- Client ---------- */

function ClientView({ id, short, clinic }: { id: string; short?: string; clinic?: LocationId }) {
  const i18n = useI18n();
  const { t, text, clock, dateShort, monthYear, eur } = i18n;
  const { now, today, go, openDetail } = usePraktijk();
  const [state] = useShared<AgendaState>('agenda', () => seedAgenda(today));
  const { invoices } = useBilling();
  const client = useClient(id, short, clinic);

  // Twelve weeks around today in the shared diary, so moved and new appointments show here too.
  const visits = useMemo(() => {
    if (!client) return { coming: [] as AgAppt[], past: [] as AgAppt[] };
    const all: AgAppt[] = [];
    for (let d = -56; d <= 42; d++) for (const a of dayAppts(addDays(startOfDay(today), d), state)) if (a.client === client.short) all.push(a);
    return {
      coming: all.filter((a) => a.end > now).slice(0, 4),
      past: all.filter((a) => a.end <= now).reverse().slice(0, 4),
    };
  }, [client, state, today, now]);
  const bills = useMemo(() => (client ? invoices.filter((i) => i.clientId === client.id && i.status !== 'concept').sort((a, b) => b.date.getTime() - a.date.getTime()) : []), [client, invoices]);

  if (!client) {
    return (
      <div className="pk-dt-body">
        <Head eyebrow={t('pk.common.client')} title={t('pk.dt.gone')} />
      </div>
    );
  }
  const open = bills.reduce((s, b) => s + totals(b).open, 0);
  // Only real courses of treatment; a single visit is not a course.
  const episodes = client.episodes.filter((e) => !e.closed && e.sessions.total > 1);
  const visit = (a: AgAppt) => openDetail({ kind: 'appt', id: a.id, day: startOfDay(a.start) }, true);

  return (
    <>
      <div className="pk-dt-body">
        <header className="pk-dt-head pk-dt-head--person">
          <Initials client={client} size={64} />
          <div>
            <span className="eyebrow">
              {t('pk.common.client')} · {cityOf(client.locationId)}
            </span>
            <h2>
              {client.first} {client.last}
            </h2>
            <p className="pk-dt-sub">
              <span>{t('pk.dt.age', { n: ageOn(client.birth, today) })}</span>
              <span>{t('pk.dt.since', { date: monthYear(client.since) })}</span>
            </p>
          </div>
        </header>

        {client.allergies.length ? (
          <p className="pk-dt-alert">
            <PkIcon name="warning" size={16} />
            {t('pk.dt.allergy')}: {client.allergies.map((a) => t(`pk.dossier.allergy.${a}` as const)).join(', ')}
          </p>
        ) : null}

        <Lines
          rows={[
            { icon: 'phone', label: t('pk.dt.phone'), value: <a dir="ltr" href={`tel:${client.phone.replace(/\s/g, '')}`}>{client.phone}</a> },
            { icon: 'mail', label: t('pk.dt.email'), value: <a dir="ltr" href={`mailto:${client.email}`}>{client.email}</a> },
            { icon: 'building', label: t('pk.dt.address'), value: `${client.street}, ${client.postcode} ${client.city}` },
            { icon: 'shield', label: t('pk.common.insurer'), value: insurerById(client.insurer).name },
          ]}
        />

        <Section title={t('pk.dt.coming')} count={visits.coming.length}>
          {visits.coming.length ? (
            <ul className="pk-dt-list">
              {visits.coming.map((a) => (
                <Row
                  key={a.id}
                  lead={
                    <>
                      <b>{dateShort(a.start)}</b>
                      {clock(a.start)}
                    </>
                  }
                  title={text(a.treatment.name)}
                  sub={`${staffById(a.col).name} · ${cityOf(a.clinic)}`}
                  onClick={() => visit(a)}
                />
              ))}
            </ul>
          ) : (
            <p className="pk-dt-empty">{t('pk.dt.noComing')}</p>
          )}
        </Section>

        {episodes.length ? (
          <Section title={t('pk.dt.episodes')} count={episodes.length}>
            <ul className="pk-dt-list">
              {episodes.map((e) => (
                <li key={e.id} className="pk-dt-episode">
                  <span>
                    <strong>{t(conditionById(e.condition).label)}</strong>
                    <small>{t('pk.dt.sessions', { done: e.sessions.done, total: e.sessions.total })}</small>
                  </span>
                  <span className="pk-dt-progress" aria-hidden="true">
                    <i style={{ width: `${(e.sessions.done / Math.max(1, e.sessions.total)) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title={t('pk.dt.history')} count={visits.past.length}>
          {visits.past.length ? (
            <ul className="pk-dt-list">
              {visits.past.map((a) => (
                <Row
                  key={a.id}
                  dim
                  lead={
                    <>
                      <b>{dateShort(a.start)}</b>
                      {clock(a.start)}
                    </>
                  }
                  title={text(a.treatment.name)}
                  sub={staffById(a.col).name}
                  onClick={() => visit(a)}
                />
              ))}
            </ul>
          ) : (
            <p className="pk-dt-empty">{t('pk.dt.noHistory')}</p>
          )}
        </Section>

        <Section title={t('pk.dt.invoices')} count={bills.length}>
          {open > 0 ? <p className="pk-dt-balance">{t('pk.dt.openBalance', { amount: eur(open) })}</p> : null}
          {bills.length ? (
            <ul className="pk-dt-list">
              {bills.slice(0, 4).map((b) => (
                <Row
                  key={b.id}
                  lead={<b>{dateShort(b.date)}</b>}
                  title={b.number ?? t('pk.facturen.status.concept')}
                  sub={t(`pk.facturen.status.${b.status}` as const)}
                  end={eur(totals(b).total)}
                  onClick={() => openDetail({ kind: 'invoice', id: b.id }, true)}
                />
              ))}
            </ul>
          ) : (
            <p className="pk-dt-empty">{t('pk.dt.noInvoices')}</p>
          )}
        </Section>
      </div>
      <Foot>
        <button type="button" className="btn btn-primary" onClick={() => go('dossier', { clientId: client.id })}>
          <PkIcon name="file" size={16} />
          {t('pk.dt.openDossier')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => go('agenda')}>
          <PkIcon name="calendar" size={16} />
          {t('pk.dt.book')}
        </button>
      </Foot>
    </>
  );
}

/* ---------- Invoice ---------- */

function InvoiceView({ id }: { id: string }) {
  const i18n = useI18n();
  const { t, dateShort } = i18n;
  const { today, go, openDetail } = usePraktijk();
  const { invoices } = useBilling();
  const { byId } = useClients();
  const money = useMemo(() => new Intl.NumberFormat(i18n.locale === 'ar' ? 'ar-u-nu-latn' : `${i18n.locale}-NL`, { style: 'currency', currency: 'EUR' }), [i18n.locale]);
  const inv: Invoice | undefined = invoices.find((i) => i.id === id);
  if (!inv) {
    return (
      <div className="pk-dt-body">
        <Head eyebrow={t('pk.dt.invoice')} title={t('pk.dt.gone')} />
      </div>
    );
  }
  const sum = totals(inv);
  const client = byId(inv.clientId) ?? clientById(inv.clientId, today) ?? clientFor(inv.short, inv.locationId, today);
  const lineName = (l: Invoice['lines'][number]) => lineLabel(l, i18n);

  return (
    <>
      <div className="pk-dt-body">
        <Head
          eyebrow={`${t('pk.dt.invoice')} · ${dateShort(inv.date)}`}
          title={inv.number ?? t('pk.facturen.status.concept')}
          sub={<strong className="pk-dt-amount">{money.format(sum.total)}</strong>}
          chip={<span className={`pk-dt-chip pk-dt-chip--inv-${inv.status}`}>{t(`pk.facturen.status.${inv.status}` as const)}</span>}
        />

        <button type="button" className="pk-dt-person" onClick={() => openDetail({ kind: 'client', id: client.id, short: client.short, clinic: inv.locationId }, true)}>
          <Initials client={client} />
          <span className="pk-dt-person-text">
            <strong>
              {client.first} {client.last}
            </strong>
            <small>{cityOf(inv.locationId)}</small>
          </span>
          <PkIcon name="chevronEnd" size={18} />
        </button>

        <Section title={t('pk.dt.lines')}>
          <ul className="pk-dt-bill">
            {inv.lines.map((l) => (
              <li key={l.key}>
                <span>
                  {l.qty > 1 ? `${l.qty} × ` : ''}
                  {lineName(l)}
                </span>
                <strong>{money.format(l.qty * l.unit)}</strong>
              </li>
            ))}
            {sum.discount ? (
              <li className="is-minor">
                <span>{t('pk.dt.discount')}</span>
                <strong>− {money.format(sum.discount)}</strong>
              </li>
            ) : null}
            <li className="is-total">
              <span>{t('pk.common.total')}</span>
              <strong>{money.format(sum.total)}</strong>
            </li>
            {sum.paid ? (
              <li className="is-minor">
                <span>{t('pk.dt.paid')}</span>
                <strong>{money.format(sum.paid)}</strong>
              </li>
            ) : null}
            {sum.open ? (
              <li className="is-open">
                <span>{t('pk.dt.stillOpen')}</span>
                <strong>{money.format(sum.open)}</strong>
              </li>
            ) : null}
          </ul>
        </Section>
      </div>
      <Foot>
        <button type="button" className="btn btn-primary" onClick={() => go('facturen', { invoiceId: inv.id })}>
          <PkIcon name="euro" size={16} />
          {t('pk.dt.toBilling')}
        </button>
      </Foot>
    </>
  );
}

function lineLabel(l: Invoice['lines'][number], i18n: ReturnType<typeof useI18n>): string {
  const ref = l.ref as { type: string; id?: string; name?: string; label?: string; zone?: string; code?: string };
  if (ref.name) return ref.name;
  if (ref.label) return ref.label;
  if (ref.type === 'treatment' && ref.id) return i18n.text(treatmentName(ref.id));
  return ref.id ?? ref.code ?? ref.type;
}

const treatmentName = (id: string) => treatmentById(id as TreatmentId).name;
