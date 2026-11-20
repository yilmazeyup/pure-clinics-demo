import { useState } from 'react';

import { useI18n } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, Seg, TableWrap } from '../../praktijk/kit';
import { STATUSES, type Channel, type Status } from '../data';
import { segmentKey, statusKey, useCp } from '../state';
import { attributed, ChannelMark, StatusChip, usePct } from '../ui';

/** Campagnes: every campaign with its channel, status, audience and moment, and for sent ones what they brought in. */
export function CampaignsTab() {
  const { t, num, eur, dateShort, clock } = useI18n();
  const pct = usePct();
  const { campaigns, open, segment, prefs } = useCp();
  const [channel, setChannel] = useState<'all' | Channel>('all');
  const [status, setStatus] = useState<'all' | Status>('all');
  const shown = campaigns
    .filter((c) => (channel === 'all' || c.channel === channel) && (status === 'all' || c.status === status))
    .sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
  const sent = shown.filter((c) => c.results);
  const total = sent.reduce(
    (s, c) => {
      const a = attributed(c.results);
      return { delivered: s.delivered + c.results!.delivered, bookings: s.bookings + a.bookings, orders: s.orders + a.orders, revenue: s.revenue + a.revenue };
    },
    { delivered: 0, bookings: 0, orders: 0, revenue: 0 },
  );
  const dash = <span className="pk-muted">—</span>;

  return (
    <Card
      eyebrow={t('cp.list.eyebrow')}
      title={t('cp.list.title', { n: shown.length })}
      help={t('cp.list.help', { days: prefs.window })}
      actions={
        <div className="pk-row">
          <Seg
            label={t('cp.list.channel')}
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'all', label: t('cp.list.all') },
              { value: 'email', label: t('cp.channel.email'), icon: 'mail' },
              { value: 'sms', label: t('cp.channel.sms'), icon: 'sms' },
            ]}
          />
          <select className="pk-input cp-select" value={status} aria-label={t('cp.list.status')} onChange={(e) => setStatus(e.target.value as 'all' | Status)}>
            <option value="all">{t('cp.list.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(statusKey(s))}
              </option>
            ))}
          </select>
        </div>
      }
    >
      <TableWrap label={t('cp.list.title', { n: shown.length })}>
        <table className="pk-table cp-table">
          <thead>
            <tr>
              <th>{t('cp.list.colName')}</th>
              <th>{t('cp.list.colStatus')}</th>
              <th>{t('cp.list.colSegment')}</th>
              <th>{t('cp.list.colWhen')}</th>
              <th className="end">{t('cp.res.delivered')}</th>
              <th className="end">{t('cp.res.opens')}</th>
              <th className="end">{t('cp.res.clicks')}</th>
              <th className="end">{t('cp.res.unsubscribes')}</th>
              <th className="end">{t('cp.list.colRevenue')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => {
              const r = c.results;
              const a = attributed(r);
              const reach = c.channel === 'sms' ? segment(c.segment).sms : segment(c.segment).email;
              return (
                <tr key={c.id} className="cp-click" onClick={() => open('campagnes', c.id)}>
                  <td className="cp-wrap">
                    <span className="cp-name-cell">
                      <ChannelMark channel={c.channel} size={24} />
                      <span className="pk-stack cp-cell">
                        <span>
                          <button className="cp-link" lang="nl" onClick={(e) => (e.stopPropagation(), open('campagnes', c.id))}>
                            {c.name}
                          </button>
                          {c.comments.some((m) => !m.resolved) ? (
                            <span className="cp-flag" title={t('cp.list.openComments')}>
                              <PkIcon name="flag" size={13} />
                            </span>
                          ) : null}
                        </span>
                        <small className="pk-muted">{t(c.channel === 'email' ? 'cp.channel.email' : 'cp.channel.sms')}</small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <StatusChip status={c.status} />
                  </td>
                  <td className="cp-wrap cp-wrap--seg">
                    <span className="pk-stack cp-cell">
                      <span>{t(segmentKey(c.segment))}</span>
                      <small className="pk-muted pk-num">{t(c.channel === 'sms' ? 'cp.list.reachSms' : 'cp.list.reachEmail', { n: num(r?.recipients ?? reach) })}</small>
                    </span>
                  </td>
                  <td>
                    <span className="pk-stack cp-cell">
                      <span>{dateShort(c.sendAt)}</span>
                      <small className="pk-muted pk-num">{clock(c.sendAt)}</small>
                    </span>
                  </td>
                  <td className="end">{r ? <span className="cp-cell-num">{num(r.delivered)}<small>{pct(r.delivered / r.recipients)}</small></span> : dash}</td>
                  <td className="end">{r && r.opens !== null ? <span className="cp-cell-num">{num(r.opens)}<small>{pct(r.opens / r.delivered)}</small></span> : dash}</td>
                  <td className="end">{r ? <span className="cp-cell-num">{num(r.clicks)}<small>{pct(r.clicks / r.delivered)}</small></span> : dash}</td>
                  <td className="end">{r ? <span className="cp-cell-num">{num(r.unsubscribes)}<small>{pct(r.unsubscribes / r.delivered)}</small></span> : dash}</td>
                  <td className="end cp-wrap-num">
                    {r ? (
                      <span className="cp-cell-num">
                        <strong>{eur(a.revenue)}</strong>
                        <small>{t('cp.list.bookingsOrders', { b: num(a.bookings), o: num(a.orders) })}</small>
                      </span>
                    ) : (
                      dash
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {sent.length ? (
            <tfoot>
              <tr>
                <td colSpan={4}>{t('cp.list.totalSent', { n: sent.length })}</td>
                <td className="end">{num(total.delivered)}</td>
                <td />
                <td />
                <td />
                <td className="end cp-wrap-num">
                  <span className="cp-cell-num">
                    <strong>{eur(total.revenue)}</strong>
                    <small>{t('cp.list.bookingsOrders', { b: num(total.bookings), o: num(total.orders) })}</small>
                  </span>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </TableWrap>
    </Card>
  );
}
