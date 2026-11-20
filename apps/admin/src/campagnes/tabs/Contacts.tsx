import { addDays, locationById } from '@pure-clinics/shared';

import { useI18n, type MessageKey } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Chip, TableWrap, type Tone } from '../../praktijk/kit';
import { BACKFLOW, CONTACTS, EXTRA_CONTACTS, type EmailStatus, type SmsStatus } from '../data';
import { useCp } from '../state';
import { Tag, useSince } from '../ui';

/** How the panel's fields land in Mailchimp: [panel field, Mailchimp field, example, note]. */
const FIELDS: [MessageKey, string, string, MessageKey | null][] = [
  ['cp.ct.f.first', 'FNAME', 'Anna', 'cp.ct.n.merge'],
  ['cp.ct.f.last', 'LNAME', 'Voorbeeld', null],
  ['cp.ct.f.email', 'EMAIL', 'anna.voorbeeld@example.com', 'cp.ct.n.key'],
  ['cp.ct.f.phone', 'SMS phone', '+31600000101', 'cp.ct.n.phone'],
  ['cp.ct.f.birthday', 'BIRTHDAY', '03/14', 'cp.ct.n.birthday'],
  ['cp.ct.f.location', 'LOCATION', 'Nijmegen', null],
  ['cp.ct.f.segments', 'Tags', 'app-laatste-2000, members, sms-toestemming', 'cp.ct.n.tags'],
  ['cp.ct.f.emailConsent', 'status', 'subscribed', 'cp.ct.n.emailConsent'],
  ['cp.ct.f.smsConsent', 'SMS status', 'subscribed', 'cp.ct.n.smsConsent'],
];

const EMAIL_TONE: Record<EmailStatus, Tone> = { subscribed: 'good', unsubscribed: 'bad', cleaned: 'bad', pending: 'warn', transactional: 'outline' };
const SMS_TONE: Record<SmsStatus, Tone> = { subscribed: 'good', unsubscribed: 'bad', none: 'outline' };
const FLOW_ICON = { unsubscribe: 'mail', smsUnsubscribe: 'sms', bounce: 'warning', complaint: 'flag' } as const;

/** "+31 6 00000101", the E.164 form Mailchimp keeps, spaced for reading. */
const e164 = (phone: string) => `+31 ${phone.replace(/\D/g, '').slice(1, 2)} ${phone.replace(/\D/g, '').slice(2)}`;

/** Contacten & toestemming: the field mapping, e-mail and SMS consent apart, double opt-in and what flows back. */
export function ContactsTab() {
  const i18n = useI18n();
  const { t, num, dayMonth } = i18n;
  const { now, sync, segment, campaigns } = useCp();
  const since = useSince();
  const a = sync.audience;
  const tagOf = (id: Parameters<typeof segment>[0]) => segment(id).tag;
  const birthday = (mmdd: string) => dayMonth(new Date(2000, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(3, 5))), new Date(2000, 0, 1));

  return (
    <div className="pk-grid">
      <Card className="span-7" eyebrow={t('cp.ct.mapEyebrow')} title={t('cp.ct.mapTitle')} help={t('cp.ct.mapHelp')}>
        <TableWrap label={t('cp.ct.mapTitle')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('cp.ct.colPanel')}</th>
                <th>{t('cp.ct.colMailchimp')}</th>
                <th>{t('cp.ct.colExample')}</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(([panel, field, example, note]) => (
                <tr key={field}>
                  <td>
                    <span className="pk-stack cp-cell">
                      <span>{t(panel)}</span>
                      {note ? <small className="pk-muted">{t(note)}</small> : null}
                    </span>
                  </td>
                  <td>
                    <Tag>{field}</Tag>
                  </td>
                  <td className="pk-mono cp-example">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <div className="span-5 pk-stack cp-col">
      <Card eyebrow={t('cp.ct.consentEyebrow')} title={t('cp.ct.consentTitle')} help={t('cp.ct.consentHelp')}>
        <div className="cp-consent">
          <div className="cp-consent-col">
            <span className="cp-consent-head">
              <PkIcon name="mail" size={16} />
              {t('cp.ct.emailConsent')}
            </span>
            <ul className="cp-kv-list">
              <li>
                <span>{t('cp.aud.subscribed')}</span>
                <b className="pk-num">{num(a.subscribed)}</b>
              </li>
              <li>
                <span>{t('cp.aud.pending')}</span>
                <b className="pk-num">{num(a.pending)}</b>
              </li>
              <li>
                <span>{t('cp.aud.unsubscribed')}</span>
                <b className="pk-num">{num(a.unsubscribed)}</b>
              </li>
              <li>
                <span>{t('cp.aud.cleaned')}</span>
                <b className="pk-num">{num(a.cleaned)}</b>
              </li>
            </ul>
          </div>
          <div className="cp-consent-col">
            <span className="cp-consent-head">
              <PkIcon name="sms" size={16} />
              {t('cp.ct.smsConsent')}
            </span>
            <ul className="cp-kv-list">
              <li>
                <span>{t('cp.aud.smsSubscribed')}</span>
                <b className="pk-num">{num(a.sms)}</b>
              </li>
              <li>
                <span>{t('cp.aud.smsUnsubscribed')}</span>
                <b className="pk-num">{num(a.smsUnsubscribed)}</b>
              </li>
              <li>
                <span>{t('cp.aud.smsNone')}</span>
                <b className="pk-num">{num(a.subscribed + a.unsubscribed + a.cleaned + a.pending + a.transactional - a.sms - a.smsUnsubscribed)}</b>
              </li>
            </ul>
          </div>
        </div>
        <p className="pk-small cp-callout">
          <PkIcon name="shieldCheck" size={16} />
          {t('cp.ct.smsSeparate')}
        </p>
        <div className="cp-optin">
          <span className="pk-row">
            <strong>{t('cp.ct.doubleOptin')}</strong>
            <Chip tone="good" icon="check">
              {t('cp.ct.on')}
            </Chip>
          </span>
          <ol className="cp-flow">
            {(['cp.ct.optin1', 'cp.ct.optin2', 'cp.ct.optin3', 'cp.ct.optin4'] as const).map((key, i) => (
              <li key={key}>
                <i aria-hidden="true">{i + 1}</i>
                {t(key)}
              </li>
            ))}
          </ol>
          <small className="pk-muted">{t('cp.ct.pending', { n: num(a.pending) })}</small>
        </div>
      </Card>

      <Card eyebrow={t('cp.ct.backEyebrow')} title={t('cp.ct.backTitle')} help={t('cp.ct.backHelp')}>
        <ul className="pk-list cp-rows">
          {BACKFLOW.map((f) => {
            const c = CONTACTS.find((x) => x.id === f.contact) ?? { ...EXTRA_CONTACTS[f.contact] };
            const at = new Date(now.getTime() - f.minutesAgo * 60000);
            return (
              <li key={f.id}>
                <span className={`cp-mark cp-mark--flow cp-mark--${f.kind}`}>
                  <PkIcon name={FLOW_ICON[f.kind]} size={15} />
                </span>
                <span className="pk-stack cp-grow">
                  <strong>
                    {c.first} {c.last}
                  </strong>
                  <small className="pk-muted">
                    {t(`cp.ct.flow.${f.kind}`, { campaign: (f.campaign && campaigns.find((x) => x.id === f.campaign)?.name) || t('cp.ct.flow.noCampaign') })}
                  </small>
                  <small className="cp-effect">
                    <PkIcon name="arrow" size={12} />
                    {t(`cp.ct.effect.${f.kind}`)}
                  </small>
                </span>
                <span className="pk-muted pk-small nowrap">{since(at, now)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      </div>

      <Card eyebrow={t('cp.ct.sampleEyebrow')} title={t('cp.ct.sampleTitle')} help={t('cp.ct.sampleHelp')}>
        <TableWrap label={t('cp.ct.sampleTitle')}>
          <table className="pk-table cp-table">
            <thead>
              <tr>
                <th>{t('cp.ct.colName')} · EMAIL</th>
                <th>SMS phone</th>
                <th>BIRTHDAY</th>
                <th>LOCATION</th>
                <th>Tags</th>
                <th>{t('cp.ct.colStatus')}</th>
                <th>{t('cp.ct.colOptin')}</th>
              </tr>
            </thead>
            <tbody>
              {CONTACTS.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">
                    <span className="cp-person">
                      <span className="cp-initial" aria-hidden="true">
                        {c.first[0]}
                        {c.last[0]}
                      </span>
                      <span className="pk-stack cp-cell">
                        <span>
                          {c.first} {c.last}
                        </span>
                        <small className="pk-mono pk-muted">{c.email}</small>
                      </span>
                    </span>
                  </td>
                  <td className="pk-mono nowrap">{c.smsStatus === 'subscribed' ? e164(c.phone) : <span className="pk-muted">—</span>}</td>
                  <td className="nowrap">{birthday(c.birthday)}</td>
                  <td>{locationById(c.location).city}</td>
                  <td className="cp-tags-cell">
                    <span className="cp-tags">
                      {c.tags.map((id) => (
                        <Tag key={id}>{tagOf(id)}</Tag>
                      ))}
                    </span>
                  </td>
                  <td>
                    <span className="cp-status-pair">
                      <Chip tone={EMAIL_TONE[c.emailStatus]} icon="mail">
                        {t(`cp.aud.${c.emailStatus}`)}
                      </Chip>
                      <Chip tone={SMS_TONE[c.smsStatus]} icon="sms">
                        {t(c.smsStatus === 'subscribed' ? 'cp.aud.smsSubscribed' : c.smsStatus === 'unsubscribed' ? 'cp.aud.smsUnsubscribed' : 'cp.aud.smsNone')}
                      </Chip>
                    </span>
                  </td>
                  <td className="nowrap pk-small">
                    {c.confirmedDaysAgo !== null
                      ? t('cp.ct.confirmed', { date: dayMonth(addDays(now, -c.confirmedDaysAgo), now) })
                      : c.emailStatus === 'pending'
                        ? t('cp.ct.waiting')
                        : t('cp.ct.notNeeded')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
