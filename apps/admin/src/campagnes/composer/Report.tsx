import { useI18n } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Card, TableWrap } from '../../praktijk/kit';
import type { Campaign } from '../data';
import { segmentKey, useCp } from '../state';
import { attributed, Figure, Funnel, usePct, useSince, useWhen } from '../ui';

/** The report of a sent campaign: what Mailchimp measured and what the panel tied to it through the UTM tags. */
export function Report({ campaign: c }: { campaign: Campaign }) {
  const { t, num, eur } = useI18n();
  const pct = usePct();
  const { now, prefs, update, demo } = useCp();
  const when = useWhen();
  const since = useSince();
  const r = c.results!;
  const money = attributed(r);

  return (
    <Card
      className="cp-report"
      eyebrow={t('cp.rep.eyebrow')}
      title={t('cp.rep.title')}
      help={t('cp.rep.help', { when: when(c.sendAt), segment: t(segmentKey(c.segment)) })}
      actions={
        <button
          className="btn btn-ghost btn-small"
          onClick={() => {
            update(c.id, { results: { ...r, fetched: new Date(Date.now() + (now.getTime() - Date.now())) } });
            demo(t('cp.rep.refreshed'));
          }}
        >
          <PkIcon name="refresh" size={14} />
          {t(c.channel === 'email' ? 'cp.rep.refresh' : 'cp.rep.reimport')}
        </button>
      }
    >
      <div className="cp-figures">
        <Figure label={t('cp.res.recipients')} value={num(r.recipients)} sub={t('cp.rep.bounces', { n: num(r.bounces) })} />
        <Figure label={t('cp.res.delivered')} value={num(r.delivered)} sub={pct(r.delivered / r.recipients)} />
        {r.opens !== null ? <Figure label={t('cp.res.opens')} value={num(r.opens)} sub={pct(r.opens / r.delivered)} /> : null}
        <Figure label={t('cp.res.clicks')} value={num(r.clicks)} sub={pct(r.clicks / r.delivered)} />
        <Figure label={t('cp.res.unsubscribes')} value={num(r.unsubscribes)} sub={t('cp.rep.complaints', { n: num(r.complaints) })} />
      </div>
      <Funnel campaign={c} />

      <div className="cp-attrib">
        <div className="cp-attrib-head">
          <span className="pk-stack">
            <span className="eyebrow">{t('cp.rep.attribEyebrow')}</span>
            <strong className="cp-attrib-total pk-num">{eur(money.revenue)}</strong>
          </span>
          <small className="pk-muted">{t('cp.rep.attribHelp', { utm: c.utm, days: prefs.window })}</small>
        </div>
        <TableWrap label={t('cp.rep.attribEyebrow')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('cp.rep.colWhat')}</th>
                <th>{t('cp.rep.colKind')}</th>
                <th className="end">{t('cp.rep.colCount')}</th>
                <th className="end">{t('cp.res.revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.label}>
                  <td lang="nl">{l.label}</td>
                  <td>{t(l.kind === 'booking' ? 'cp.rep.booking' : 'cp.rep.order')}</td>
                  <td className="end">{num(l.count)}</td>
                  <td className="end">{eur(l.revenue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t('cp.list.bookingsOrders', { b: num(money.bookings), o: num(money.orders) })}</td>
                <td className="end">{num(money.bookings + money.orders)}</td>
                <td className="end">{eur(money.revenue)}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </div>
      <ul className="cp-checks">
        {r.opens !== null ? (
          <li className="is-warn">
            <PkIcon name="info" size={14} />
            {t('cp.rep.mpp')}
          </li>
        ) : (
          <li className="is-warn">
            <PkIcon name="info" size={14} />
            {t('cp.rep.smsClicks')}
          </li>
        )}
        <li className="is-ok">
          <PkIcon name="check" size={14} />
          {t(c.channel === 'email' ? 'cp.rep.fetched' : 'cp.rep.imported', { ago: since(r.fetched, now) })}
        </li>
      </ul>
    </Card>
  );
}
