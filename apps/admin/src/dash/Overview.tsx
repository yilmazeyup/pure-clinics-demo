import { addDays, dateKey, LOCATIONS, productById, sameDay, treatmentById, type TreatmentId } from '@pure-clinics/shared';
import { useEffect, useMemo, useState } from 'react';

import { HuidlyConnect } from '../huidly/Connect';
import { useHuidlyTeam } from '../huidly/client';
import { useHuidlyDay } from '../huidly/day';
import type { LiveStock } from '../praktijk/live/api';
import { Card } from '../praktijk/kit';

import { AgendaView } from '../components/AgendaView';
import { ClinicsView } from '../components/ClinicsView';
import { CoursesCard } from '../components/CoursesCard';
import { Insights, LiveFeed, type Insight } from '../components/panels';
import { SalesView } from '../components/SalesView';
import { ShopView } from '../components/ShopView';
import { KpiTile, MiniBars, Sparkline, Squares, useToast, type FeedItem } from '../components/ui';
import { isOpen, occupancy, phaseOf, revenueOf, ROOMS, works, type Appt } from '../data/clinics';
import { courseState, type Course } from '../data/courses';
import { diaryAt, diaryOn, happenedBy, ordersOn, paidBy, revenueAt, weekFrame, weekSales, type DayChanges, type LiveEvent } from '../data/live';
import { sendReminders, todayLive, useCourses, useReminderBatches, type ReminderBatch } from '../data/reminders';
import { orderTotal, ordersUntil, type Order } from '../data/shop';
import { useI18n, type Line } from '../i18n';

const cityOf = (clinic: Appt['clinic']) => LOCATIONS.find((l) => l.id === clinic)?.city ?? '';
/** Brows, lashes and nails are Blanche Beauty Studio's; everything else is the clinic's. */
const sourceOf = (a: Appt | Course): FeedItem['source'] => (a.treatment.category === 'beauty' ? 'blanche' : 'clinic');

function orderDetail(order: Order): Line {
  // Only gift cards: no product to name.
  if (!order.lines.length) return { key: 'ev.order.giftDetail', args: { customer: order.customer } };
  const extra = order.lines.reduce((n, l) => n + l.qty, 0) - 1;
  return { key: 'ev.order.detail', args: { customer: order.customer, product: { product: order.lines[0].product.id, extra } } };
}

function courseDetail(c: Course): Line {
  return { key: 'ev.course.detail', args: { client: c.client, treatment: { treatment: c.treatment.id }, n: c.done + 1, total: c.total } };
}

/** A press of Remind (one client) or Remind all (several) in the live feed. */
function reminderItem(b: ReminderBatch): FeedItem {
  const [first] = b.courses;
  return b.courses.length === 1
    ? { id: b.id, at: b.at, source: sourceOf(first), icon: 'mail', title: { key: 'ev.courseReminder.title' }, detail: courseDetail(first) }
    : { id: b.id, at: b.at, source: 'clinic', icon: 'mail', title: { key: 'ev.reminders.title', args: { n: b.courses.length } }, detail: { key: 'ev.reminders.detail' } };
}

/** How each moment of the day reads in the live feed. */
function feedItem(e: LiveEvent): FeedItem {
  const base = { id: e.id, at: e.at };
  switch (e.kind) {
    case 'booking': {
      const a = e.appt;
      if (a.treatment.id === 'consult') {
        return {
          ...base,
          source: 'clinic',
          icon: 'plus',
          title: { key: 'ev.consult.title' },
          detail: { key: 'ev.consult.detail', args: { client: a.client, city: cityOf(a.clinic), time: a.start } },
          accent: true,
        };
      }
      return {
        ...base,
        source: sourceOf(a),
        icon: 'calendar',
        title: { key: 'ev.booking.title', args: { client: a.client, treatment: { treatment: a.treatment.id } } },
        // Booked today for a later day: the day goes with the time.
        detail: sameDay(a.start, e.at)
          ? { key: 'ev.online.detail', args: { city: cityOf(a.clinic), time: a.start, specialist: a.specialist.name } }
          : { key: 'ev.onlineDay.detail', args: { city: cityOf(a.clinic), day: { date: a.start }, time: a.start, specialist: a.specialist.name } },
        amount: a.price || undefined,
        accent: true,
      };
    }
    case 'payment': {
      const a = e.appt;
      return {
        ...base,
        source: sourceOf(a),
        icon: 'card',
        title: { key: 'ev.paid.title' },
        detail: { key: 'ev.paid.detail', args: { client: a.client, treatment: { treatment: a.treatment.id }, city: cityOf(a.clinic) } },
        amount: a.price,
      };
    }
    case 'intake': {
      const a = e.appt;
      return {
        ...base,
        source: sourceOf(a),
        icon: 'clipboard',
        title: { key: 'ev.intake.title' },
        detail: { key: 'ev.intake.detail', args: { client: a.client, treatment: { treatment: a.treatment.id }, time: a.start } },
      };
    }
    case 'reminder': {
      const a = e.appt;
      return {
        ...base,
        source: sourceOf(a),
        icon: 'mail',
        title: { key: 'ev.reminder.title' },
        detail: { key: 'ev.reminder.detail', args: { client: a.client, treatment: { treatment: a.treatment.id }, time: a.start, city: cityOf(a.clinic) } },
      };
    }
    case 'order':
      return {
        ...base,
        source: 'webshop',
        icon: 'bag',
        title: { key: 'ev.order.title', args: { number: e.order.number } },
        detail: orderDetail(e.order),
        amount: e.order.total,
        accent: Boolean(e.order.afterTreatment),
      };
    case 'course':
      return { ...base, source: sourceOf(e.course), icon: 'repeat', title: { key: 'ev.course.title' }, detail: courseDetail(e.course), accent: true };
    case 'member':
      return { ...base, source: 'clinic', icon: 'star', title: { key: 'ev.member.title' }, detail: { key: 'ev.member.detail', args: { client: e.client } } };
    case 'request': {
      const r = e.request;
      const treatment = treatmentById(r.treatment as TreatmentId);
      return {
        ...base,
        source: treatment?.category === 'beauty' ? 'blanche' : 'clinic',
        icon: 'queue',
        title: { key: 'ev.request.title', args: { client: r.client } },
        detail: {
          key: 'ev.request.detail',
          args: {
            treatment: treatment ? { treatment: treatment.id } : r.treatment,
            city: cityOf(r.location),
            day: { date: new Date(`${r.date}T12:00:00`) },
            part: { msg: `ev.part.${r.part}` },
          },
        },
        accent: true,
      };
    }
  }
}

type Props = { now: Date; playing: boolean; onCourses: () => void; onAgenda: () => void };

/**
 * The overview shows the day as Huidly has it (huidly/day.ts): the agenda as the team changed it in Kliniek, the real
 * orders and new members. Without the team's Huidly connection it asks for it, and shows no day of its own.
 */
export function Overview(props: Props) {
  const { t } = useI18n();
  const team = useHuidlyTeam();
  const day = useHuidlyDay();
  if (!team) return <HuidlyConnect what={t('hy.why.overview')} />;
  if (day.status === 'ready' && day.changes) return <OverviewDay {...props} changes={day.changes} stock={day.stock} />;
  return (
    <Card eyebrow={t('hy.eyebrow')} title={t(day.status === 'error' ? 'hy.day.failed' : 'hy.day.loading')} className="hy-connect">
      {day.status === 'error' ? (
        <button className="btn btn-ghost" type="button" onClick={day.retry}>
          {t('hy.day.retry')}
        </button>
      ) : null}
    </Card>
  );
}

/** The one overview of Pure Clinics: both clinics, the treatment series, the webshop and the week, all following the clock. */
function OverviewDay({ now, playing, onCourses, onAgenda, changes, stock }: Props & { changes: DayChanges; stock: LiveStock[] }) {
  const { t, eur, num, pct, locale, weekdayLong } = useI18n();
  const toast = useToast();
  const dayKey = dateKey(now);
  // The day's stream is fixed; the clock decides how much of it has happened. It is worked out once a day and shared
  // with the full page of treatment plans, like the reminders sent from either page.
  const live = todayLive(now, changes);
  const batches = useReminderBatches();
  const actions = useMemo(() => batches.filter((b) => b.day === dayKey).map(reminderItem), [batches, dayKey]);
  const [focus, setFocus] = useState<number | null>(null);

  // A new language rebuilds the clinic models, which open on both clinics again.
  useEffect(() => setFocus(null), [locale]);

  const clinicsDay = live.day;
  const isClinicDay = sameDay(clinicsDay, now);
  const happened = useMemo(() => happenedBy(live.events, now), [live, now]);
  const appts = useMemo(() => (isClinicDay ? diaryAt(live.appts, now) : live.appts), [live, now, isClinicDay]);
  const todaysOrders = useMemo(() => ordersUntil(live.orders, now), [live, now]);

  const courses = useCourses(now, live);

  const feed = useMemo(
    () =>
      [...happened.map(feedItem), ...actions.filter((a) => a.at.getTime() <= now.getTime())]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 60),
    [happened, actions, now],
  );

  /** Reminders for clients who are due for their next session; in the demo nothing is really sent. */
  const remind = (ids: string[]) => {
    const picked = sendReminders(courses, ids, now);
    if (picked.length) toast(t('courses.toast', { n: picked.length }));
  };

  // Revenue so far: treatments paid at the desk and webshop orders, against the same weekday at this time of day.
  const paid = isClinicDay ? revenueOf(paidBy(appts, now)) : 0;
  const shopToday = orderTotal(todaysOrders);
  const revenue = paid + shopToday;
  const past = useMemo(
    () =>
      [7, 14, 21, 28].map((days) => {
        const then = addDays(now, -days);
        return { appts: diaryOn(then, changes.agenda), orders: ordersOn(changes.orders, then) };
      }),
    [dayKey, changes],
  );
  const usual = past.reduce((total, p) => total + revenueAt(p.appts, p.orders, now), 0) / past.length;
  const history = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const day = addDays(now, i - 13);
        return revenueOf(diaryOn(day, changes.agenda)) + orderTotal(ordersOn(changes.orders, day));
      }),
    [dayKey, changes],
  );
  const frame = useMemo(() => weekFrame(now, changes), [dayKey, changes]);
  const week = useMemo(() => weekSales(frame, live, now), [frame, live, now]);

  const running = isClinicDay ? appts.filter((a) => phaseOf(a, now) === 'now').length : 0;
  const staffed = LOCATIONS.reduce((n, l) => n + (isOpen(l.id, clinicsDay) ? ROOMS[l.id].filter((s) => works(s, clinicsDay)).length : 0), 0);
  const intakes = appts.filter((a) => a.treatment.id === 'consult').length;
  const newClients = appts.filter((a) => a.firstVisit).length;
  const apptsPerHour = Array.from({ length: 13 }, (_, i) => appts.filter((a) => a.start.getHours() === 9 + i).length);
  const ordersPerHour = Array.from({ length: 17 }, (_, i) => todaysOrders.filter((o) => o.at.getHours() === 7 + i).length);

  const due = courses.filter((c) => {
    const state = courseState(c, now);
    return state === 'due' || state === 'late';
  });
  const waiting = due.filter((c) => !c.reminded);
  const aftercare = productById('zo-spf')!;
  // What the webshop has left of it, as Huidly counts it.
  const aftercareLeft = stock.find((s) => s.product === aftercare.id)?.stock;
  const insights: Insight[] = [
    {
      id: 'followUp',
      icon: 'repeat',
      title: t('tip.followUp.title', { n: due.length }),
      body: t('tip.followUp.body'),
      action: t('tip.followUp.action'),
      run: waiting.length ? () => remind(waiting.map((c) => c.id)) : undefined,
    },
    { id: 'season', icon: 'sun', title: t('tip.season.title'), body: t('tip.season.body'), action: t('tip.season.action') },
    ...(aftercareLeft === undefined
      ? []
      : [
          {
            id: 'stock',
            icon: 'bag' as const,
            title: t('tip.stock.title', { product: { product: aftercare.id } }),
            body: t('tip.stock.body', { n: aftercareLeft }),
            action: t('tip.stock.action'),
          },
        ]),
    { id: 'intake', icon: 'trend', title: t('tip.intake.title'), body: t('tip.intake.body'), action: t('tip.intake.action') },
  ];

  return (
    <div className="dash">
      <KpiTile
        index={0}
        label={t('kpi.revenue')}
        value={revenue}
        format={eur}
        delta={usual > 0 ? revenue / usual - 1 : undefined}
        sub={t('kpi.revenueSub', { weekday: weekdayLong(now) })}
        chart={<Sparkline values={[...history.slice(0, -1), revenue]} />}
      />
      <KpiTile
        index={1}
        label={t('kpi.treatments')}
        value={appts.length}
        format={num}
        sub={isClinicDay ? t('kpi.treatmentsSub', { n: running }) : t('kpi.treatmentsClosed')}
        chart={<MiniBars values={apptsPerHour} current={isClinicDay ? now.getHours() - 9 : -1} />}
      />
      <KpiTile
        index={2}
        label={t('kpi.occupancy')}
        value={occupancy(appts, clinicsDay)}
        format={pct}
        sub={t('kpi.occupancySub', { intakes, first: newClients })}
        chart={<Squares total={staffed} filled={running} size={10} />}
      />
      <KpiTile
        index={3}
        label={t('kpi.webshop')}
        value={todaysOrders.length}
        format={num}
        sub={t('kpi.webshopSub', { revenue: eur(shopToday), avg: eur(todaysOrders.length ? shopToday / todaysOrders.length : 0) })}
        chart={<MiniBars values={ordersPerHour} current={now.getHours() - 7} />}
      />

      {/* The 3D views draw their labels once, so a new language rebuilds them. */}
      <ClinicsView key={`clinics-${locale}`} appts={appts} day={clinicsDay} now={now} focus={focus} onFocus={setFocus} events={happened} fast={playing} />
      <LiveFeed items={feed} now={now} />
      <AgendaView appts={appts} day={clinicsDay} now={now} onOpen={onAgenda} />
      <CoursesCard courses={courses} now={now} onRemind={remind} onOpen={onCourses} />
      <ShopView key={`shop-${locale}`} orders={live.orders} stock={stock} now={now} fast={playing} />
      <SalesView key={`sales-${locale}`} week={week} now={now} events={happened} fast={playing} />
      <Insights items={insights} />
    </div>
  );
}
