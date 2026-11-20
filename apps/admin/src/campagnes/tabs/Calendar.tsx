import { addDays, dateKey, startOfDay } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Seg } from '../../praktijk/kit';
import { CALENDAR_MONTHS, MOMENTS, STATUSES, type Campaign } from '../data';
import { segmentKey, statusKey, useCp } from '../state';
import { ChannelMark, StatusChip } from '../ui';

type View = 'month' | 'week';

/** Monday of the week the day is in. */
const weekStart = (day: Date) => addDays(startOfDay(day), -((day.getDay() + 6) % 7));
const FIRST = CALENDAR_MONTHS[0];
const LAST = new Date(CALENDAR_MONTHS[CALENDAR_MONTHS.length - 1].getFullYear(), CALENDAR_MONTHS[CALENDAR_MONTHS.length - 1].getMonth() + 1, 0);

/** Kalender: November to January by month or by week; e-mail is a filled square, SMS an outlined one. */
export function CalendarTab() {
  const i18n = useI18n();
  const { t, monthYear, weekdayShort, clock, dateShort, dayMonth } = i18n;
  const { now, campaigns, open } = useCp();
  const [view, setView] = useState<View>('month');
  const inRange = now >= FIRST && now <= LAST;
  const [month, setMonth] = useState(() => (inRange ? new Date(now.getFullYear(), now.getMonth(), 1) : FIRST));
  const [week, setWeek] = useState(() => weekStart(inRange ? now : FIRST));
  const today = dateKey(now);

  const byDay = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const c of [...campaigns].sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())) {
      const key = dateKey(c.sendAt);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [campaigns]);
  const momentOf = (day: Date) => MOMENTS.find((m) => dateKey(m.date) === dateKey(day));

  const days = useMemo(() => {
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const start = weekStart(month);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const count = Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7) * 7;
    return Array.from({ length: count }, (_, i) => addDays(start, i));
  }, [view, month, week]);

  const monthIndex = CALENDAR_MONTHS.findIndex((m) => m.getMonth() === month.getMonth() && m.getFullYear() === month.getFullYear());
  const canPrev = view === 'month' ? monthIndex > 0 : addDays(week, -1) >= weekStart(FIRST);
  const canNext = view === 'month' ? monthIndex < CALENDAR_MONTHS.length - 1 : addDays(week, 7) <= LAST;
  const step = (dir: 1 | -1) => {
    if (view === 'month') setMonth(CALENDAR_MONTHS[monthIndex + dir]);
    else setWeek(addDays(week, dir * 7));
  };
  const switchView = (next: View) => {
    if (next === 'week') setWeek(weekStart(month.getMonth() === now.getMonth() && inRange ? now : month));
    else {
      // The month the week's Thursday falls in, kept inside November to January.
      const mid = addDays(week, 3);
      const found = CALENDAR_MONTHS.find((m) => m.getMonth() === mid.getMonth() && m.getFullYear() === mid.getFullYear());
      setMonth(found ?? (mid < FIRST ? FIRST : CALENDAR_MONTHS[CALENDAR_MONTHS.length - 1]));
    }
    setView(next);
  };

  const title = view === 'month' ? monthYear(month) : t('cp.cal.weekOf', { from: dayMonth(week, now), to: dayMonth(addDays(week, 6), now) });
  const listed = view === 'month' ? campaigns.filter((c) => c.sendAt.getMonth() === month.getMonth() && c.sendAt.getFullYear() === month.getFullYear()) : campaigns.filter((c) => c.sendAt >= week && c.sendAt < addDays(week, 7));
  const sorted = [...listed].sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());

  const item = (c: Campaign, compact = false) => (
    <button key={c.id} className={`cp-cal-item cp-cal-item--${c.channel} is-${c.status}`} onClick={() => open('kalender', c.id)} title={`${c.name} · ${t(statusKey(c.status))}`}>
      <i className="cp-cal-status" aria-hidden="true" />
      <span className="cp-cal-time pk-num">{clock(c.sendAt)}</span>
      {compact ? null : <span className="cp-cal-name">{c.name}</span>}
      <span className="cp-sr">
        {t(c.channel === 'email' ? 'cp.channel.email' : 'cp.channel.sms')} · {c.name} · {t(statusKey(c.status))}
      </span>
    </button>
  );

  return (
    <div className="pk-stack cp-cal-wrap">
      <Card
        eyebrow={t('cp.cal.eyebrow')}
        title={title}
        actions={
          <div className="pk-row">
            <Seg
              label={t('cp.cal.view')}
              value={view}
              onChange={switchView}
              options={[
                { value: 'month', label: t('cp.cal.month') },
                { value: 'week', label: t('cp.cal.week') },
              ]}
            />
            <span className="pk-row cp-cal-steps">
              <button className="icon-button small" disabled={!canPrev} onClick={() => step(-1)} aria-label={t('cp.cal.prev')}>
                <PkIcon name="chevronStart" size={17} />
              </button>
              <button className="icon-button small" disabled={!canNext} onClick={() => step(1)} aria-label={t('cp.cal.next')}>
                <PkIcon name="chevronEnd" size={17} />
              </button>
            </span>
          </div>
        }
      >
        <ul className="cp-cal-legend">
          <li>
            <ChannelMark channel="email" size={16} />
            {t('cp.channel.email')}
          </li>
          <li>
            <ChannelMark channel="sms" size={16} />
            {t('cp.channel.sms')}
          </li>
          {STATUSES.map((s) => (
            <li key={s} className={`is-${s}`}>
              <i className="cp-cal-status" aria-hidden="true" />
              {t(statusKey(s))}
            </li>
          ))}
        </ul>

        <div className={`cp-cal cp-cal--${view}`} role="grid" aria-label={title}>
          <div className="cp-cal-head" role="row">
            {days.slice(0, 7).map((d) => (
              <span key={d.getDay()} role="columnheader">
                {weekdayShort(d)}
              </span>
            ))}
          </div>
          <div className="cp-cal-days">
            {days.map((d) => {
              const key = dateKey(d);
              const list = byDay.get(key) ?? [];
              const moment = momentOf(d);
              const outside = view === 'month' && d.getMonth() !== month.getMonth();
              return (
                <div key={key} role="gridcell" className={`cp-cal-day ${outside ? 'is-outside' : ''} ${key === today ? 'is-today' : ''} ${moment ? 'has-moment' : ''}`}>
                  <span className="cp-cal-date">
                    <b className="pk-num">{d.getDate()}</b>
                    {view === 'week' ? <span className="cp-cal-wd">{dateShort(d)}</span> : null}
                  </span>
                  {moment && !outside ? (
                    <span className="cp-cal-moment" title={t(moment.key)}>
                      {t(moment.key)}
                    </span>
                  ) : null}
                  {outside ? null : <div className="cp-cal-items">{list.map((c) => item(c, false))}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card eyebrow={t('cp.cal.listEyebrow')} title={t(view === 'month' ? 'cp.cal.listMonth' : 'cp.cal.listWeek', { n: sorted.length })}>
        {sorted.length ? (
          <ul className="pk-list cp-rows">
            {sorted.map((c) => (
              <li key={c.id}>
                <button className="cp-row-button" onClick={() => open('kalender', c.id)}>
                  <ChannelMark channel={c.channel} />
                  <span className="pk-stack cp-grow">
                    <strong className="cp-name">{c.name}</strong>
                    <small className="pk-muted">
                      {dateShort(c.sendAt)} · {clock(c.sendAt)} · {t(segmentKey(c.segment))}
                    </small>
                  </span>
                  <StatusChip status={c.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pk-empty">{t('cp.cal.empty')}</p>
        )}
      </Card>
    </div>
  );
}
