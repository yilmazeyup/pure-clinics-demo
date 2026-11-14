import { addDays } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { useShared, usePraktijk } from '../../context';
import { FORUM, IMPORT_COLUMNS, IMPORT_FIELDS, IMPORT_SOURCES, NEWS, STARTER, webinars, type ImportField, type ImportSource } from '../../data/settings';
import { Bar, Card, Chip, Field, Modal, Steps, Stat, TableWrap } from '../../kit';
import { PkIcon } from '../../icons';

/** The panel's own help page with the explainer video, in the reader's language. */
const HELP_URL = 'https://pureclinics.savastana.com/hulp/';

/** Data import from other software, the starter guide and the ways to get help. */
export function SupportTab() {
  return (
    <div className="pk-grid">
      <Import />
      <Starter />
      <HelpCentre />
      <Forum />
      <Webinars />
      <Helpdesk />
    </div>
  );
}

function Import() {
  const { t, num } = useI18n();
  const { demo } = usePraktijk();
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<ImportSource>('practice');
  const [file, setFile] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, ImportField>>(() => Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.column, c.field])));
  const [done, setDone] = useState(false);
  const steps = [t('pk.instellingen.imp.step1'), t('pk.instellingen.imp.step2'), t('pk.instellingen.imp.step3')];

  return (
    <Card className="span-7" feature="v.import" eyebrow={t('pk.instellingen.imp.eyebrow')} title={t('pk.instellingen.imp.title')} help={t('pk.instellingen.imp.help')}>
      <Steps steps={steps} current={done ? 3 : step} onStep={(i) => !done && i <= step && setStep(i)} />
      {done ? (
        <div className="pk-stack">
          <div className="pk-stats">
            <Stat label={t('pk.instellingen.imp.clients')} value={num(1284)} tone="good" />
            <Stat label={t('pk.instellingen.imp.episodes')} value={num(2391)} />
            <Stat label={t('pk.instellingen.imp.appointments')} value={num(18406)} />
            <Stat label={t('pk.instellingen.imp.doubles')} value={num(12)} sub={t('pk.instellingen.imp.doublesSub')} />
          </div>
          <div className="pk-row">
            <button
              className="btn btn-ghost btn-small"
              onClick={() => {
                setDone(false);
                setStep(0);
                setFile(null);
              }}
            >
              {t('pk.instellingen.imp.again')}
            </button>
          </div>
        </div>
      ) : step === 0 ? (
        <div className="pk-stack">
          <div className="pk-se-sources" role="radiogroup" aria-label={steps[0]}>
            {IMPORT_SOURCES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={source === s} className="pk-se-source" onClick={() => setSource(s)}>
                <PkIcon name={s === 'excel' ? 'layers' : s === 'practice' ? 'swap' : 'file'} size={20} />
                <strong>{t(`pk.instellingen.imp.source.${s}`)}</strong>
                <small className="pk-muted">{t(`pk.instellingen.imp.source.${s}.hint`)}</small>
              </button>
            ))}
          </div>
          <div className="pk-row">
            <button className="btn btn-primary btn-small" onClick={() => setStep(1)}>
              {t('pk.common.next')}
            </button>
          </div>
        </div>
      ) : step === 1 ? (
        <div className="pk-stack">
          <label className="pk-se-drop">
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f.name);
              }}
            />
            <PkIcon name="upload" size={24} />
            <strong>{file ?? t('pk.instellingen.imp.drop')}</strong>
            <small className="pk-muted">{t('pk.instellingen.imp.dropHint')}</small>
          </label>
          <div className="pk-row">
            <button className="btn btn-ghost btn-small" onClick={() => setFile('clienten-export.csv')}>
              {t('pk.instellingen.imp.sample')}
            </button>
            <button className="btn btn-primary btn-small" disabled={!file} onClick={() => setStep(2)}>
              {t('pk.common.next')}
            </button>
          </div>
        </div>
      ) : (
        <div className="pk-stack">
          <p className="pk-small pk-muted">{t('pk.instellingen.imp.mapHelp', { file: file ?? '' })}</p>
          <TableWrap label={steps[2]}>
            <table className="pk-table">
              <thead>
                <tr>
                  <th>{t('pk.instellingen.imp.column')}</th>
                  <th>{t('pk.instellingen.imp.example')}</th>
                  <th>{t('pk.instellingen.imp.field')}</th>
                </tr>
              </thead>
              <tbody>
                {IMPORT_COLUMNS.map((c) => (
                  <tr key={c.column}>
                    <td>
                      <strong>{c.column}</strong>
                    </td>
                    <td className="pk-mono pk-muted">{c.sample}</td>
                    <td>
                      <select
                        className="pk-input pk-tm-select"
                        value={mapping[c.column]}
                        aria-label={c.column}
                        onChange={(e) => setMapping((m) => ({ ...m, [c.column]: e.target.value as ImportField }))}
                      >
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f} value={f}>
                            {t(`pk.instellingen.imp.f.${f}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="pk-row">
            <button className="btn btn-ghost btn-small" onClick={() => setStep(1)}>
              {t('pk.common.previous')}
            </button>
            <button
              className="btn btn-primary btn-small"
              onClick={() => {
                setDone(true);
                demo(t('pk.instellingen.imp.doneToast'));
              }}
            >
              <PkIcon name="download" size={14} />
              {t('pk.instellingen.imp.run')}
            </button>
          </div>
          <p className="pk-small pk-muted">{t('pk.instellingen.imp.free')}</p>
        </div>
      )}
    </Card>
  );
}

function Starter() {
  const { t } = useI18n();
  const { go } = usePraktijk();
  const [done, setDone] = useShared<Record<string, boolean>>('settings.starter', () => Object.fromEntries(STARTER.map((s) => [s.id, s.done])));
  const count = STARTER.filter((s) => done[s.id]).length;
  return (
    <Card className="span-5" feature="r.starter" eyebrow={t('pk.instellingen.start.eyebrow')} title={t('pk.instellingen.start.title')} help={t('pk.instellingen.start.help')}>
      <div className="pk-row pk-row--between pk-small">
        <span>{t('pk.instellingen.start.progress', { n: count, total: STARTER.length })}</span>
        <span className="pk-num pk-muted">{Math.round((count / STARTER.length) * 100)}%</span>
      </div>
      <Bar value={count} max={STARTER.length} tone="now" />
      <ul className="pk-list pk-se-starter">
        {STARTER.map((s) => (
          <li key={s.id}>
            <input
              type="checkbox"
              className="pk-tm-box"
              checked={Boolean(done[s.id])}
              aria-label={t(`pk.instellingen.start.${s.id}`)}
              onChange={(e) => setDone((d) => ({ ...d, [s.id]: e.target.checked }))}
            />
            <span className={`pk-se-grow ${done[s.id] ? 'pk-se-done' : ''}`}>{t(`pk.instellingen.start.${s.id}`)}</span>
            <button className="icon-button small" aria-label={t('pk.common.open')} onClick={() => go(s.screen, s.feature ? { feature: s.feature } : undefined)}>
              <PkIcon name="arrow" size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function HelpCentre() {
  const i18n = useI18n();
  const { t, locale } = i18n;
  const { today } = usePraktijk();
  return (
    <Card
      className="span-6"
      feature="y.help"
      eyebrow={t('pk.instellingen.help.eyebrow')}
      title={t('pk.instellingen.help.title')}
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => window.open(`${HELP_URL}?lang=${locale}`, '_blank', 'noopener')}>
          <PkIcon name="help" size={14} />
          {t('pk.instellingen.help.open')}
        </button>
      }
    >
      <ul className="pk-list">
        {NEWS.map((n) => (
          <li key={n.id} className="pk-se-news">
            <span className="pk-se-news-date pk-num">{i18n.dayMonth(addDays(today, -n.daysAgo), today)}</span>
            <span className="pk-stack pk-se-grow">
              <strong>{t(`pk.instellingen.help.news.${n.id}.title`)}</strong>
              <small className="pk-muted">{t(`pk.instellingen.help.news.${n.id}.text`)}</small>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Forum() {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  return (
    <Card
      className="span-6"
      feature="y.forum"
      eyebrow={t('pk.instellingen.forum.eyebrow')}
      title={t('pk.instellingen.forum.title')}
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => setAsking(true)}>
          <PkIcon name="plus" size={14} />
          {t('pk.instellingen.forum.new')}
        </button>
      }
    >
      <ul className="pk-list">
        {mine.map((q, i) => (
          <li key={`mine-${i}`}>
            <PkIcon name="chat" size={16} />
            <span className="pk-stack pk-se-grow">
              <strong>{q}</strong>
              <small className="pk-muted">{t('pk.instellingen.forum.justNow')}</small>
            </span>
            <Chip tone="brand">{t('pk.instellingen.forum.replies', { n: 0 })}</Chip>
          </li>
        ))}
        {FORUM.map((f) => (
          <li key={f.id}>
            <PkIcon name="chat" size={16} />
            <span className="pk-stack pk-se-grow">
              <strong>{t(`pk.instellingen.forum.topic.${f.id}`)}</strong>
              <small className="pk-muted">{i18n.dayMonth(addDays(today, -f.daysAgo), today)}</small>
            </span>
            <Chip tone="outline">{t('pk.instellingen.forum.replies', { n: f.replies })}</Chip>
          </li>
        ))}
      </ul>
      <Modal
        open={asking}
        title={t('pk.instellingen.forum.new')}
        onClose={() => setAsking(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAsking(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={!question.trim()}
              onClick={() => {
                setMine((m) => [question.trim(), ...m]);
                setQuestion('');
                setAsking(false);
                demo(t('pk.instellingen.forum.posted'));
              }}
            >
              {t('pk.instellingen.forum.post')}
            </button>
          </>
        }
      >
        <Field label={t('pk.instellingen.forum.question')} wide>
          <textarea className="pk-input" value={question} onChange={(e) => setQuestion(e.target.value)} />
        </Field>
      </Modal>
    </Card>
  );
}

function Webinars() {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const [joined, setJoined] = useState<string[]>([]);
  return (
    <Card className="span-6" feature="y.webinars" eyebrow={t('pk.instellingen.web.eyebrow')} title={t('pk.instellingen.web.title')} help={t('pk.instellingen.web.help')}>
      <ul className="pk-list">
        {webinars(today).map((w) => {
          const on = joined.includes(w.id);
          return (
            <li key={w.id}>
              <span className="pk-se-date">
                <strong className="pk-num">{w.date.getDate()}</strong>
                <small>{i18n.weekdayShort(w.date)}</small>
              </span>
              <span className="pk-stack pk-se-grow">
                <strong>{t(`pk.instellingen.web.topic.${w.topic}`)}</strong>
                <small className="pk-muted">
                  {i18n.dateShort(w.date)} · {i18n.clock(w.date)} · {t('pk.common.minutes', { n: 45 })}
                </small>
              </span>
              <button
                className={`btn btn-small ${on ? 'btn-done' : 'btn-ghost'}`}
                onClick={() => {
                  if (on) return;
                  setJoined((j) => [...j, w.id]);
                  demo(t('pk.instellingen.web.joined'));
                }}
              >
                {on ? <PkIcon name="check" size={14} /> : null}
                {on ? t('pk.instellingen.web.in') : t('pk.instellingen.web.join')}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Helpdesk() {
  const { t } = useI18n();
  const { demo, now } = usePraktijk();
  const open = now.getDay() >= 1 && now.getDay() <= 5 && now.getHours() >= 9 && now.getHours() < 17;
  return (
    <Card
      className="span-6"
      feature="y.helpdesk"
      eyebrow={t('pk.instellingen.desk.eyebrow')}
      title={t('pk.instellingen.desk.title')}
      actions={<Chip tone={open ? 'good' : 'outline'}>{t(open ? 'pk.instellingen.desk.open' : 'pk.instellingen.desk.closed')}</Chip>}
    >
      <p className="pk-small pk-muted">{t('pk.instellingen.desk.hours')}</p>
      <div className="pk-row pk-se-gap">
        <button className="btn btn-primary btn-small" onClick={() => demo(t('pk.instellingen.desk.chatToast'))}>
          <PkIcon name="chat" size={14} />
          {t('pk.instellingen.desk.chat')}
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.instellingen.desk.callToast'))}>
          <PkIcon name="phone" size={14} />
          {t('pk.instellingen.desk.call')}
        </button>
      </div>
      <p className="pk-small pk-muted pk-se-gap">{t('pk.instellingen.desk.note')}</p>
    </Card>
  );
}
