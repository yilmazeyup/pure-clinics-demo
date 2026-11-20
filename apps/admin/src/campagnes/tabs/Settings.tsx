import { useState } from 'react';

import { useI18n } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Chip, Field, Kv, Toggle, copyText } from '../../praktijk/kit';
import { SENDER_MAX, senderOk, SETTINGS, utmQuery } from '../data';
import { useCp } from '../state';
import { Tag } from '../ui';

const WEBHOOKS = ['unsubscribe', 'cleaned', 'profile', 'upemail', 'subscribe', 'campaign'] as const;
const HONEST = ['cp.set.real1', 'cp.set.real2', 'cp.set.real3', 'cp.set.real4', 'cp.set.real5', 'cp.set.real6'] as const;

/** Instellingen: the connection, sender, SMS, UTM tags, quiet hours, webhooks, and what a real link needs. */
export function SettingsTab() {
  const { t, num, pct } = useI18n();
  const { prefs, setPrefs, demo } = useCp();
  const [shown, setShown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hooks, setHooks] = useState<Record<(typeof WEBHOOKS)[number], boolean>>({ unsubscribe: true, cleaned: true, profile: true, upemail: true, subscribe: true, campaign: false });
  const [counts, setCounts] = useState({ bookings: true, orders: true });
  const key = SETTINGS.apiKey;
  const masked = `${key.slice(0, 4)}${'•'.repeat(24)}${key.slice(-5)}`;
  const senderValid = senderOk(prefs.senderId);
  const used = SETTINGS.smsCreditsMonth - SETTINGS.smsCreditsLeft;

  return (
    <div className="pk-grid">
      <Card className="span-6" eyebrow={t('cp.set.connEyebrow')} title={t('cp.set.connTitle')}>
        <Field label={t('cp.set.apiKey')} hint={t('cp.set.apiKeyHint')}>
          <span className="cp-key">
            <span className="pk-mono">{shown ? key : masked}</span>
            <button className="icon-button small" aria-label={t(shown ? 'cp.set.hide' : 'cp.set.show')} onClick={() => setShown((s) => !s)}>
              <PkIcon name={shown ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </span>
        </Field>
        <div className="pk-form cp-form">
          <Field label={t('cp.set.account')}>
            <input className="pk-input" value={SETTINGS.account} readOnly />
          </Field>
          <Field label={t('cp.set.audience')} hint={t('cp.set.audienceHint', { id: SETTINGS.audienceId })}>
            <select className="pk-input" defaultValue="main">
              <option value="main">{SETTINGS.audience}</option>
            </select>
          </Field>
        </div>
        <div className="pk-row cp-actions">
          <button
            className="btn btn-ghost btn-small"
            disabled={testing}
            onClick={() => {
              setTesting(true);
              window.setTimeout(() => {
                setTesting(false);
                demo(t('cp.set.testOk'));
              }, 900);
            }}
          >
            <PkIcon name="plug" size={14} />
            {t(testing ? 'cp.set.testing' : 'cp.set.test')}
          </button>
          <button className="btn btn-ghost btn-small" onClick={() => demo(t('cp.set.replaceToast'))}>
            <PkIcon name="key" size={14} />
            {t('cp.set.replace')}
          </button>
        </div>
      </Card>

      <Card className="span-6" eyebrow={t('cp.set.senderEyebrow')} title={t('cp.set.senderTitle')}>
        <div className="pk-form cp-form">
          <Field label={t('cp.set.fromName')}>
            <input className="pk-input" value={prefs.fromName} onChange={(e) => setPrefs({ fromName: e.target.value })} />
          </Field>
          <Field label={t('cp.set.replyTo')} hint={t('cp.set.replyToHint')}>
            <input className="pk-input" type="email" dir="ltr" value={prefs.replyTo} onChange={(e) => setPrefs({ replyTo: e.target.value })} />
          </Field>
        </div>
        <div className="pk-row cp-actions">
          <Chip tone="good" icon="shieldCheck">
            {t('cp.set.domain')}
          </Chip>
          <small className="pk-muted">{t('cp.set.domainHint')}</small>
        </div>
      </Card>

      <Card className="span-6" eyebrow={t('cp.set.smsEyebrow')} title={t('cp.set.smsTitle')} help={t('cp.set.smsHelp')}>
        <Field
          label={t('cp.set.senderId')}
          hint={senderValid ? t('cp.set.senderIdHint', { n: prefs.senderId.length, max: SENDER_MAX }) : t('cp.set.senderIdBad', { max: SENDER_MAX })}
        >
          <input
            className="pk-input pk-mono cp-sender"
            value={prefs.senderId}
            maxLength={SENDER_MAX}
            dir="ltr"
            aria-invalid={!senderValid}
            onChange={(e) => setPrefs({ senderId: e.target.value })}
          />
        </Field>
        <Kv
          rows={[
            [
              t('cp.set.addon'),
              <Chip tone="good" icon="check">
                {t('cp.set.addonOn')}
              </Chip>,
            ],
            [t('cp.set.country'), t('cp.set.countryValue')],
            [
              t('cp.set.credits'),
              <span className="pk-stack cp-credits">
                <span className="pk-num">{t('cp.set.creditsValue', { left: num(SETTINGS.smsCreditsLeft), total: num(SETTINGS.smsCreditsMonth) })}</span>
                <span className="cp-progress" aria-hidden="true">
                  <i style={{ width: `${(used / SETTINGS.smsCreditsMonth) * 100}%` }} />
                </span>
                <small className="pk-muted">{t('cp.set.creditsRenew', { pct: pct(used / SETTINGS.smsCreditsMonth) })}</small>
              </span>,
            ],
          ]}
        />
      </Card>

      <Card className="span-6" eyebrow={t('cp.set.utmEyebrow')} title={t('cp.set.utmTitle')} help={t('cp.set.utmHelp')}>
        <Kv
          rows={[
            ['utm_source', <Tag>mailchimp</Tag>],
            ['utm_medium', <span className="cp-tags"><Tag>email</Tag><Tag>sms</Tag></span>],
            ['utm_campaign', <span className="pk-small">{t('cp.set.utmCampaign')}</span>],
            ['utm_content', <span className="pk-small">{t('cp.set.utmContent')}</span>],
          ]}
        />
        <div className="pk-form cp-form">
          <Field label={t('cp.set.window')}>
            <select className="pk-input" value={prefs.window} onChange={(e) => setPrefs({ window: Number(e.target.value) })}>
              {[1, 3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {t('cp.set.days', { n: d })}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toggle checked={counts.bookings} onChange={(bookings) => setCounts({ ...counts, bookings })} label={t('cp.set.countBookings')} />
        <Toggle checked={counts.orders} onChange={(orders) => setCounts({ ...counts, orders })} label={t('cp.set.countOrders')} />
        <p className="cp-example-link pk-mono">https://pureclinics.nl/?{utmQuery('email', 'black-friday-2026', 'button')}</p>
      </Card>

      <Card className="span-6" eyebrow={t('cp.set.quietEyebrow')} title={t('cp.set.quietTitle')} help={t('cp.set.quietHelp')}>
        <div className="pk-form cp-form">
          <Field label={t('cp.set.quietFrom')}>
            <input className="pk-input" type="time" value={prefs.quietFrom} onChange={(e) => setPrefs({ quietFrom: e.target.value })} />
          </Field>
          <Field label={t('cp.set.quietTo')}>
            <input className="pk-input" type="time" value={prefs.quietTo} onChange={(e) => setPrefs({ quietTo: e.target.value })} />
          </Field>
        </div>
        <Toggle checked={prefs.noSunday} onChange={(noSunday) => setPrefs({ noSunday })} label={t('cp.set.noSunday')} />
        <Toggle checked={prefs.emailNight} onChange={(emailNight) => setPrefs({ emailNight })} label={t('cp.set.emailNight')} hint={t('cp.set.emailNightHint')} />
      </Card>

      <Card className="span-6" eyebrow={t('cp.set.hooksEyebrow')} title={t('cp.set.hooksTitle')} help={t('cp.set.hooksHelp')}>
        <span className="cp-key">
          <span className="pk-mono">{SETTINGS.webhook}</span>
          <button className="icon-button small" aria-label={t('cp.set.copy')} onClick={async () => demo((await copyText(SETTINGS.webhook)) ? t('cp.set.copied') : t('cp.set.copy'))}>
            <PkIcon name="copy" size={16} />
          </button>
        </span>
        {WEBHOOKS.map((h) => (
          <Toggle key={h} checked={hooks[h]} onChange={(on) => setHooks({ ...hooks, [h]: on })} label={t(`cp.set.hook.${h}`)} hint={<span className="pk-mono">{h}</span>} />
        ))}
        <small className="pk-muted">{t('cp.set.hookLast', { name: 'Bram T.' })}</small>
      </Card>

      <Card className="cp-honest" eyebrow={t('cp.set.realEyebrow')} title={t('cp.set.realTitle')}>
        <ol className="cp-honest-list">
          {HONEST.map((k, i) => (
            <li key={k}>
              <i aria-hidden="true">{i + 1}</i>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
        <p className="pk-small pk-muted cp-note">
          <PkIcon name="info" size={14} />
          {t('cp.set.realDemo')}
        </p>
      </Card>
    </div>
  );
}
