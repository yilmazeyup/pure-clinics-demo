import {
  addDays,
  freeSlots,
  LOCATIONS,
  MEMBER,
  openingHours,
  sameDay,
  specialistById,
  specialistsFor,
  startOfDay,
  treatmentById,
  type LocationId,
  type SpecialistId,
} from '@pure-clinics/shared';
import { useMemo, useState, type CSSProperties } from 'react';

import { useI18n, type I18n } from '../../../i18n';
import { rng } from '../../../data/random';
import { conditionById } from '../../data/core';
import type { Brand, Deposit, IntakeOption, PortalRules, PreviewBooking, StaffOrder, StaffSetting } from '../../data/portal';
import { PkIcon } from '../../icons';

/** Everything the portal shows depends on these settings; the preview reads them live. */
export type PortalConfig = {
  live: boolean;
  options: IntakeOption[];
  rules: PortalRules;
  staff: Record<SpecialistId, StaffSetting>;
  order: SpecialistId[];
  orderMode: StaffOrder;
  locations: Record<LocationId, boolean>;
  agendas: Record<SpecialistId, boolean>;
  brand: Brand;
  deposit: Deposit;
  payOnline: boolean;
  photos: boolean;
};

/** The title a client sees: the clinic's own, or the treatment (with the condition for a free intake). */
export function optionTitle(o: IntakeOption, i18n: I18n): string {
  if (o.title) return o.title;
  if (o.treatment === 'consult') return i18n.t('pk.portaal.intake.consultFor', { treatment: { treatment: 'consult' }, condition: { msg: conditionById(o.condition).label } });
  return i18n.text(treatmentById(o.treatment).name);
}

export function optionPrice(o: IntakeOption, i18n: I18n): string {
  if (o.price === 'free') return i18n.t('pk.portaal.intake.free');
  if (o.price === 'text') return o.priceText || i18n.t('pk.portaal.intake.free');
  return i18n.t('pk.portaal.intake.from', { price: i18n.eur(treatmentById(o.treatment).priceFrom) });
}

/** White or ink, whichever reads better on a brand colour. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#3A2623' : '#FFFFFF';
}

const hoursUntil = (start: Date, now: Date) => (start.getTime() - now.getTime()) / 3600000;

/** Who can be booked for an option at a location, in the portal's order; excluded staff and closed agendas drop out. */
function bookable(o: IntakeOption, location: LocationId, cfg: PortalConfig, shuffle: number) {
  const giving = specialistsFor(treatmentById(o.treatment), location)
    .filter((s) => !cfg.staff[s.id].excluded && cfg.agendas[s.id])
    .filter((s) => o.practitioner === 'any' || s.id === o.practitioner);
  if (cfg.orderMode === 'fixed') return giving.sort((a, b) => cfg.order.indexOf(a.id) - cfg.order.indexOf(b.id));
  const r = rng(`portal-shuffle-${shuffle}`);
  return giving
    .map((s) => ({ s, k: r() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}

type Slot = { start: Date; specialistId: SpecialistId };

/** Days inside the booking window with the times still free, for one treatment at one location. */
function SlotPicker({
  option,
  location,
  specialist,
  allowed,
  cfg,
  now,
  onPick,
}: {
  option: IntakeOption;
  location: LocationId;
  specialist: SpecialistId | 'any';
  allowed: SpecialistId[];
  cfg: PortalConfig;
  now: Date;
  onPick: (slot: Slot) => void;
}) {
  const i18n = useI18n();
  const { t, clock, weekdayShort } = i18n;
  const earliest = new Date(now.getTime() + cfg.rules.minHours * 3600000);
  const latest = addDays(startOfDay(now), cfg.rules.maxWeeks * 7);
  const treatment = treatmentById(option.treatment);
  const days = useMemo(() => {
    const out: { day: Date; slots: Slot[] }[] = [];
    for (let d = startOfDay(earliest); d <= latest && out.length < 6; d = addDays(d, 1)) {
      if (!openingHours(d, location)) continue;
      const slots = freeSlots(treatment, specialist, d, now, location)
        .filter((s) => s.start >= earliest && allowed.includes(s.specialistId))
        .slice(0, 9);
      if (slots.length) out.push({ day: d, slots });
    }
    return out;
  }, [option.treatment, location, specialist, allowed.join(), cfg.rules.minHours, cfg.rules.maxWeeks, now.getTime()]);
  const [index, setIndex] = useState(0);
  if (!days.length) return <p className="pk-po-pv-note">{t('pk.portaal.pv.noDays')}</p>;
  const current = days[Math.min(index, days.length - 1)];
  return (
    <div className="pk-po-pv-slots">
      <div className="pk-po-pv-days">
        {days.map((d, i) => (
          <button key={d.day.getTime()} aria-pressed={d === current} onClick={() => setIndex(i)}>
            <small>{weekdayShort(d.day)}</small>
            <b>{d.day.getDate()}</b>
          </button>
        ))}
      </div>
      {current.slots.length ? (
        <div className="pk-po-pv-times">
          {current.slots.map((s) => (
            <button key={s.start.getTime()} onClick={() => onPick(s)}>
              {clock(s.start)}
            </button>
          ))}
        </div>
      ) : (
        <p className="pk-po-pv-note">{t('pk.portaal.pv.noTimes')}</p>
      )}
    </div>
  );
}

type Flow = { step: 0 | 1 | 2 | 3; option?: IntakeOption; location?: LocationId; specialist?: SpecialistId | 'any'; slot?: Slot };

/** The client portal as a client sees it on her phone, following the settings next to it. */
export function PortalPreview({
  cfg,
  now,
  bookings,
  onBookings,
}: {
  cfg: PortalConfig;
  now: Date;
  bookings: PreviewBooking[];
  onBookings: (next: PreviewBooking[]) => void;
}) {
  const i18n = useI18n();
  const { t, text, clock, dateShort } = i18n;
  const [tab, setTab] = useState<'book' | 'mine'>('book');
  const [flow, setFlow] = useState<Flow>({ step: 0 });
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [shuffle] = useState(() => Math.floor(Math.random() * 1000));

  const visible = cfg.options.filter((o) => o.visible).sort((a, b) => Number(b.featured) - Number(a.featured));
  const locations = LOCATIONS.filter((l) => cfg.locations[l.id]);
  const phone = (id: LocationId) => LOCATIONS.find((l) => l.id === id)?.phone ?? '';
  const style = {
    '--po-primary': cfg.brand.primary,
    '--po-on-primary': inkOn(cfg.brand.primary),
    '--po-accent': cfg.brand.accent,
    '--po-on-accent': inkOn(cfg.brand.accent),
  } as CSSProperties;

  const start = (o: IntakeOption) => {
    const where = locations.find((l) => bookable(o, l.id, cfg, shuffle).length) ?? locations[0];
    setFlow({ step: 1, option: o, location: where?.id });
  };

  const confirm = () => {
    if (!flow.option || !flow.slot || !flow.location) return;
    const booking: PreviewBooking = {
      id: `b-${flow.slot.start.getTime()}`,
      treatment: flow.option.treatment,
      specialist: flow.slot.specialistId,
      location: flow.location,
      start: flow.slot.start,
      title: optionTitle(flow.option, i18n),
    };
    onBookings([...bookings, booking].sort((a, b) => a.start.getTime() - b.start.getTime()));
    setFlow({ step: 0 });
    setTab('mine');
    setNotice({ id: booking.id, text: t('pk.portaal.pv.booked') });
  };

  const tryMove = (b: PreviewBooking) => {
    setCancelling(null);
    if (!cfg.rules.allowReschedule) setNotice({ id: b.id, text: t('pk.portaal.pv.notAllowed', { phone: phone(b.location) }) });
    else if (hoursUntil(b.start, now) < cfg.rules.rescheduleHours)
      setNotice({ id: b.id, text: t('pk.portaal.pv.tooLateMove', { n: cfg.rules.rescheduleHours, phone: phone(b.location) }) });
    else {
      setNotice(null);
      setMoving(moving === b.id ? null : b.id);
    }
  };

  const tryCancel = (b: PreviewBooking) => {
    setMoving(null);
    if (!cfg.rules.allowCancel) setNotice({ id: b.id, text: t('pk.portaal.pv.notAllowed', { phone: phone(b.location) }) });
    else if (hoursUntil(b.start, now) < cfg.rules.cancelHours)
      setNotice({ id: b.id, text: t('pk.portaal.pv.tooLateCancel', { n: cfg.rules.cancelHours, phone: phone(b.location) }) });
    else {
      setNotice(null);
      setCancelling(b.id);
    }
  };

  const nameOf = (id: SpecialistId) => (cfg.staff[id].hidden ? t('pk.portaal.pv.anonymous') : specialistById(id).name);

  const renderBook = () => {
    if (!visible.length) return <p className="pk-po-pv-note">{t('pk.portaal.pv.noneVisible')}</p>;
    if (flow.step === 0 || !flow.option)
      return (
        <>
          <h3 className="pk-po-pv-h">{t('pk.portaal.pv.choose')}</h3>
          <div className="pk-po-pv-options">
            {visible.map((o) => (
              <button key={o.id} className={o.featured ? 'is-featured' : ''} onClick={() => start(o)}>
                <span>
                  {o.featured ? <small className="pk-po-pv-badge">{t('pk.portaal.pv.featured')}</small> : null}
                  <b>{optionTitle(o, i18n)}</b>
                  <small>{t(conditionById(o.condition).label)}</small>
                </span>
                <em>{optionPrice(o, i18n)}</em>
              </button>
            ))}
          </div>
        </>
      );
    const option = flow.option;
    const location = flow.location ?? locations[0]?.id;
    const staff = location ? bookable(option, location, cfg, shuffle) : [];
    const shown = staff.filter((s) => !cfg.staff[s.id].hidden);
    const back = (
      <button className="pk-po-pv-back" onClick={() => setFlow({ ...flow, step: (flow.step - 1) as Flow['step'] })}>
        <PkIcon name="chevronStart" size={15} />
        {t('pk.portaal.pv.back')}
      </button>
    );
    if (flow.step === 1)
      return (
        <>
          {back}
          <h3 className="pk-po-pv-h">{t('pk.portaal.pv.where')}</h3>
          <div className="pk-po-pv-chips">
            {locations.map((l) => (
              <button key={l.id} aria-pressed={l.id === location} onClick={() => setFlow({ ...flow, location: l.id })}>
                {l.city}
              </button>
            ))}
          </div>
          {cfg.brand.addresses === 'all' || location ? (
            <p className="pk-po-pv-address">
              <PkIcon name="pin" size={13} />
              {(cfg.brand.addresses === 'all' ? locations : locations.filter((l) => l.id === location)).map((l) => `${l.city}, ${l.address}`).join(' · ')}
            </p>
          ) : null}
          <div className="pk-po-pv-staff">
            {staff.length ? (
              <button onClick={() => setFlow({ ...flow, step: 2, specialist: 'any' })}>
                <span className="pk-po-pv-avatar">
                  <PkIcon name="users" size={15} />
                </span>
                {t('pk.portaal.pv.firstFree')}
              </button>
            ) : (
              <p className="pk-po-pv-note">{t('pk.portaal.pv.noDays')}</p>
            )}
            {shown.map((s) => (
              <button key={s.id} onClick={() => setFlow({ ...flow, step: 2, specialist: s.id })}>
                <span className="pk-po-pv-avatar">{s.name[0]}</span>
                {s.name}
                <small>{t(`role.${s.role}`)}</small>
              </button>
            ))}
          </div>
        </>
      );
    if (flow.step === 2 && location)
      return (
        <>
          {back}
          <h3 className="pk-po-pv-h">{t('pk.portaal.pv.when')}</h3>
          <SlotPicker
            option={option}
            location={location}
            specialist={flow.specialist ?? 'any'}
            allowed={staff.map((s) => s.id)}
            cfg={cfg}
            now={now}
            onPick={(slot) => setFlow({ ...flow, step: 3, slot })}
          />
        </>
      );
    const slot = flow.slot!;
    const price = treatmentById(option.treatment).priceFrom;
    const deposit = cfg.deposit.mode === 'amount' ? Math.min(price, cfg.deposit.value) : (price * cfg.deposit.value) / 100;
    return (
      <>
        {back}
        <h3 className="pk-po-pv-h">{t('pk.portaal.pv.check')}</h3>
        <div className="pk-po-pv-summary">
          <b>{optionTitle(option, i18n)}</b>
          <span>
            {dateShort(slot.start)} · {clock(slot.start)}
          </span>
          <span>
            {LOCATIONS.find((l) => l.id === location)?.city} · {t('pk.portaal.pv.with', { name: nameOf(slot.specialistId) })}
          </span>
          <em>{optionPrice(option, i18n)}</em>
        </div>
        {price > 0 && option.price !== 'free' ? (
          <p className="pk-po-pv-pay">
            <PkIcon name="card" size={14} />
            {cfg.deposit.on
              ? t('pk.portaal.pv.deposit', { amount: i18n.eur(deposit) })
              : cfg.payOnline
                ? t('pk.portaal.pv.payNow')
                : t('pk.portaal.pv.payLater')}
          </p>
        ) : null}
        <button className="pk-po-pv-primary" onClick={confirm}>
          {t('pk.portaal.pv.confirm')}
        </button>
      </>
    );
  };

  const renderMine = () => (
    <>
      {bookings.length ? (
        <div className="pk-po-pv-mine">
          {bookings.map((b) => {
            const option = cfg.options.find((o) => o.treatment === b.treatment) ?? null;
            return (
              <div key={b.id} className="pk-po-pv-booking">
                <b>{b.title ?? text(treatmentById(b.treatment).name)}</b>
                <span>
                  {sameDay(b.start, now) ? t('pk.common.today') : dateShort(b.start)} · {clock(b.start)}
                </span>
                <span>
                  {LOCATIONS.find((l) => l.id === b.location)?.city} · {t('pk.portaal.pv.with', { name: nameOf(b.specialist) })}
                </span>
                {notice?.id === b.id ? <p className="pk-po-pv-notice">{notice.text}</p> : null}
                {cancelling === b.id ? (
                  <div className="pk-po-pv-row">
                    <span>{t('pk.portaal.pv.cancelSure')}</span>
                    <button
                      className="pk-po-pv-danger"
                      onClick={() => {
                        onBookings(bookings.filter((x) => x.id !== b.id));
                        setCancelling(null);
                        setNotice({ id: 'all', text: t('pk.portaal.pv.cancelled') });
                      }}
                    >
                      {t('pk.portaal.pv.cancelYes')}
                    </button>
                  </div>
                ) : (
                  <div className="pk-po-pv-row">
                    <button onClick={() => tryMove(b)}>{t('pk.portaal.pv.reschedule')}</button>
                    <button onClick={() => tryCancel(b)}>{t('pk.portaal.pv.cancel')}</button>
                  </div>
                )}
                {moving === b.id ? (
                  <div className="pk-po-pv-move">
                    <small>{t('pk.portaal.pv.newTime')}</small>
                    <SlotPicker
                      option={option ?? { ...cfg.options[0], treatment: b.treatment }}
                      location={b.location}
                      specialist={b.specialist}
                      allowed={[b.specialist]}
                      cfg={cfg}
                      now={now}
                      onPick={(slot) => {
                        onBookings(bookings.map((x) => (x.id === b.id ? { ...x, start: slot.start } : x)).sort((x, y) => x.start.getTime() - y.start.getTime()));
                        setMoving(null);
                        setNotice({ id: b.id, text: t('pk.portaal.pv.moved', { date: { date: slot.start }, time: slot.start }) });
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="pk-po-pv-note">{t('pk.portaal.pv.none')}</p>
      )}
      {notice?.id === 'all' ? <p className="pk-po-pv-notice">{notice.text}</p> : null}
      {cfg.photos ? (
        <div className="pk-po-pv-photos">
          <h3 className="pk-po-pv-h">{t('pk.portaal.pv.progress')}</h3>
          <div className="pk-po-ba">
            <span className="pk-po-ba-tile pk-po-ba-tile--before">{t('pk.portaal.photos.before')}</span>
            <span className="pk-po-ba-tile pk-po-ba-tile--after">{t('pk.portaal.photos.after')}</span>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="pk-po-phone" style={style} data-feature="c.self" aria-label={t('pk.portaal.pv.label')}>
      <div className="pk-po-phone-top">
        {cfg.brand.logo ? (
          <img className="pk-po-logo" src={cfg.brand.logo} alt="Pure Clinics" />
        ) : (
          <span className="pk-po-wordmark" aria-label="Pure Clinics">
            <b>PURE</b>CLINICS
          </span>
        )}
        <span className="pk-po-hello">{t('pk.portaal.pv.hello', { name: MEMBER.firstName })}</span>
      </div>
      {cfg.live ? (
        <>
          <div className="pk-po-pv-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'book'} onClick={() => setTab('book')}>
              {t('pk.portaal.pv.book')}
            </button>
            <button
              role="tab"
              aria-selected={tab === 'mine'}
              onClick={() => {
                setTab('mine');
                setFlow({ step: 0 });
              }}
            >
              {t('pk.portaal.pv.mine')}
              <i>{bookings.length}</i>
            </button>
          </div>
          <div className="pk-po-phone-body">{tab === 'book' ? renderBook() : renderMine()}</div>
        </>
      ) : (
        <div className="pk-po-phone-body">
          <p className="pk-po-pv-notice">{t('pk.portaal.pv.closed', { phone: LOCATIONS[0].phone })}</p>
        </div>
      )}
      <div className="pk-po-phone-foot">
        <PkIcon name="phone" size={13} />
        {t('pk.portaal.pv.appNote')}
      </div>
    </div>
  );
}
