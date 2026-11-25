import { sameDay } from '@pure-clinics/shared';
import { type CSSProperties } from 'react';

import { Icon } from '../components/Icon';
import { CardHead, useToast } from '../components/ui';
import { phaseOf, type Appt, type ApptPhase } from '../data/clinics';
import { byUrgency, courseState, type Course } from '../data/courses';
import { diaryAt } from '../data/live';
import { sendReminders, todayLive, useCourses } from '../data/reminders';
import { Accent, useI18n } from '../i18n';
import { cityOf, type Account } from './accounts';

/**
 * "Mijn dag", the first page of a team member. A therapist sees her own appointments and her own clients in a series;
 * the front desk sees the whole day of its clinic. No revenue, no webshop, no Kliniek: that stays with the admin.
 */
export function StaffHome({ now, account }: { now: Date; account: Account }) {
  const { t, text, clock, dayLong } = useI18n();
  const toast = useToast();
  // The same day and the same reminders as the admin's overview: a reminder sent here shows as sent there too.
  const live = todayLive(now);
  const all = useCourses(now, live);
  const isToday = sameDay(live.day, now);
  const city = cityOf(account.locationId);
  const desk = Boolean(account.desk);

  const ownAppt = (a: Appt) => (account.specialist ? a.specialist.id === account.specialist : a.clinic === account.locationId);
  const ownCourse = (c: Course) => (account.specialist ? c.specialist.id === account.specialist : c.clinic === account.locationId);
  const appts = (isToday ? diaryAt(live.appts, now) : live.appts).filter(ownAppt).sort((a, b) => a.start.getTime() - b.start.getTime());
  const phase = (a: Appt): ApptPhase => (isToday ? phaseOf(a, now) : 'later');
  const running = appts.filter((a) => phase(a) === 'now');
  const next = appts.find((a) => phase(a) === 'later');
  const first = appts.filter((a) => a.firstVisit).length;

  const courses = all.filter(ownCourse).sort(byUrgency(now));
  const follow = courses.filter((c) => {
    const state = courseState(c, now);
    return state === 'due' || state === 'late';
  });

  const status = (c: Course) => {
    const state = courseState(c, now);
    if (state === 'late') return t('courses.late', { n: Math.max(1, Math.round((now.getTime() - c.due.getTime()) / (7 * 86400000))) });
    return t('courses.due', { n: c.done + 1 });
  };

  const remind = (c: Course) => {
    const sent = sendReminders(all, [c.id], now);
    if (sent.length) toast(t('courses.toast', { n: sent.length }));
  };

  return (
    <div className="acc-page">
      <div className="acc-stats rise">
        <div className="acc-stat">
          <span>{t('acc.stat.appts')}</span>
          <strong>{appts.length}</strong>
          <small>{dayLong(live.day)}</small>
        </div>
        <div className="acc-stat">
          <span>{t('acc.stat.now')}</span>
          <strong>{running.length}</strong>
          <small>{running.length ? running.map((a) => a.client).join(', ') : '–'}</small>
        </div>
        <div className="acc-stat">
          <span>{t('acc.stat.next')}</span>
          <strong>{next ? clock(next.start) : '–'}</strong>
          <small>{next ? next.client : t('acc.stat.nextNone')}</small>
        </div>
        {desk ? (
          <div className="acc-stat">
            <span>{t('acc.stat.first')}</span>
            <strong>{first}</strong>
            <small>{t('acc.stat.firstSub', { n: appts.length })}</small>
          </div>
        ) : (
          <div className="acc-stat">
            <span>{t('acc.stat.follow')}</span>
            <strong>{follow.length}</strong>
            <small>{t('acc.stat.followSub')}</small>
          </div>
        )}
      </div>

      <section className="card acc-card rise" style={{ '--d': '80ms' } as CSSProperties}>
        <CardHead eyebrow={t('acc.day.eyebrow')} title={<Accent text={desk ? t('acc.day.title.desk', { city }) : t('acc.day.title.own')} />} />
        <p className="help">{desk ? t('acc.day.help.desk', { city }) : t('acc.day.help.own')}</p>
        {!isToday ? <p className="acc-note">{t('acc.day.closed', { day: dayLong(live.day) })}</p> : null}
        {appts.length ? (
          <ol className="acc-day">
            {appts.map((a) => {
              const p = phase(a);
              return (
                <li key={a.id} className={`acc-appt is-${p}`}>
                  <time>
                    {clock(a.start)}
                    <small>{clock(a.end)}</small>
                  </time>
                  <span className="acc-appt-who">
                    <strong>{a.client}</strong>
                    <span>
                      {text(a.treatment.name)}
                      {desk ? ` · ${t('acc.with', { name: a.specialist.name })}` : ''}
                    </span>
                  </span>
                  {a.firstVisit ? <span className="acc-chip">{t('acc.firstVisit')}</span> : <span />}
                  <span className={`acc-phase acc-phase--${p}`}>{t(`acc.phase.${p}`)}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="acc-empty">{t('acc.day.empty')}</p>
        )}
      </section>

      <section className="card acc-card rise" style={{ '--d': '160ms' } as CSSProperties}>
        <CardHead eyebrow={t('acc.follow.eyebrow')} title={<Accent text={t('acc.follow.title')} />} />
        <p className="help">{desk ? t('acc.follow.help.desk', { city }) : t('acc.follow.help.own')}</p>
        {follow.length ? (
          <ol className="acc-follow">
            {follow.map((c) => {
              const sent = Boolean(c.reminded);
              return (
                <li key={c.id} className={`acc-course is-${courseState(c, now)}`}>
                  <span className="acc-appt-who">
                    <strong>{c.client}</strong>
                    <span>
                      {text(c.treatment.name)}
                      {desk ? ` · ${t('acc.with', { name: c.specialist.name })}` : ''}
                    </span>
                  </span>
                  <span className="acc-steps" role="img" aria-label={t('courses.progress', { done: c.done, total: c.total })}>
                    {Array.from({ length: c.total }, (_, i) => (
                      <i key={i} className={i < c.done ? 'on' : ''} />
                    ))}
                  </span>
                  <span className="acc-course-state">{status(c)}</span>
                  {sent ? (
                    <span className="acc-sent">
                      <Icon name="check" size={14} /> {t('courses.sent')}
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-small" onClick={() => remind(c)}>
                      {t('courses.remind')}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="acc-empty">{t('acc.follow.empty')}</p>
        )}
      </section>

      <p className="acc-limits">
        <Icon name="clipboard" size={16} />
        <span>{t('acc.limits')}</span>
      </p>
    </div>
  );
}
