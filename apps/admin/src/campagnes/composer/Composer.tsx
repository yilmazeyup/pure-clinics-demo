import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../i18n';
import { staffById } from '../../praktijk/data/core';
import { PkIcon } from '../../praktijk/icons';
import { Avatar, Card, Chip } from '../../praktijk/kit';
import { STATUSES, type Campaign, type SegmentId } from '../data';
import { segmentKey, statusKey, useCp } from '../state';
import { ChannelMark, useSince } from '../ui';
import { EmailEditor } from './Email';
import { Report } from './Report';
import { SmsEditor } from './Sms';

// The composer: one campaign, from concept to sent. Planning in Mailchimp, test mails and imports are simulated in the
// browser; the labels say so.

/** "2026-12-02" and "10:00" for the date and time inputs, in local time. */
const pad = (n: number) => String(n).padStart(2, '0');
export const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const withDate = (d: Date, value: string) => {
  const [y, m, day] = value.split('-').map(Number);
  return y && m && day ? new Date(y, m - 1, day, d.getHours(), d.getMinutes()) : d;
};
export const withTime = (d: Date, value: string) => {
  const [h, min] = value.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(min) ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min) : d;
};

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** Whether a moment falls inside the quiet hours (which may run past midnight). */
export function inQuiet(d: Date, from: string, to: string) {
  const at = d.getHours() * 60 + d.getMinutes();
  const a = minutesOf(from);
  const b = minutesOf(to);
  return a <= b ? at >= a && at < b : at >= a || at < b;
}

/** Insert text at the cursor of an input or textarea; returns the new value. */
export function insertAt(el: HTMLInputElement | HTMLTextAreaElement | null, value: string, insert: string): string {
  if (!el || el.selectionStart === null) return value + insert;
  const start = el.selectionStart;
  const end = el.selectionEnd ?? start;
  window.requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + insert.length, start + insert.length);
  });
  return value.slice(0, start) + insert + value.slice(end);
}

export function Composer({ campaign: c }: { campaign: Campaign }) {
  const { t } = useI18n();
  const { route, open, update } = useCp();
  const back = () => open(route.tab);
  const author = staffById(c.author);
  const locked = c.status === 'sent' || c.status === 'scheduled';
  const step = STATUSES.indexOf(c.status);

  // Opening a campaign starts at the top of the composer.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div ref={top} className="cp-composer">
      <section className="card cp-comp-head rise">
        <div className="cp-comp-top">
          <button className="btn btn-ghost btn-small" onClick={back}>
            <PkIcon name="chevronStart" size={15} />
            {t('cp.comp.back', { tab: t(`cp.tab.${route.tab}`) })}
          </button>
          <span className="pk-row cp-comp-meta">
            <Avatar staff={author} size={26} />
            <small className="pk-muted">{t('cp.comp.author', { name: author.name })}</small>
            {c.mailchimpId ? (
              <Chip tone="outline" icon="link">
                {t('cp.comp.mailchimpId', { id: c.mailchimpId })}
              </Chip>
            ) : null}
          </span>
        </div>
        <div className="cp-comp-title">
          <ChannelMark channel={c.channel} size={34} />
          <span className="pk-stack cp-grow">
            <span className="eyebrow">{t(c.channel === 'email' ? 'cp.comp.emailCampaign' : 'cp.comp.smsCampaign')}</span>
            <input
              className="cp-name-input"
              value={c.name}
              dir="auto"
              lang="nl"
              aria-label={t('cp.comp.name')}
              disabled={locked}
              onChange={(e) => update(c.id, { name: e.target.value })}
            />
          </span>
        </div>
        <ol className="cp-track" aria-label={t('cp.comp.track')}>
          {STATUSES.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>
              <i aria-hidden="true">{i < step ? <PkIcon name="check" size={12} stroke={2.4} /> : i + 1}</i>
              {t(statusKey(s))}
            </li>
          ))}
        </ol>
      </section>

      {c.status === 'sent' && c.results ? <Report campaign={c} /> : null}
      {c.channel === 'email' ? <EmailEditor campaign={c} /> : <SmsEditor campaign={c} />}
    </div>
  );
}

/** The segment picker; for SMS only contacts with SMS consent count, as Mailchimp requires. */
export function SegmentSelect({ campaign: c, disabled }: { campaign: Campaign; disabled?: boolean }) {
  const { t, num } = useI18n();
  const { update, segment, sync } = useCp();
  const ids: SegmentId[] = c.channel === 'sms' ? ['sms', ...sync.segments.filter((s) => s.id !== 'sms').map((s) => s.id)] : ['all', ...sync.segments.filter((s) => s.id !== 'sms').map((s) => s.id), 'sms'];
  return (
    <select className="pk-input" value={c.segment} disabled={disabled} onChange={(e) => update(c.id, { segment: e.target.value as SegmentId })}>
      {ids.map((id) => {
        const s = segment(id);
        return (
          <option key={id} value={id}>
            {t(c.channel === 'sms' ? 'cp.comp.segOptionSms' : 'cp.comp.segOptionEmail', { name: t(segmentKey(id)), n: num(c.channel === 'sms' ? s.sms : s.email) })}
          </option>
        );
      })}
    </select>
  );
}

/** Review notes: the reviewer's remarks, marked solved when done; new ones are the panel user's. */
export function Comments({ campaign: c }: { campaign: Campaign }) {
  const { t } = useI18n();
  const { now, update } = useCp();
  const since = useSince();
  const [draft, setDraft] = useState('');
  const open = c.comments.filter((m) => !m.resolved).length;
  const add = () => {
    if (!draft.trim()) return;
    update(c.id, (x) => ({ comments: [...x.comments, { id: `cm-${Date.now()}`, who: null, at: new Date(), resolved: false, text: draft.trim() }] }));
    setDraft('');
  };
  return (
    <Card
      className="cp-late"
      eyebrow={t('cp.comp.reviewEyebrow')}
      title={t('cp.comp.reviewTitle')}
      actions={open ? <Chip tone="warn" icon="flag">{t('cp.comp.openComments', { n: open })}</Chip> : <Chip tone="outline">{t('cp.comp.noOpen')}</Chip>}
    >
      {c.comments.length ? (
        <ul className="cp-comments">
          {c.comments.map((m) => {
            const who = m.who ? staffById(m.who) : null;
            return (
              <li key={m.id} className={m.resolved ? 'is-resolved' : ''}>
                {who ? (
                  <Avatar staff={who} size={30} />
                ) : (
                  <span className="cp-initial cp-initial--me" aria-hidden="true">
                    PC
                  </span>
                )}
                <span className="pk-stack cp-grow">
                  <span className="pk-row">
                    <strong>{who ? who.name : t('cp.comp.you')}</strong>
                    <small className="pk-muted">{since(m.at, now)}</small>
                    {m.resolved ? <Chip tone="good" icon="check">{t('cp.comp.resolved')}</Chip> : null}
                  </span>
                  <span className="cp-comment-text">{m.key ? t(m.key) : m.text}</span>
                </span>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => update(c.id, (x) => ({ comments: x.comments.map((y) => (y.id === m.id ? { ...y, resolved: !y.resolved } : y)) }))}
                >
                  {t(m.resolved ? 'cp.comp.reopen' : 'cp.comp.resolve')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pk-muted pk-small">{t('cp.comp.noComments')}</p>
      )}
      {c.status !== 'sent' ? (
        <div className="cp-comment-new">
          <textarea className="pk-input" rows={2} value={draft} placeholder={t('cp.comp.commentPlaceholder')} aria-label={t('cp.comp.commentPlaceholder')} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn btn-ghost btn-small" disabled={!draft.trim()} onClick={add}>
            <PkIcon name="send" size={14} />
            {t('cp.comp.addComment')}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

/** A short simulated job in steps (plan in Mailchimp, import a report): progress, then done. */
export function useJob() {
  const [job, setJob] = useState<{ step: number; of: number; progress: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = (steps: number, done: () => void, each = 650) => {
    const started = performance.now();
    const total = steps * each;
    const tick = () => {
      const p = Math.min(1, (performance.now() - started) / total);
      if (p < 1) {
        setJob({ step: Math.min(steps - 1, Math.floor(p * steps)), of: steps, progress: p });
        timer.current = window.setTimeout(tick, 80);
      } else {
        setJob(null);
        done();
      }
    };
    tick();
  };
  return [job, run] as const;
}

/** The steps of a running job as a checklist with a bar. */
export function JobSteps({ job, labels }: { job: { step: number; progress: number }; labels: string[] }) {
  return (
    <div className="cp-sync-run" role="status" aria-live="polite">
      <span className="cp-progress" aria-hidden="true">
        <i style={{ width: `${job.progress * 100}%` }} />
      </span>
      <ol className="cp-sync-steps">
        {labels.map((label, i) => (
          <li key={label} className={i < job.step ? 'done' : i === job.step ? 'now' : ''}>
            <i aria-hidden="true">{i < job.step ? <PkIcon name="check" size={11} stroke={2.4} /> : null}</i>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Date and time of sending, with the quiet-hours check. */
export function When({ campaign: c, disabled }: { campaign: Campaign; disabled?: boolean }) {
  const { t } = useI18n();
  const { update } = useCp();
  return (
    <>
      <label className="pk-field">
        <span className="pk-field-label">{t('cp.comp.date')}</span>
        <input className="pk-input" type="date" value={dateValue(c.sendAt)} disabled={disabled} onChange={(e) => update(c.id, { sendAt: withDate(c.sendAt, e.target.value) })} />
      </label>
      <label className="pk-field">
        <span className="pk-field-label">{t('cp.comp.time')}</span>
        <input className="pk-input" type="time" value={timeValue(c.sendAt)} disabled={disabled} onChange={(e) => update(c.id, { sendAt: withTime(c.sendAt, e.target.value) })} />
      </label>
    </>
  );
}
