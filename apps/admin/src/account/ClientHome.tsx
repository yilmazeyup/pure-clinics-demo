import { addDays, LOCATIONS, productById, specialistById, startOfDay, treatmentById } from '@pure-clinics/shared';
import { useMemo, type CSSProperties } from 'react';

import { Icon } from '../components/Icon';
import { CardHead, useToast } from '../components/ui';
import { isOpen, works } from '../data/clinics';
import { COURSE_PLAN } from '../data/courses';
import { Accent, useI18n } from '../i18n';
import type { Account } from './accounts';

/** The member app, where a client books and shops; the client page links to it. */
const APP_URL = 'https://pureclinics.savastana.com/app/';

/**
 * "Mijn Pure", the page of a client: her next appointment, how far she is in her series, earlier visits with their
 * invoices, and the aftercare her therapist recommended. The client and her visits are invented demo data.
 */
export function ClientHome({ now }: { now: Date; account: Account }) {
  const { t, text, clock, dayLong, dayMonth, eur } = useI18n();
  const toast = useToast();
  const laser = treatmentById('laser');
  const plan = COURSE_PLAN.laser!;
  const maud = specialistById('maud');
  const clinic = LOCATIONS.find((l) => l.id === maud.locationId)!;
  const care = productById('zo-spf')!;

  // Her next session: about a week from now, on a day Maud works in Nijmegen; the earlier ones went every five weeks.
  const visits = useMemo(() => {
    let day = addDays(startOfDay(now), 7);
    while (!works(maud, day) || !isOpen(maud.locationId, day)) day = addDays(day, 1);
    const next = new Date(day);
    next.setHours(10, 30, 0, 0);
    const done = [3, 2, 1].map((n) => ({ n, at: addDays(next, -plan.weeks * 7 * (4 - n)) }));
    return { next, done, intake: addDays(done[done.length - 1].at, -10) };
  }, [startOfDay(now).getTime()]);

  const demo = () => toast(t('acc.demo'));

  return (
    <div className="acc-page">
      <section className="card acc-card acc-next rise">
        <CardHead eyebrow={t('acc.me.next.eyebrow')} title={<Accent text={t('acc.me.next.title', { treatment: text(laser.name), name: maud.name })} />} />
        <p className="acc-next-when">
          <Icon name="calendar" size={18} />
          {t('acc.me.next.when', { day: dayLong(visits.next), time: clock(visits.next) })}
        </p>
        <p className="acc-next-where">
          <Icon name="pin" size={18} />
          {clinic.city} · {clinic.address}
        </p>
        <div className="acc-actions">
          <button className="btn btn-ghost" onClick={demo}>
            {t('acc.me.move')}
          </button>
          <a className="btn btn-primary" href={APP_URL} target="_blank" rel="noopener">
            <Icon name="plus" size={16} />
            {t('acc.me.book')}
          </a>
        </div>
      </section>

      <section className="card acc-card rise" style={{ '--d': '80ms' } as CSSProperties}>
        <CardHead eyebrow={`${t('acc.me.course.eyebrow')} · ${text(laser.name)}`} title={<Accent text={t('acc.me.course.title', { done: 3, total: plan.sessions })} />} />
        <span className="acc-steps acc-steps--big" role="img" aria-label={t('courses.progress', { done: 3, total: plan.sessions })}>
          {Array.from({ length: plan.sessions }, (_, i) => (
            <i key={i} className={i < 3 ? 'on' : i === 3 ? 'next' : ''} />
          ))}
        </span>
        <p className="acc-course-next">{t('acc.me.course.next', { day: { date: visits.next } })}</p>
        <p className="help">{t('acc.me.course.help', { weeks: plan.weeks })}</p>
      </section>

      <section className="card acc-card rise" style={{ '--d': '160ms' } as CSSProperties}>
        <CardHead eyebrow={t('acc.me.visits.eyebrow')} title={<Accent text={t('acc.me.visits.title')} />} />
        <ol className="acc-visits">
          {visits.done.map((v) => (
            <li key={v.n}>
              <time>{dayMonth(v.at, now)}</time>
              <span className="acc-appt-who">
                <strong>{text(laser.name)}</strong>
                <span>
                  {t('courses.progress', { done: v.n, total: plan.sessions })} · {maud.name}
                </span>
              </span>
              <span className="acc-amount">{eur(laser.priceFrom)}</span>
              <span className="acc-chip acc-chip--good">{t('acc.me.paid')}</span>
              <button className="btn btn-ghost btn-small" onClick={demo}>
                {t('acc.me.invoice')}
              </button>
            </li>
          ))}
          <li>
            <time>{dayMonth(visits.intake, now)}</time>
            <span className="acc-appt-who">
              <strong>{text(treatmentById('consult').name)}</strong>
              <span>{maud.name}</span>
            </span>
            <span className="acc-amount">{eur(0)}</span>
            <span className="acc-chip">{t('acc.me.free')}</span>
            <span />
          </li>
        </ol>
      </section>

      <section className="card acc-card acc-care rise" style={{ '--d': '240ms' } as CSSProperties}>
        <CardHead eyebrow={t('acc.me.care.eyebrow')} title={<Accent text={t('acc.me.care.title', { name: maud.name })} />} />
        <div className="acc-care-row">
          <span className="acc-care-product">
            <strong>
              {care.brand} {text(care.name)}
            </strong>
            <span>{eur(care.price)}</span>
          </span>
          <a className="btn btn-ghost" href={`${APP_URL}shop`} target="_blank" rel="noopener">
            {t('acc.me.care.shop')}
            <Icon name="arrow" size={15} />
          </a>
        </div>
        <p className="help">{t('acc.me.care.help')}</p>
      </section>
    </div>
  );
}
