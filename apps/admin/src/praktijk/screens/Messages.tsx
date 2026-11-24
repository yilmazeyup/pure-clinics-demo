import { addDays, LOCATIONS, productsAfter, treatmentById, treatmentInfo, type TreatmentId } from '@pure-clinics/shared';
import { useEffect, useMemo, useState } from 'react';

import type { Appt } from '../../data/clinics';
import { useI18n, type I18n, type MessageKey } from '../../i18n';
import { usePraktijk } from '../context';
import { agendaDay, clientFor, practiceClients, STAFF, staffById, type StaffId } from '../data/core';
import { deliveryOf, MESSAGE_TEMPLATES, NEXT_WEEKS, SEED_REMINDERS, seedNotes, type MessageTemplate, type Note } from '../data/messages';
import { PORTAL_URL } from '../data/portal';
import { PkIcon, type PkIconName } from '../icons';
import { Avatar, Card, Chip, Empty, Field, Seg, Stat, TableWrap, Toggle } from '../kit';
import { Newsletter } from './messages/Newsletter';
import { TemplateEditor, TOKEN_ARGS, type Channel, type Token } from './messages/template';
import './responsive.css';
import './Messages.css';
import { useTabInView } from './useTabInView';

type Tab = 'reminders' | 'templates' | 'ai' | 'news' | 'notepad' | 'settings';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const FEATURE_TAB: Record<string, Tab> = {
  'q.reminders': 'reminders',
  'more.whatsapp': 'reminders',
  'q.templates': 'templates',
  'q.ai': 'ai',
  'q.newsFilters': 'news',
  'q.newsConsent': 'news',
  'q.newsContent': 'news',
  'q.newsSend': 'news',
  'q.newsUnsub': 'news',
  'q.notepad': 'notepad',
  'q.smtp': 'settings',
};

const CHANNEL_ICON: Record<Channel, PkIconName> = { email: 'mail', sms: 'sms', whatsapp: 'whatsapp' };

/** Berichten: automatic reminders, the fixed texts, the AI aftercare mail, the newsletter and the team's notepad. */
export function MessagesScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const [tab, setTab] = useState<Tab>('reminders');
  useTabInView(tab);
  const [jump, setJump] = useState<{ feature: string; at: number } | null>(null);

  useEffect(() => {
    const feature = target?.feature;
    const next = feature ? FEATURE_TAB[feature] : undefined;
    if (!feature || !next) return;
    setTab(next);
    setJump({ feature, at: target!.at });
  }, [target?.at]);

  return (
    <div className="pk-me">
      <Seg
        variant="tabs"
        value={tab}
        onChange={setTab}
        label={t('pk.berichten.tabs')}
        options={[
          { value: 'reminders', label: t('pk.berichten.tab.reminders'), icon: 'bell' },
          { value: 'templates', label: t('pk.berichten.tab.templates'), icon: 'file' },
          { value: 'ai', label: t('pk.berichten.tab.ai'), icon: 'wand' },
          { value: 'news', label: t('pk.berichten.tab.news'), icon: 'mail' },
          { value: 'notepad', label: t('pk.berichten.tab.notepad'), icon: 'edit' },
          { value: 'settings', label: t('pk.berichten.tab.settings'), icon: 'cog' },
        ]}
      />
      {/* Marketing mail and SMS campaigns live in Campagnes (Mailchimp); reminders and fixed messages stay here. */}
      <p className="pk-me-pointer pk-small">
        <PkIcon name="send" size={15} />
        <span>{t('pk.berichten.toCampagnes')}</span>
        <button className="btn btn-ghost btn-small" onClick={() => (window.location.hash = 'campagnes/campagnes')}>
          {t('pk.berichten.toCampagnesOpen')}
          <PkIcon name="arrow" size={14} />
        </button>
      </p>
      {tab === 'reminders' ? <Reminders /> : null}
      {tab === 'templates' ? <Templates /> : null}
      {tab === 'ai' ? <Aftercare /> : null}
      {tab === 'news' ? <Newsletter jump={jump} /> : null}
      {tab === 'notepad' ? <Notepad /> : null}
      {tab === 'settings' ? <SendSettings /> : null}
    </div>
  );
}

/* ---------- Reminders ---------- */

const cityOfAppt = (a: Appt) => LOCATIONS.find((l) => l.id === a.clinic)?.city ?? '';

function Reminders() {
  const i18n = useI18n();
  const { t, text, clock, num, pct, weekdayLong, dayLong } = i18n;
  const { today, demo } = usePraktijk();
  const [settings, setSettings] = useState(SEED_REMINDERS);
  const [allQueue, setAllQueue] = useState(false);
  const [allLog, setAllLog] = useState(false);

  /** The channels a reminder goes out on: switched on here and ticked on the client's file. */
  const channelsFor = (a: Appt): Channel[] => {
    const c = clientFor(a.client, a.clinic, today);
    const out: Channel[] = [];
    if (settings.email && c.flags.email) out.push('email');
    if (settings.sms && c.flags.sms) out.push('sms');
    if (settings.whatsapp && c.flags.sms) out.push('whatsapp');
    return out;
  };

  const day = addDays(today, settings.hours / 24);
  const queue = useMemo(() => agendaDay(day), [day.getTime()]);
  const log = useMemo(() => agendaDay(today), [today]);
  const logged = log.flatMap((a) => channelsFor(a).map((ch) => deliveryOf(a.id, ch)));
  const queued = queue.reduce((n, a) => n + channelsFor(a).length, 0);
  const dayLabel = dayLong(day);

  const status = (a: Appt, ch: Channel) => {
    const s = deliveryOf(a.id, ch);
    const tone = s === 'opened' ? 'good' : s === 'failed' ? 'bad' : 'neutral';
    const label = s === 'opened' ? t('pk.berichten.rem.opened') : s === 'failed' ? t('pk.berichten.rem.failed') : t('pk.berichten.rem.delivered');
    const why = s === 'failed' ? t(ch === 'email' ? 'pk.berichten.rem.failedEmail' : 'pk.berichten.rem.failedSms') : undefined;
    return (
      <Chip key={ch} tone={tone} icon={CHANNEL_ICON[ch]} title={why}>
        {label}
      </Chip>
    );
  };

  return (
    <>
      <div className="pk-stats">
        <Stat label={t('pk.berichten.rem.statTonight')} value={num(queued)} sub={t('pk.berichten.rem.statTonightSub')} />
        <Stat
          label={t('pk.berichten.rem.statDelivered')}
          value={logged.length ? pct(logged.filter((s) => s !== 'failed').length / logged.length) : '—'}
          sub={t('pk.berichten.rem.statDeliveredSub')}
          tone="good"
        />
        <Stat
          label={t('pk.berichten.rem.statRead')}
          value={logged.length ? pct(logged.filter((s) => s === 'opened').length / logged.length) : '—'}
          sub={t('pk.berichten.rem.statReadSub')}
        />
      </div>
      <div className="pk-grid">
        <Card feature="q.reminders" className="span-4" eyebrow={t('pk.berichten.rem.eyebrow')} title={t('pk.berichten.rem.title')} help={t('pk.berichten.rem.help')}>
          <Toggle checked={settings.email} onChange={(email) => setSettings({ ...settings, email })} label={t('pk.berichten.rem.email')} />
          <Toggle checked={settings.sms} onChange={(sms) => setSettings({ ...settings, sms })} label={t('pk.berichten.rem.sms')} />
          <div data-feature="more.whatsapp" className="pk-me-wa">
            <Toggle
              checked={settings.whatsapp}
              onChange={(whatsapp) => setSettings({ ...settings, whatsapp })}
              label={
                <span className="pk-row">
                  {t('pk.berichten.rem.whatsapp')}
                  <Chip tone="now" icon="whatsapp">
                    WhatsApp
                  </Chip>
                </span>
              }
              hint={t('pk.berichten.rem.whatsappHint')}
            />
          </div>
          <div className="pk-form pk-me-rem-form">
            <Field label={t('pk.berichten.rem.hours')}>
              <select className="pk-input" value={settings.hours} onChange={(e) => setSettings({ ...settings, hours: Number(e.target.value) as 24 | 48 })}>
                {[24, 48].map((h) => (
                  <option key={h} value={h}>
                    {t('pk.berichten.rem.hoursN', { n: h })}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('pk.berichten.rem.time')}>
              <select className="pk-input" value={settings.time} onChange={(e) => setSettings({ ...settings, time: e.target.value })}>
                {['01:00', '02:00', '03:00', '06:00'].map((h) => (
                  <option key={h} value={h}>
                    {t('pk.berichten.rem.night', { time: h })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="pk-me-note">
            <PkIcon name="shieldCheck" size={15} />
            {t('pk.berichten.rem.consent')}
          </p>
        </Card>

        <Card
          className="span-8"
          eyebrow={t('pk.berichten.rem.queueTitle')}
          title={t('pk.berichten.rem.queueFor', { day: dayLabel })}
          actions={
            <button
              className="btn btn-ghost btn-small"
              disabled={!queued}
              onClick={() => demo(t('pk.berichten.rem.sentNow', { n: queued }))}
            >
              <PkIcon name="send" size={14} />
              {t('pk.berichten.rem.sendNow')}
            </button>
          }
        >
          {queue.length ? (
            <>
              <TableWrap label={t('pk.berichten.rem.queueTitle')}>
                <table className="pk-table pk-cards">
                  <thead>
                    <tr>
                      <th>{t('pk.common.time')}</th>
                      <th>{t('pk.common.client')}</th>
                      <th>{t('pk.common.treatment')}</th>
                      <th>{t('pk.common.location')}</th>
                      <th>{t('pk.berichten.rem.channels')}</th>
                      <th>{t('pk.common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(allQueue ? queue : queue.slice(0, 8)).map((a) => {
                      const channels = channelsFor(a);
                      return (
                        <tr key={a.id}>
                          <td className="pk-num pk-cell-inline">{clock(a.start)}</td>
                          <td className="nowrap pk-cell-main">{a.client}</td>
                          <td className="pk-cell-inline">{text(a.treatment.name)}</td>
                          <td className="pk-cell-inline">{cityOfAppt(a)}</td>
                          <td className="pk-cell-side">
                            <span className="pk-me-channels">
                              {channels.length ? (
                                channels.map((ch) => (
                                  <span key={ch} className="pk-me-ch" title={t(`pk.berichten.channel.${ch}`)}>
                                    <PkIcon name={CHANNEL_ICON[ch]} size={15} />
                                  </span>
                                ))
                              ) : (
                                <Chip tone="outline">{t('pk.berichten.rem.noChannel')}</Chip>
                              )}
                            </span>
                          </td>
                          <td className="nowrap pk-muted pk-cell-hide">{channels.length ? t('pk.berichten.rem.queued', { time: settings.time }) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
              {queue.length > 8 ? (
                <button className="pk-me-link pk-me-more" onClick={() => setAllQueue(!allQueue)}>
                  {allQueue ? t('pk.berichten.rem.showLess') : t('pk.berichten.rem.showAll', { n: queue.length })}
                </button>
              ) : null}
            </>
          ) : (
            <Empty>{t('pk.berichten.rem.queueEmpty', { day: dayLabel })}</Empty>
          )}
        </Card>
      </div>

      <Card eyebrow={t('pk.berichten.rem.logTitle')} title={t('pk.berichten.rem.logFor')}>
        {log.length ? (
          <>
            <TableWrap label={t('pk.berichten.rem.logTitle')}>
              <table className="pk-table pk-cards">
                <thead>
                  <tr>
                    <th>{t('pk.common.sent')}</th>
                    <th>{t('pk.common.client')}</th>
                    <th>{t('pk.common.treatment')}</th>
                    <th>{t('pk.common.time')}</th>
                    <th>{t('pk.common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(allLog ? log : log.slice(0, 8)).map((a, i) => {
                    const channels = channelsFor(a);
                    return (
                      <tr key={a.id}>
                        <td className="pk-num pk-muted pk-cell-inline">{`02:0${Math.min(9, Math.floor(i / 6))}`}</td>
                        <td className="nowrap pk-cell-main">{a.client}</td>
                        <td className="pk-cell-inline">{text(a.treatment.name)}</td>
                        <td className="pk-num pk-cell-inline">
                          {clock(a.start)} · {cityOfAppt(a)}
                        </td>
                        <td className="pk-cell-full">
                          <span className="pk-me-channels">{channels.length ? channels.map((ch) => status(a, ch)) : <Chip tone="outline">{t('pk.berichten.rem.noChannel')}</Chip>}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            {log.length > 8 ? (
              <button className="pk-me-link pk-me-more" onClick={() => setAllLog(!allLog)}>
                {allLog ? t('pk.berichten.rem.showLess') : t('pk.berichten.rem.showAll', { n: log.length })}
              </button>
            ) : null}
          </>
        ) : (
          <Empty>{t('pk.berichten.rem.queueEmpty', { day: weekdayLong(today) })}</Empty>
        )}
      </Card>
    </>
  );
}

/* ---------- Templates ---------- */

const TEMPLATE_LABEL: Record<MessageTemplate['id'], MessageKey> = {
  reminderEmail: 'pk.berichten.tpl.reminderEmail',
  reminderSms: 'pk.berichten.tpl.reminderSms',
  reminderWhatsapp: 'pk.berichten.tpl.reminderWhatsapp',
  intakeForm: 'pk.berichten.tpl.intakeForm',
  followUp: 'pk.berichten.tpl.followUp',
  review: 'pk.berichten.tpl.review',
};

/** Only e-mails have a subject; sms and WhatsApp are one text. */
const TEMPLATE_SUBJECT: Partial<Record<MessageTemplate['id'], MessageKey>> = {
  reminderEmail: 'pk.berichten.tpl.reminderEmail.subject',
  intakeForm: 'pk.berichten.tpl.intakeForm.subject',
  followUp: 'pk.berichten.tpl.followUp.subject',
  review: 'pk.berichten.tpl.review.subject',
};

const TEMPLATE_TOKENS: Token[] = ['voornaam', 'achternaam', 'datum', 'tijd', 'behandeling', 'locatie', 'specialist', 'link'];

/** A real client and tomorrow's laser appointment, so the preview reads like an actual message. */
function useSample(): { values: Partial<Record<Token, string>>; name: string } {
  const { text, dateShort } = useI18n();
  const { today } = usePraktijk();
  const client = practiceClients(today).find((c) => c.flags.sms) ?? practiceClients(today)[0];
  const [tussen, ...rest] = /^(de|van|van der|van den|ter|te)\s/i.test(client.last) ? client.last.split(/\s(?=\S+$)/) : ['', client.last];
  return {
    name: `${client.first} ${client.last}`,
    values: {
      voornaam: client.first,
      voorletters: `${client.first[0]}.`,
      tussenvoegsel: tussen,
      achternaam: rest.join(' ') || client.last,
      datum: dateShort(addDays(today, 1)),
      tijd: '10:30',
      behandeling: text(treatmentById('laser').name),
      locatie: client.city === 'Uden' || client.locationId === 'uden' ? 'Uden' : 'Nijmegen',
      specialist: 'Maud',
      link: PORTAL_URL,
    },
  };
}

type Draft = { subject: string | null; body: string | null };

function Templates() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const sample = useSample();
  const [which, setWhich] = useState<MessageTemplate['id']>('reminderEmail');
  const [drafts, setDrafts] = useState<Partial<Record<MessageTemplate['id'], Draft>>>({});
  const tpl = MESSAGE_TEMPLATES.find((x) => x.id === which)!;
  const draft = drafts[which] ?? { subject: null, body: null };
  const subjectKey = TEMPLATE_SUBJECT[which];
  const subject = subjectKey ? (draft.subject ?? t(subjectKey, TOKEN_ARGS)) : undefined;
  const body = draft.body ?? t(`pk.berichten.tpl.${which}.body`, TOKEN_ARGS);
  const update = (patch: Partial<Draft>) => setDrafts({ ...drafts, [which]: { ...draft, ...patch } });

  return (
    <Card
      feature="q.templates"
      eyebrow={t('pk.berichten.tpl.eyebrow')}
      title={t('pk.berichten.tpl.title')}
      help={t('pk.berichten.tpl.help')}
      actions={
        <button className="btn btn-primary btn-small" onClick={() => demo(t('pk.common.demoSaved'))}>
          <PkIcon name="check" size={14} />
          {t('pk.common.save')}
        </button>
      }
    >
      <div className="pk-me-tpl">
        <ul className="pk-me-tpl-list" role="listbox" aria-label={t('pk.berichten.tpl.eyebrow')}>
          {MESSAGE_TEMPLATES.map((x) => (
            <li key={x.id}>
              <button role="option" aria-selected={x.id === which} onClick={() => setWhich(x.id)}>
                <PkIcon name={CHANNEL_ICON[x.channel]} size={16} />
                <span>
                  {t(TEMPLATE_LABEL[x.id])}
                  {drafts[x.id] ? <small>{t('pk.common.edit')}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <TemplateEditor
          key={which}
          channel={tpl.channel}
          subject={subject}
          body={body}
          onSubject={subjectKey ? (v) => update({ subject: v }) : undefined}
          onBody={(v) => update({ body: v })}
          tokens={TEMPLATE_TOKENS}
          sample={sample.values}
          sampleName={sample.name}
          onReset={drafts[which] ? () => setDrafts({ ...drafts, [which]: undefined }) : undefined}
        />
      </div>
    </Card>
  );
}

/* ---------- AI aftercare ---------- */

/**
 * A personal aftercare e-mail, written from the treatment's aftercare advice (the same texts as the member app), the
 * product the specialist would suggest and the next step in the series. Template-based, so the demo is the same every
 * time; in the real module a language model writes it and the specialist checks it.
 */
function aftercareMail(a: Appt, length: 'short' | 'full', i18n: I18n): { subject: string; body: string } {
  const { t, text } = i18n;
  const first = a.client.split(' ')[0];
  const specialist = a.specialist.name;
  const id: TreatmentId = a.treatment.id;
  const advice = treatmentInfo(id)?.aftercare?.map(text);
  const fallback: MessageKey[] =
    id === 'brows'
      ? ['pk.berichten.ai.tipBrows', 'pk.berichten.ai.tipCall']
      : id === 'nails'
        ? ['pk.berichten.ai.tipNails']
        : id === 'consult'
          ? ['pk.berichten.ai.tipIntake']
          : ['pk.berichten.ai.tipCalm', 'pk.berichten.ai.tipSpf'];
  let tips = advice?.length ? advice : fallback.map((k) => t(k));
  if (length === 'short') tips = tips.slice(0, 2);
  else if (a.treatment.category !== 'beauty') tips = [...tips, t('pk.berichten.ai.tipCall')];

  const lines = [
    t('pk.berichten.ai.greeting', { name: first }),
    '',
    length === 'full' ? t('pk.berichten.ai.intro', { specialist, treatment: { treatment: id } }) : t('pk.berichten.ai.introShort'),
    '',
    `${t('pk.berichten.ai.tips')}:`,
    ...tips.map((tip) => `• ${tip}`),
  ];
  const product = productsAfter(id)[0];
  if (product && length === 'full') lines.push('', t('pk.berichten.ai.product', { specialist, product: { product: product.id } }));
  const weeks = NEXT_WEEKS[id];
  if (id === 'consult') lines.push('', t('pk.berichten.ai.nextIntake'));
  else if (weeks) lines.push('', t('pk.berichten.ai.next', { weeks }));
  lines.push('', t('pk.berichten.ai.closing', { specialist }));
  return { subject: t('pk.berichten.ai.subject', { treatment: { treatment: id } }), body: lines.join('\n') };
}

function Aftercare() {
  const i18n = useI18n();
  const { t, text, clock } = i18n;
  const { today, now, demo } = usePraktijk();
  const appts = useMemo(() => agendaDay(today), [today]);
  const firstDone = appts.find((a) => a.end <= now && a.treatment.category !== 'consult') ?? appts[0];
  const [pick, setPick] = useState<string>(firstDone?.id ?? '');
  const [length, setLength] = useState<'short' | 'full'>('full');
  const [mail, setMail] = useState<{ subject: string; body: string } | null>(null);
  const [typed, setTyped] = useState(0);
  const [sent, setSent] = useState<{ id: string; client: string; treatment: string; at: Date }[]>([]);
  const appt = appts.find((a) => a.id === pick);
  const writing = mail !== null && typed < mail.body.length;

  // The text appears as if it is being written, a few characters per frame.
  useEffect(() => {
    if (!writing) return;
    const id = window.setTimeout(() => setTyped((n) => n + 7), 16);
    return () => window.clearTimeout(id);
  }, [writing, typed]);

  const write = () => {
    if (!appt) return;
    setMail(aftercareMail(appt, length, i18n));
    setTyped(0);
  };

  return (
    <div className="pk-grid">
      <Card feature="q.ai" className="span-5" eyebrow={t('pk.berichten.ai.eyebrow')} title={t('pk.berichten.ai.title')} help={t('pk.berichten.ai.help')}>
        {appts.length ? (
          <div className="pk-stack">
            <Field label={t('pk.berichten.ai.pick')}>
              <select className="pk-input" value={pick} onChange={(e) => setPick(e.target.value)}>
                {appts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {clock(a.start)} · {a.client} · {text(a.treatment.name)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="pk-field">
              <span className="pk-field-label">{t('pk.berichten.ai.length')}</span>
              <Seg
                value={length}
                label={t('pk.berichten.ai.length')}
                onChange={setLength}
                options={[
                  { value: 'short', label: t('pk.berichten.ai.short') },
                  { value: 'full', label: t('pk.berichten.ai.full') },
                ]}
              />
            </div>
            <div>
              <button className="btn btn-primary" disabled={!appt || writing} onClick={write}>
                <PkIcon name="wand" size={15} />
                {mail ? t('pk.berichten.ai.rewrite') : t('pk.berichten.ai.write')}
              </button>
            </div>
            {appt ? (
              <div className="pk-me-appt">
                <Avatar staff={staffById(appt.specialist.id)} size={30} />
                <span>
                  <b>{appt.client}</b>
                  <small>
                    {text(appt.treatment.name)} · {appt.specialist.name} · {cityOfAppt(appt)}
                  </small>
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <Empty>{t('pk.berichten.rem.queueEmpty', { day: i18n.weekdayLong(today) })}</Empty>
        )}
      </Card>

      <Card
        className="span-7"
        eyebrow={t('pk.berichten.preview')}
        title={mail?.subject ?? t('pk.berichten.ai.eyebrow')}
        actions={mail ? <Chip tone="warn" icon="sparkle">{writing ? t('pk.berichten.ai.writing') : t('pk.berichten.ai.concept')}</Chip> : null}
      >
        {mail && appt ? (
          <div className="pk-stack">
            <Field label={t('pk.berichten.subject')}>
              <input className="pk-input" value={mail.subject} disabled={writing} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
            </Field>
            <Field label={t('pk.berichten.body')}>
              <textarea
                className={`pk-input pk-me-ai ${writing ? 'is-writing' : ''}`}
                rows={16}
                readOnly={writing}
                value={writing ? mail.body.slice(0, typed) : mail.body}
                onChange={(e) => {
                  setMail({ ...mail, body: e.target.value });
                  setTyped(e.target.value.length);
                }}
              />
            </Field>
            <div className="pk-row">
              <button
                className="btn btn-primary"
                disabled={writing}
                onClick={() => {
                  setSent([{ id: `${appt.id}-${Date.now()}`, client: appt.client, treatment: text(appt.treatment.name), at: now }, ...sent]);
                  demo(t('pk.berichten.ai.sent', { name: appt.client }));
                  setMail(null);
                }}
              >
                <PkIcon name="send" size={15} />
                {t('pk.berichten.ai.send', { name: appt.client })}
              </button>
            </div>
          </div>
        ) : (
          <Empty>{t('pk.berichten.ai.empty')}</Empty>
        )}
        {sent.length ? (
          <div className="pk-me-sent">
            <span className="eyebrow">{t('pk.berichten.ai.sentList')}</span>
            <ul className="pk-list">
              {sent.map((s) => (
                <li key={s.id}>
                  <PkIcon name="check" size={15} />
                  <span>
                    {s.client} · {s.treatment}
                  </span>
                  <span className="pk-muted pk-small">{clock(s.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ---------- Notepad ---------- */

function Notepad() {
  const { t, ago } = useI18n();
  const { now } = usePraktijk();
  const [notes, setNotes] = useState<Note[]>(() => seedNotes(now));
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState<StaffId>('husna');
  const sorted = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.getTime() - a.at.getTime());

  const add = () => {
    if (!draft.trim()) return;
    setNotes([{ id: `note-${Date.now()}`, author, at: now, text: draft.trim(), pinned: false }, ...notes]);
    setDraft('');
  };

  return (
    <Card feature="q.notepad" eyebrow={t('pk.berichten.note.eyebrow')} title={t('pk.berichten.note.title')} help={t('pk.berichten.note.help')}>
      <div className="pk-me-compose-note">
        <textarea className="pk-input" rows={3} value={draft} placeholder={t('pk.berichten.note.placeholder')} aria-label={t('pk.berichten.note.placeholder')} onChange={(e) => setDraft(e.target.value)} />
        <div className="pk-row pk-row--between">
          <label className="pk-row pk-small">
            <span className="pk-muted">{t('pk.berichten.note.as')}</span>
            <select className="pk-input pk-me-author" value={author} onChange={(e) => setAuthor(e.target.value as StaffId)}>
              {STAFF.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={!draft.trim()} onClick={add}>
            <PkIcon name="plus" size={15} />
            {t('pk.berichten.note.add')}
          </button>
        </div>
      </div>
      <ul className="pk-me-notes">
        {sorted.map((n) => {
          const s = staffById(n.author);
          return (
            <li key={n.id} className={n.pinned ? 'is-pinned' : ''}>
              <Avatar staff={s} size={34} />
              <div className="pk-me-note-body">
                <div className="pk-me-note-meta">
                  <b>{s.name}</b>
                  <span className="pk-muted pk-small">{ago(n.at, now)}</span>
                  {n.pinned ? <Chip tone="brand" icon="pin">{t('pk.berichten.note.pinned')}</Chip> : null}
                </div>
                <p>{n.text ?? (n.textKey ? t(n.textKey) : '')}</p>
              </div>
              <span className="pk-me-note-actions">
                <button
                  className="icon-button small"
                  aria-label={n.pinned ? t('pk.berichten.note.unpin') : t('pk.berichten.note.pin')}
                  title={n.pinned ? t('pk.berichten.note.unpin') : t('pk.berichten.note.pin')}
                  onClick={() => setNotes(notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)))}
                >
                  <PkIcon name="pin" size={15} />
                </button>
                <button className="icon-button small" aria-label={t('pk.berichten.note.delete')} title={t('pk.berichten.note.delete')} onClick={() => setNotes(notes.filter((x) => x.id !== n.id))}>
                  <PkIcon name="trash" size={15} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- Sending settings ---------- */

function SendSettings() {
  const { t } = useI18n();
  const [own, setOwn] = useState(true);
  const [smtp, setSmtp] = useState({ host: 'smtp.pureclinics.nl', port: 587, user: 'noreply@pureclinics.nl', tls: true, name: 'Pure Clinics', from: 'noreply@pureclinics.nl', reply: 'info@pureclinics.nl' });
  const [test, setTest] = useState<'idle' | 'busy' | 'ok'>('idle');
  const [sender, setSender] = useState('PureClinics');
  const [wa, setWa] = useState(true);

  useEffect(() => {
    if (test !== 'busy') return;
    const id = window.setTimeout(() => setTest('ok'), 1200);
    return () => window.clearTimeout(id);
  }, [test]);

  const set = (patch: Partial<typeof smtp>) => {
    setSmtp({ ...smtp, ...patch });
    setTest('idle');
  };

  return (
    <div className="pk-grid">
      <Card feature="q.smtp" className="span-7" eyebrow={t('pk.berichten.smtp.eyebrow')} title={t('pk.berichten.smtp.title')} help={t('pk.berichten.smtp.help')}>
        <Toggle checked={own} onChange={setOwn} label={t('pk.berichten.smtp.own')} hint={t('pk.berichten.smtp.ownHint')} />
        <fieldset className="pk-me-fieldset" disabled={!own}>
          <div className="pk-form">
            <Field label={t('pk.berichten.smtp.host')}>
              <input className="pk-input" dir="ltr" value={smtp.host} onChange={(e) => set({ host: e.target.value })} />
            </Field>
            <Field label={t('pk.berichten.smtp.port')}>
              <select className="pk-input" value={smtp.port} onChange={(e) => set({ port: Number(e.target.value) })}>
                {[587, 465, 25].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('pk.berichten.smtp.user')}>
              <input className="pk-input" dir="ltr" value={smtp.user} onChange={(e) => set({ user: e.target.value })} />
            </Field>
            <Field label={t('pk.berichten.smtp.password')} hint={t('pk.berichten.smtp.passwordHint')}>
              <input className="pk-input" type="password" value="" placeholder="••••••••••" readOnly autoComplete="off" />
            </Field>
            <Field label={t('pk.berichten.smtp.senderName')}>
              <input className="pk-input" value={smtp.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label={t('pk.berichten.smtp.senderEmail')}>
              <input className="pk-input" dir="ltr" value={smtp.from} onChange={(e) => set({ from: e.target.value })} />
            </Field>
            <Field label={t('pk.berichten.smtp.replyTo')}>
              <input className="pk-input" dir="ltr" value={smtp.reply} onChange={(e) => set({ reply: e.target.value })} />
            </Field>
          </div>
          <Toggle checked={smtp.tls} onChange={(tls) => set({ tls })} label={t('pk.berichten.smtp.tls')} />
          <div className="pk-row pk-me-test-row">
            <button className="btn btn-ghost" disabled={test === 'busy'} onClick={() => setTest('busy')}>
              <PkIcon name={test === 'busy' ? 'refresh' : 'plug'} size={15} />
              {test === 'busy' ? t('pk.berichten.smtp.testing') : t('pk.berichten.smtp.test')}
            </button>
            {test === 'ok' ? (
              <Chip tone="good" icon="check">
                {t('pk.berichten.smtp.ok', { host: smtp.host, port: smtp.port, tls: smtp.tls ? t('pk.berichten.smtp.okTls') : '' })}
              </Chip>
            ) : null}
          </div>
        </fieldset>
      </Card>

      <Card className="span-5" eyebrow={t('pk.berichten.sms.eyebrow')} title={t('pk.berichten.sms.title')}>
        <Field label={t('pk.berichten.sms.sender')} hint={t('pk.berichten.sms.senderHint')}>
          <input className="pk-input" dir="ltr" maxLength={11} value={sender} onChange={(e) => setSender(e.target.value.replace(/\s/g, ''))} />
        </Field>
        <div className="pk-me-wa-box">
          <Toggle checked={wa} onChange={setWa} label={t('pk.berichten.sms.whatsappOn')} />
          <Field label={t('pk.berichten.sms.whatsapp')}>
            <span className="pk-row">
              <input className="pk-input pk-me-wa-number" dir="ltr" value={LOCATIONS[0].phone} readOnly />
              <Chip tone="good" icon="check">
                {t('pk.berichten.sms.verified')}
              </Chip>
            </span>
          </Field>
        </div>
      </Card>
    </div>
  );
}
