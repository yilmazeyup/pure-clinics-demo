import { useI18n } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Chip, Kv } from '../../praktijk/kit';
import { SETTINGS } from '../data';
import { segmentKey, SYNC_STEPS, useCp } from '../state';
import { attributed, ChannelMark, Figure, Forward, Funnel, StatusChip, useArgs, usePct, useSince, useWhen } from '../ui';

/** Overzicht: the link with Mailchimp, the audience in numbers, what is coming and how the sent ones did. */
export function OverviewTab() {
  const i18n = useI18n();
  const { t, num, eur, clock } = i18n;
  const pct = usePct();
  const args = useArgs();
  const since = useSince();
  const { now, campaigns, sync, runSync, open, segment } = useCp();
  const when = useWhen();
  const a = sync.audience;
  const contacts = a.subscribed + a.unsubscribed + a.cleaned + a.pending + a.transactional;
  const upcoming = campaigns
    .filter((c) => c.status !== 'sent' && c.sendAt.getTime() >= now.getTime() - 3600000)
    .sort((x, y) => x.sendAt.getTime() - y.sendAt.getTime())
    .slice(0, 5);
  const sent = campaigns.filter((c) => c.status === 'sent' && c.results).sort((x, y) => y.sendAt.getTime() - x.sendAt.getTime());
  const parts: [string, number, string][] = [
    ['subscribed', a.subscribed, t('cp.aud.subscribed')],
    ['transactional', a.transactional, t('cp.aud.transactional')],
    ['unsubscribed', a.unsubscribed, t('cp.aud.unsubscribed')],
    ['cleaned', a.cleaned, t('cp.aud.cleaned')],
    ['pending', a.pending, t('cp.aud.pending')],
  ];

  return (
    <div className="pk-grid">
      <Card className="span-5 cp-connect" eyebrow={t('cp.ov.connEyebrow')} title="Mailchimp" help={t('cp.ov.connHelp')}>
        <div className="cp-connect-top">
          <span className="cp-logo" aria-hidden="true">
            <PkIcon name="plug" size={22} />
          </span>
          <Chip tone={sync.running ? 'brand' : 'good'} icon={sync.running ? 'refresh' : 'check'}>
            {t(sync.running ? 'cp.ov.statusSyncing' : 'cp.ov.statusConnected')}
          </Chip>
          <Chip tone="outline">{t('cp.ov.simulated')}</Chip>
        </div>
        <Kv
          rows={[
            [t('cp.ov.account'), SETTINGS.account],
            [t('cp.ov.audience'), SETTINGS.audience],
            [t('cp.ov.lastSync'), t('cp.ov.lastSyncValue', { time: clock(sync.at), ago: since(sync.at, now) })],
            [t('cp.ov.auto'), t('cp.ov.autoValue')],
          ]}
        />
        <div className="cp-sync">
          <button className="btn btn-primary" onClick={runSync} disabled={Boolean(sync.running)}>
            <PkIcon name="refresh" size={15} />
            {t(sync.running ? 'cp.ov.syncing' : 'cp.ov.syncNow')}
          </button>
          {sync.running ? (
            <div className="cp-sync-run" role="status" aria-live="polite">
              <span className="cp-progress" aria-hidden="true">
                <i style={{ width: `${sync.running.progress * 100}%` }} />
              </span>
              <ol className="cp-sync-steps">
                {SYNC_STEPS.map((step, i) => (
                  <li key={step} className={i < sync.running!.step ? 'done' : i === sync.running!.step ? 'now' : ''}>
                    <i aria-hidden="true">{i < sync.running!.step ? <PkIcon name="check" size={11} stroke={2.4} /> : null}</i>
                    {t(`cp.sync.step.${step}`, { n: sync.segments.length })}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <ul className="cp-log">
              {sync.log.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <span className="pk-num">{clock(l.at)}</span>
                  {t(l.key, args(l.args))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="span-7" eyebrow={t('cp.ov.numbersEyebrow')} title={t('cp.ov.numbersTitle')}>
        <div className="cp-figures cp-figures--two">
          <Figure label={t('cp.ov.contacts')} value={num(contacts)} sub={t('cp.ov.contactsSub')} />
          <Figure label={t('cp.ov.subscribers')} value={num(a.subscribed)} sub={t('cp.ov.ofContacts', { pct: pct(a.subscribed / contacts) })} />
          <Figure label={t('cp.ov.smsConsent')} value={num(a.sms)} sub={t('cp.ov.smsConsentSub')} />
          <Figure label={t('cp.ov.unsubscribed')} value={num(a.unsubscribed)} sub={t('cp.ov.unsubscribedSub', { n: num(a.cleaned) })} />
        </div>
        <div className="cp-stack" role="img" aria-label={parts.map(([, n, label]) => `${label}: ${num(n)}`).join(', ')}>
          {parts.map(([id, n]) => (
            <i key={id} className={`cp-stack-${id}`} style={{ flexGrow: n }} />
          ))}
        </div>
        <ul className="cp-legend">
          {parts.map(([id, n, label]) => (
            <li key={id}>
              <i className={`cp-stack-${id}`} aria-hidden="true" />
              {label}
              <b className="pk-num">{num(n)}</b>
            </li>
          ))}
        </ul>
        <p className="pk-small pk-muted cp-note">
          <PkIcon name="info" size={14} />
          {t('cp.ov.consentNote')}
        </p>
      </Card>

      <Card
        className="span-6"
        eyebrow={t('cp.ov.nextEyebrow')}
        title={t('cp.ov.nextTitle')}
        actions={
          <button className="btn btn-ghost btn-small" onClick={() => open('kalender')}>
            <PkIcon name="calendar" size={14} />
            {t('cp.ov.toCalendar')}
          </button>
        }
      >
        <ul className="pk-list cp-rows">
          {upcoming.map((c) => (
            <li key={c.id}>
              <button className="cp-row-button" onClick={() => open('overzicht', c.id)}>
                <ChannelMark channel={c.channel} />
                <span className="pk-stack cp-grow">
                  <strong className="cp-name">{c.name}</strong>
                  <small className="pk-muted">
                    {when(c.sendAt)} · {t(segmentKey(c.segment))} · {num(c.channel === 'sms' ? segment(c.segment).sms : segment(c.segment).email)}
                  </small>
                </span>
                <StatusChip status={c.status} />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="span-6" eyebrow={t('cp.ov.resultsEyebrow')} title={t('cp.ov.resultsTitle')} help={t('cp.ov.resultsHelp')}>
        {sent.map((c) => {
          const r = c.results!;
          const money = attributed(r);
          return (
            <div key={c.id} className="cp-result">
              <div className="cp-result-head">
                <ChannelMark channel={c.channel} />
                <span className="pk-stack cp-grow">
                  <strong className="cp-name">{c.name}</strong>
                  <small className="pk-muted">
                    {t('cp.ov.sentTo', { when: when(c.sendAt), n: num(r.recipients), segment: t(segmentKey(c.segment)) })}
                  </small>
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => open('overzicht', c.id)}>
                  {t('cp.ov.report')}
                  <Forward />
                </button>
              </div>
              <Funnel campaign={c} />
              <div className="cp-figures cp-figures--small">
                <Figure label={t('cp.res.bookings')} value={num(money.bookings)} />
                <Figure label={t('cp.res.orders')} value={num(money.orders)} />
                <Figure label={t('cp.res.revenue')} value={eur(money.revenue)} sub={t('cp.res.viaUtm')} />
                <Figure label={t('cp.res.unsubscribes')} value={num(r.unsubscribes)} sub={pct(r.unsubscribes / r.delivered)} />
              </div>
              <small className="pk-muted">{t('cp.ov.fetched', { ago: since(r.fetched, now) })}</small>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
