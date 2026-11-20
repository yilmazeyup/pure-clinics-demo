import { useI18n, type MessageKey } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Chip, Field, copyText } from '../../praktijk/kit';
import { SENDER_MAX, senderOk, SETTINGS, smsResults, utmQuery, type Campaign } from '../data';
import { countSms, toGsm, UNSUBSCRIBE_RESERVE } from '../sms';
import { segmentKey, useCp } from '../state';
import { Forward, useSince, useWhen } from '../ui';
import { Comments, inQuiet, JobSteps, SegmentSelect, useJob, When } from './Composer';

const IMPORT_STEPS = ['cp.sms.import1', 'cp.sms.import2', 'cp.sms.import3'] as const;
const EMOJI = /\p{Extended_Pictographic}️?/gu;

/**
 * The SMS composer. Mailchimp has no API for SMS marketing campaigns, so the panel prepares the segment (synced as a
 * tag) and the text, hands off to Mailchimp, and imports the result afterwards; all of it simulated here.
 */
export function SmsEditor({ campaign: c }: { campaign: Campaign }) {
  const i18n = useI18n();
  const { t, num, clock } = i18n;
  const { now, update, segment, prefs, demo, sync, runSync } = useCp();
  const when = useWhen();
  const since = useSince();
  const [job, run] = useJob();
  const locked = c.status === 'sent' || c.status === 'scheduled' || Boolean(job);
  const count = countSms(c.text);
  const seg = segment(c.segment);
  const recipients = seg.sms;
  const credits = count.parts * recipients;
  const fixed = toGsm(c.text);
  const senderValid = senderOk(c.senderId);
  const link = `https://pureclinics.nl/?${utmQuery('sms', c.utm)}`;
  const quiet = inQuiet(c.sendAt, prefs.quietFrom, prefs.quietTo);
  const sunday = prefs.noSunday && c.sendAt.getDay() === 0;

  const problems: MessageKey[] = [];
  if (!c.text.trim()) problems.push('cp.check.smsEmpty');
  if (!senderValid) problems.push('cp.check.sender');
  if (c.sendAt.getTime() <= now.getTime()) problems.push('cp.check.past');
  if (quiet) problems.push('cp.check.quiet');
  if (sunday) problems.push('cp.check.sunday');
  const warnings: MessageKey[] = [];
  if (count.emoji) warnings.push('cp.sms.emojiWarn');
  if (count.parts > 1) warnings.push('cp.sms.partsWarn');
  if (credits > SETTINGS.smsCreditsLeft) warnings.push('cp.sms.creditsWarn');
  if (c.comments.some((m) => !m.resolved)) warnings.push('cp.check.comments');

  const importResult = () =>
    run(IMPORT_STEPS.length, () => {
      update(c.id, { status: 'sent', results: smsResults(recipients, new Date(Date.now() + (now.getTime() - Date.now()))) });
      demo(t('cp.sms.importedToast'));
    });

  return (
    <div className="cp-comp-grid">
      <div className="cp-comp-main">
        <p className="cp-callout cp-callout--strong">
          <PkIcon name="info" size={17} />
          <span>
            <b>{t('cp.sms.noApiTitle')}</b> {t('cp.sms.noApi')}
          </span>
        </p>

        <Card eyebrow={t('cp.comp.envelopeEyebrow')} title={t('cp.sms.envelopeTitle')}>
          <fieldset className="cp-fieldset" disabled={locked}>
            <div className="pk-form">
              <Field
                label={t('cp.sms.sender')}
                hint={senderValid ? t('cp.set.senderIdHint', { n: c.senderId.length, max: SENDER_MAX }) : t('cp.set.senderIdBad', { max: SENDER_MAX })}
              >
                <input className="pk-input pk-mono" dir="ltr" maxLength={SENDER_MAX} value={c.senderId} aria-invalid={!senderValid} onChange={(e) => update(c.id, { senderId: e.target.value })} />
              </Field>
              <Field label={t('cp.comp.segment')} hint={t('cp.sms.segmentHint')}>
                <SegmentSelect campaign={c} disabled={locked} />
              </Field>
              <When campaign={c} disabled={locked} />
            </div>
            <p className="pk-small pk-muted cp-quiet">
              <PkIcon name="clock" size={14} />
              {t('cp.sms.quietRule', { from: prefs.quietFrom, to: prefs.quietTo })}
              {prefs.noSunday ? ` ${t('cp.sms.quietSunday')}` : ''}
            </p>
          </fieldset>
        </Card>

        <Card eyebrow={t('cp.sms.textEyebrow')} title={t('cp.sms.textTitle')} help={t('cp.sms.textHelp', { n: UNSUBSCRIBE_RESERVE })}>
          <fieldset className="cp-fieldset" disabled={locked}>
            <textarea className="pk-input cp-sms-text" lang="nl" dir="ltr" rows={4} value={c.text} aria-label={t('cp.sms.textTitle')} onChange={(e) => update(c.id, { text: e.target.value })} />
          </fieldset>

          <div className="cp-counter" aria-live="polite">
            <div className="cp-counter-top">
              <Chip tone={count.encoding === 'gsm7' ? 'good' : 'warn'}>{count.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}</Chip>
              <span className="pk-num cp-counter-sum">
                {t('cp.sms.sum', { used: count.used, reserve: count.reserve, total: count.total })}
              </span>
              <strong className="pk-num cp-counter-parts">
                {count.parts <= 1 ? t('cp.sms.onePart', { left: count.left, max: count.single }) : t('cp.sms.manyParts', { n: count.parts, per: count.perPart, left: count.left })}
              </strong>
            </div>
            <span className="cp-meter" aria-hidden="true">
              {Array.from({ length: Math.max(1, count.parts) }, (_, i) => {
                const start = i * (count.parts <= 1 ? count.single : count.perPart);
                const size = count.parts <= 1 ? count.single : count.perPart;
                const filled = Math.max(0, Math.min(1, (count.total - start) / size));
                const reserveFrom = Math.max(0, Math.min(1, (count.used - start) / size));
                return (
                  <span key={i} className="cp-meter-part">
                    <i style={{ width: `${reserveFrom * 100}%` }} />
                    <i className="cp-meter-reserve" style={{ width: `${Math.max(0, filled - reserveFrom) * 100}%` }} />
                  </span>
                );
              })}
            </span>
            <ul className="cp-counter-legend">
              <li>
                <i className="cp-meter-text" aria-hidden="true" />
                {t('cp.sms.legendText')}
              </li>
              <li>
                <i className="cp-meter-reserve" aria-hidden="true" />
                {t('cp.sms.legendReserve', { n: UNSUBSCRIBE_RESERVE })}
              </li>
            </ul>
            <p className="pk-small pk-muted">{t(count.encoding === 'gsm7' ? 'cp.sms.ruleGsm' : 'cp.sms.ruleUnicode')}</p>
            {count.doubles.length ? (
              <p className="pk-small cp-chars">
                {t('cp.sms.doubles')}
                {count.doubles.map((ch) => (
                  <span key={ch} className="cp-char">
                    {ch} <small>×2</small>
                  </span>
                ))}
              </p>
            ) : null}
            {count.outside.length ? (
              <div className="cp-warn">
                <PkIcon name="warning" size={16} />
                <span className="pk-stack">
                  <strong>{t(count.emoji ? 'cp.sms.emojiTitle' : 'cp.sms.unicodeTitle')}</strong>
                  <span className="pk-small cp-chars">
                    {t('cp.sms.outside')}
                    {count.outside.map((ch) => (
                      <span key={ch} className="cp-char" lang="nl">
                        {ch}
                      </span>
                    ))}
                  </span>
                  {locked ? null : (
                    <span className="pk-row">
                      {fixed !== c.text ? (
                        <button className="btn btn-ghost btn-small" onClick={() => update(c.id, { text: fixed })}>
                          <PkIcon name="wand" size={14} />
                          {t('cp.sms.fixQuotes')}
                        </button>
                      ) : null}
                      {count.emoji ? (
                        <button className="btn btn-ghost btn-small" onClick={() => update(c.id, { text: c.text.replace(EMOJI, '').replace(/ {2,}/g, ' ').trim() })}>
                          <PkIcon name="trash" size={14} />
                          {t('cp.sms.removeEmoji')}
                        </button>
                      ) : null}
                    </span>
                  )}
                </span>
              </div>
            ) : null}
            <div className="cp-credits-line">
              <span className="pk-stack">
                <span className="eyebrow">{t('cp.sms.credits')}</span>
                <strong className="pk-num">{t('cp.sms.creditsCalc', { parts: count.parts, n: num(recipients), credits: num(credits) })}</strong>
              </span>
              <small className={credits > SETTINGS.smsCreditsLeft ? 'cp-bad' : 'pk-muted'}>
                {t('cp.sms.creditsLeft', { n: num(SETTINGS.smsCreditsLeft) })}
                <br />
                {t('cp.sms.creditsNote')}
              </small>
            </div>
          </div>
        </Card>

        <Comments campaign={c} />

        {c.status !== 'sent' ? (
          <Card className="cp-late" eyebrow={t('cp.sms.handEyebrow')} title={t('cp.sms.handTitle')} help={t('cp.sms.handHelp')}>
            <ol className="cp-hand">
              <li className="done">
                <i aria-hidden="true">1</i>
                <span className="pk-stack cp-grow">
                  <strong>{t('cp.sms.hand1')}</strong>
                  <small className="pk-muted">
                    {t('cp.sms.hand1Detail', { tag: seg.tag, n: num(recipients), segment: t(segmentKey(c.segment)), ago: since(sync.at, now) })}
                  </small>
                </span>
                <button className="btn btn-ghost btn-small" disabled={Boolean(sync.running)} onClick={runSync}>
                  <PkIcon name="refresh" size={14} />
                  {t(sync.running ? 'cp.ov.syncing' : 'cp.sms.resync')}
                </button>
              </li>
              <li>
                <i aria-hidden="true">2</i>
                <span className="pk-stack cp-grow">
                  <strong>{t('cp.sms.hand2')}</strong>
                  <small className="pk-muted pk-mono cp-utm">{link}</small>
                </span>
                <span className="pk-row">
                  <button className="btn btn-ghost btn-small" disabled={!c.text} onClick={async () => demo((await copyText(c.text)) ? t('cp.sms.copiedText') : t('cp.sms.copyText'))}>
                    <PkIcon name="copy" size={14} />
                    {t('cp.sms.copyText')}
                  </button>
                  <button className="btn btn-ghost btn-small" onClick={async () => demo((await copyText(link)) ? t('cp.sms.copiedLink') : t('cp.sms.copyLink'))}>
                    <PkIcon name="link" size={14} />
                    {t('cp.sms.copyLink')}
                  </button>
                </span>
              </li>
              <li>
                <i aria-hidden="true">3</i>
                <span className="pk-stack cp-grow">
                  <strong>{t('cp.sms.hand3')}</strong>
                  <small className="pk-muted">{t('cp.sms.hand3Detail', { tag: seg.tag, when: when(c.sendAt), sender: c.senderId })}</small>
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => demo(t('cp.sms.openToast'))}>
                  <Forward />
                  {t('cp.sms.open')}
                </button>
              </li>
              <li className={c.status === 'scheduled' ? 'done' : ''}>
                <i aria-hidden="true">4</i>
                <span className="pk-stack cp-grow">
                  <strong>{t('cp.sms.hand4')}</strong>
                  <small className="pk-muted">{t('cp.sms.hand4Detail')}</small>
                </span>
              </li>
              <li>
                <i aria-hidden="true">5</i>
                <span className="pk-stack cp-grow">
                  <strong>{t('cp.sms.hand5')}</strong>
                  <small className="pk-muted">{t('cp.sms.hand5Detail')}</small>
                </span>
              </li>
            </ol>

            <ul className="cp-checks">
              {problems.map((k) => (
                <li key={k} className="is-error">
                  <PkIcon name="warning" size={14} />
                  {t(k, { from: prefs.quietFrom, to: prefs.quietTo })}
                </li>
              ))}
              {warnings.map((k) => (
                <li key={k} className="is-warn">
                  <PkIcon name="info" size={14} />
                  {t(k, { n: num(credits), left: num(SETTINGS.smsCreditsLeft), parts: count.parts })}
                </li>
              ))}
            </ul>
            {job ? <JobSteps job={job} labels={IMPORT_STEPS.map((k) => t(k))} /> : null}

            <div className="cp-actions-row">
              {c.status === 'concept' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    update(c.id, { status: 'review' });
                    demo(t('cp.comp.toReviewToast'));
                  }}
                >
                  <PkIcon name="eye" size={15} />
                  {t('cp.comp.toReview')}
                </button>
              ) : null}
              {c.status === 'review' ? (
                <>
                  <button className="btn btn-ghost" onClick={() => update(c.id, { status: 'concept' })}>
                    <PkIcon name="undo" size={15} />
                    {t('cp.comp.toConcept')}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={problems.length > 0}
                    onClick={() => {
                      update(c.id, { status: 'scheduled' });
                      demo(t('cp.sms.markedToast', { when: when(c.sendAt) }));
                    }}
                  >
                    <PkIcon name="check" size={15} />
                    {t('cp.sms.markScheduled')}
                  </button>
                </>
              ) : null}
              {c.status === 'scheduled' ? (
                <>
                  <button className="btn btn-ghost" disabled={Boolean(job)} onClick={() => update(c.id, { status: 'review' })}>
                    <PkIcon name="undo" size={15} />
                    {t('cp.sms.unmark')}
                  </button>
                  <button className="btn btn-primary" disabled={Boolean(job)} onClick={importResult}>
                    <PkIcon name="download" size={15} />
                    {t('cp.sms.import')}
                  </button>
                  <small className="pk-muted">{t('cp.sms.importNote')}</small>
                </>
              ) : null}
              {c.status === 'concept' ? <small className="pk-muted">{t('cp.sms.reviewFirst')}</small> : null}
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="cp-comp-side">
        <div className="cp-preview-sticky">
          <span className="eyebrow">{t('cp.sms.previewEyebrow')}</span>
          <div className="cp-phone" aria-label={t('cp.sms.previewLabel')}>
            <div className="cp-phone-screen" lang="nl" dir="ltr">
              <div className="cp-phone-top">
                <span className="cp-initial" aria-hidden="true">
                  PC
                </span>
                <span className="pk-stack">
                  <b>{c.senderId || '—'}</b>
                  <small>{t('cp.sms.senderType')}</small>
                </span>
              </div>
              <div className="cp-phone-thread">
                <small className="cp-phone-time">
                  {i18n.dateShort(c.sendAt)} {clock(c.sendAt)}
                </small>
                <div className="cp-bubble">
                  {c.text ? <span>{c.text}</span> : <span className="pk-muted">{t('cp.sms.emptyText')}</span>}
                  <span className="cp-bubble-unsub">{t('cp.sms.unsubLink')}</span>
                </div>
              </div>
              <div className="cp-phone-foot">
                <span>{t('cp.sms.noReply')}</span>
              </div>
            </div>
          </div>
          <p className="pk-small pk-muted cp-note">
            <PkIcon name="info" size={14} />
            {count.parts > 1 ? t('cp.sms.previewNote', { parts: count.parts }) : t('cp.sms.previewOne')}
          </p>
        </div>
      </aside>
    </div>
  );
}
