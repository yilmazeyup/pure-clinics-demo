import { LOCATIONS, SPECIALISTS, type LocationId, type TreatmentId } from '@pure-clinics/shared';
import { useMemo, useRef, useState, type CSSProperties } from 'react';

import { useCourseStatus } from '../components/CoursesCard';
import { Icon } from '../components/Icon';
import { useToast } from '../components/ui';
import { byUrgency, COURSE_PLAN, courseState, type Course, type CourseState } from '../data/courses';
import { sendReminders, useCourses } from '../data/reminders';
import { Accent, useI18n } from '../i18n';

// Every client partway through a series on one page (…/#trajecten), opened from the card on the overview. The tiles
// at the top are also the status filter; the list keeps the most urgent first; a reminder sent here shows as sent on
// the overview card and in its live feed (data/reminders.ts).

type StateFilter = 'all' | CourseState;

/** The order of the tiles: everyone, then who needs a reminder, then who is fine. */
const TILES: StateFilter[] = ['all', 'due', 'late', 'planned', 'onTrack'];
/** The order of the parts in each treatment's bar: the most urgent first. */
const BAR: CourseState[] = ['late', 'due', 'planned', 'onTrack'];

const cityOf = (id: LocationId) => LOCATIONS.find((l) => l.id === id)?.city ?? '';
const waitingFor = (c: Course, now: Date) => !c.reminded && ['due', 'late'].includes(courseState(c, now));
/** Lower case without accents, so "celine" finds "Céline". */
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CoursesPage({ now, onBack }: { now: Date; onBack: () => void }) {
  const { t, text, dateShort, clock, num } = useI18n();
  const toast = useToast();
  const status = useCourseStatus(now);
  const courses = useCourses(now);
  const listTop = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<StateFilter>('all');
  const [treatment, setTreatment] = useState<TreatmentId | ''>('');
  const [location, setLocation] = useState<LocationId | ''>('');
  const [specialist, setSpecialist] = useState('');
  const [query, setQuery] = useState('');

  const sorted = useMemo(() => [...courses].sort(byUrgency(now)), [courses, now]);
  const stateOf = useMemo(() => new Map(courses.map((c) => [c.id, courseState(c, now)])), [courses, now]);
  const count = (s: StateFilter) => (s === 'all' ? courses.length : courses.filter((c) => stateOf.get(c.id) === s).length);

  // What the other filters leave, before the status: the tiles count within it, so their numbers match the list.
  const matching = sorted.filter(
    (c) =>
      (!treatment || c.treatment.id === treatment) &&
      (!location || c.clinic === location) &&
      (!specialist || c.specialist.id === specialist) &&
      (!query.trim() || fold(c.client).includes(fold(query.trim()))),
  );
  const shown = state === 'all' ? matching : matching.filter((c) => stateOf.get(c.id) === state);
  const waiting = shown.filter((c) => waitingFor(c, now));
  const filtered = Boolean(treatment || location || specialist || query.trim());

  const treatments = useMemo(() => {
    const seen = new Map<TreatmentId, Course['treatment']>();
    for (const c of courses) seen.set(c.treatment.id, c.treatment);
    return [...seen.values()];
  }, [courses]);
  const specialists = SPECIALISTS.filter((s) => courses.some((c) => c.specialist.id === s.id));

  // Per treatment: how many clients, and how they are spread over the four states.
  const series = useMemo(
    () =>
      treatments
        .map((tr) => {
          const list = courses.filter((c) => c.treatment.id === tr.id);
          const by = Object.fromEntries(BAR.map((s) => [s, list.filter((c) => stateOf.get(c.id) === s).length])) as Record<CourseState, number>;
          return { treatment: tr, total: list.length, by };
        })
        .sort((a, b) => b.total - a.total),
    [treatments, courses, stateOf],
  );

  const remind = (ids: string[]) => {
    const picked = sendReminders(courses, ids, now);
    if (picked.length) toast(t('courses.toast', { n: picked.length }));
  };

  const reset = () => {
    setTreatment('');
    setLocation('');
    setSpecialist('');
    setQuery('');
    setState('all');
  };

  const showSeries = (id: TreatmentId) => {
    setTreatment(id);
    setState('all');
    listTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Back to the overview, at the card this page was opened from.
  const back = () => {
    onBack();
    window.setTimeout(() => document.getElementById('trajecten')?.scrollIntoView({ block: 'start' }), 120);
  };

  const tileSub = (s: StateFilter) => {
    if (s === 'all') return t('courses.stat.left', { n: courses.reduce((n, c) => n + c.total - c.done, 0) });
    if (s === 'due' || s === 'late') {
      if (!count(s)) return t('courses.stat.none');
      const open = courses.filter((c) => stateOf.get(c.id) === s && !c.reminded).length;
      return open ? t('courses.stat.waiting', { n: open }) : t('courses.stat.reminded');
    }
    return t(s === 'planned' ? 'courses.stat.plannedSub' : 'courses.stat.onTrackSub');
  };

  return (
    <div className="tp-page">
      <header className="tp-head rise">
        <button className="tp-back" onClick={back}>
          <Icon name="arrow" size={16} />
          {t('courses.back')}
        </button>
        <span className="eyebrow">{t('courses.eyebrow')}</span>
        <h2 className="tp-title">
          <Accent text={t('courses.page.title')} />
        </h2>
        <p className="help">{t('courses.page.help')}</p>
      </header>

      <div className="tp-tiles rise" style={{ '--d': '80ms' } as CSSProperties} role="group" aria-label={t('courses.stat.label')}>
        {TILES.map((s) => (
          <button key={s} className={`tp-tile tp-tile--${s} ${count(s) ? '' : 'is-zero'}`} aria-pressed={state === s} onClick={() => setState(state === s && s !== 'all' ? 'all' : s)}>
            <span className="tp-tile-label">
              {s === 'all' ? null : <i className={`tp-dot tp-dot--${s}`} aria-hidden="true" />}
              {t(`courses.state.${s}`)}
            </span>
            <span className="tp-tile-value">{num(count(s))}</span>
            <span className="tp-tile-sub">{tileSub(s)}</span>
          </button>
        ))}
      </div>

      <section className="card tp-card rise" style={{ '--d': '160ms' } as CSSProperties}>
        <div ref={listTop} className="tp-filters" role="search" aria-label={t('courses.filter.label')}>
          <label className="tp-search">
            <Icon name="search" size={16} />
            <input type="search" value={query} placeholder={t('courses.filter.search')} aria-label={t('courses.filter.search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="tp-select">
            <span>{t('courses.filter.treatment')}</span>
            <select value={treatment} onChange={(e) => setTreatment(e.target.value as TreatmentId | '')}>
              <option value="">{t('courses.filter.all')}</option>
              {treatments.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {text(tr.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-select">
            <span>{t('courses.filter.location')}</span>
            <select value={location} onChange={(e) => setLocation(e.target.value as LocationId | '')}>
              <option value="">{t('courses.filter.all')}</option>
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.city}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-select">
            <span>{t('courses.filter.specialist')}</span>
            <select value={specialist} onChange={(e) => setSpecialist(e.target.value)}>
              <option value="">{t('courses.filter.all')}</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {filtered || state !== 'all' ? (
            <button className="tp-reset" onClick={reset}>
              <Icon name="close" size={14} />
              {t('courses.filter.reset')}
            </button>
          ) : null}
        </div>

        <div className="tp-bar">
          <span>{t('courses.count', { n: shown.length, total: courses.length })}</span>
          <button className="btn btn-primary" disabled={!waiting.length} onClick={() => remind(waiting.map((c) => c.id))}>
            <Icon name="mail" size={16} />
            {waiting.length ? t('courses.remindAll', { n: waiting.length }) : t('courses.noneWaiting')}
          </button>
        </div>

        {shown.length ? (
          <div className="tp-table">
            <div className="tp-row tp-row--head" aria-hidden="true">
              <span>{t('courses.col.client')}</span>
              <span className="tp-col-spec">{t('courses.col.specialist')}</span>
              <span>{t('courses.col.progress')}</span>
              <span className="tp-col-last">{t('courses.col.last')}</span>
              <span>{t('courses.col.next')}</span>
              <span>{t('courses.col.status')}</span>
              <span />
            </div>
            <ol className="tp-list">
              {shown.map((c) => {
                const s = stateOf.get(c.id)!;
                return (
                  <li key={c.id} className={`tp-row tp-row--${s}`}>
                    <span className="tp-who">
                      <strong>
                        <bdi>{c.client}</bdi>
                      </strong>
                      <span>
                        {text(c.treatment.name)} · {cityOf(c.clinic)}
                        <span className="tp-who-spec"> · {c.specialist.name}</span>
                      </span>
                    </span>
                    <span className="tp-col-spec tp-muted">{c.specialist.name}</span>
                    <span className="tp-prog" role="img" aria-label={t('courses.progress', { done: c.done, total: c.total })}>
                      <span className="course-steps">
                        {Array.from({ length: c.total }, (_, i) => (
                          <i key={i} className={i < c.done ? 'on' : ''} />
                        ))}
                      </span>
                      <small>
                        {c.done}/{c.total}
                      </small>
                    </span>
                    <span className="tp-col-last tp-muted">
                      <span className="tp-cell-label">{t('courses.col.last')}</span>
                      {dateShort(c.last)}
                    </span>
                    <span className="tp-next">
                      <span className="tp-cell-label">{t('courses.col.next')}</span>
                      {c.planned ? `${dateShort(c.planned)} · ${clock(c.planned)}` : dateShort(c.due)}
                    </span>
                    <span className="tp-state">
                      <i className={`tp-dot tp-dot--${s}`} aria-hidden="true" />
                      {s === 'late' || s === 'due' ? status(c) : t(`courses.state.${s}`)}
                    </span>
                    <span className="tp-action">
                      {s === 'due' || s === 'late' ? (
                        c.reminded ? (
                          <span className="course-sent">
                            <Icon name="check" size={14} /> {t('courses.sent')}
                          </span>
                        ) : (
                          <button className="btn btn-ghost btn-small" onClick={() => remind([c.id])}>
                            {t('courses.remind')}
                          </button>
                        )
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="tp-empty">
            <p>{t('courses.empty')}</p>
            <button className="btn btn-ghost btn-small" onClick={reset}>
              {t('courses.filter.reset')}
            </button>
          </div>
        )}
      </section>

      <section className="card tp-series rise" style={{ '--d': '240ms' } as CSSProperties}>
        <div className="card-head">
          <div>
            <span className="eyebrow">{t('courses.sum.eyebrow')}</span>
            <h2 className="card-title">
              <Accent text={t('courses.sum.title')} />
            </h2>
          </div>
          <ul className="tp-legend">
            {BAR.map((s) => (
              <li key={s}>
                <i className={`tp-dot tp-dot--${s}`} aria-hidden="true" />
                {t(`courses.state.${s}`)}
              </li>
            ))}
          </ul>
        </div>
        <ul className="tp-series-list">
          {series.map(({ treatment: tr, total, by }) => {
            const plan = COURSE_PLAN[tr.id];
            return (
              <li key={tr.id}>
                <button className="tp-serie" aria-pressed={treatment === tr.id} onClick={() => showSeries(tr.id)}>
                  <span className="tp-serie-top">
                    <span className="tp-serie-name">
                      <strong>{text(tr.name)}</strong>
                      {plan ? <span>{t('courses.sum.plan', { sessions: plan.sessions, weeks: plan.weeks })}</span> : null}
                    </span>
                    <span className="tp-serie-count">{num(total)}</span>
                  </span>
                  <span className="tp-serie-bar" aria-hidden="true">
                    {BAR.map((s) => (by[s] ? <i key={s} className={`tp-bar-part tp-bar-part--${s}`} style={{ flexGrow: by[s] }} /> : null))}
                  </span>
                  <span className={`tp-serie-late ${by.late ? 'is-late' : ''}`}>
                    {by.late ? t('courses.sum.late', { n: by.late }) : t('courses.sum.noneLate')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
