import { addDays } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { staffById } from '../../data/core';
import { AUDIT, STATUS_PARTS } from '../../data/settings';
import { Card, Check, Chip, Kv, Modal, TableWrap, downloadCsv } from '../../kit';
import { PkIcon } from '../../icons';

/** Security and privacy (AVG): certificates, the processor agreement, hosting and backups, the change log, the status page. */
export function AvgTab() {
  return (
    <div className="pk-grid">
      <Certificates />
      <Agreement />
      <Hosting />
      <Status />
      <ChangeLog />
      <Inspection />
    </div>
  );
}

function Certificates() {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const certs = [
    { id: 'NEN 7510', until: addDays(today, 540), scope: t('pk.instellingen.avg.nenScope') },
    { id: 'ISO 27001', until: addDays(today, 610), scope: t('pk.instellingen.avg.isoScope') },
  ];
  return (
    <Card className="span-6" feature="x.cert" eyebrow={t('pk.instellingen.avg.certEyebrow')} title={t('pk.instellingen.avg.certTitle')} help={t('pk.instellingen.avg.certHelp')}>
      <div className="pk-se-certs">
        {certs.map((c) => (
          <div key={c.id} className="pk-se-cert">
            <PkIcon name="shieldCheck" size={26} />
            <strong>{c.id}</strong>
            <small className="pk-muted">{c.scope}</small>
            <Chip tone="good">{t('pk.instellingen.int.validUntil', { date: i18n.dayMonth(c.until, today) })}</Chip>
            <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.instellingen.avg.certOpen', { name: c.id }))}>
              {t('pk.common.view')}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Agreement() {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const [open, setOpen] = useState(false);
  const signed = addDays(today, -118);
  const points = ['purpose', 'location', 'access', 'breach', 'end'] as const;
  return (
    <Card className="span-6" feature="x.dpa" eyebrow={t('pk.instellingen.avg.dpaEyebrow')} title={t('pk.instellingen.avg.dpaTitle')} help={t('pk.instellingen.avg.dpaHelp')}>
      <Kv
        rows={[
          [t('pk.common.status'), <Chip tone="good" icon="check">{t('pk.instellingen.avg.dpaSigned')}</Chip>],
          [t('pk.common.date'), i18n.dayMonth(signed, today)],
          [t('pk.instellingen.avg.dpaBy'), 'Margot · Pure Clinics'],
          [t('pk.instellingen.avg.dpaVersion'), '2026.2'],
        ]}
      />
      <div className="pk-row pk-se-gap">
        <button className="btn btn-ghost btn-small" onClick={() => setOpen(true)}>
          <PkIcon name="file" size={14} />
          {t('pk.common.view')}
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.instellingen.avg.dpaDownload'))}>
          <PkIcon name="download" size={14} />
          {t('pk.common.download')}
        </button>
      </div>
      <Modal open={open} title={t('pk.instellingen.avg.dpaTitle')} onClose={() => setOpen(false)}>
        <ol className="pk-se-points">
          {points.map((p) => (
            <li key={p}>
              <strong>{t(`pk.instellingen.avg.dpa.${p}.title`)}</strong>
              <span>{t(`pk.instellingen.avg.dpa.${p}.text`)}</span>
            </li>
          ))}
        </ol>
      </Modal>
    </Card>
  );
}

function Hosting() {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const [extra, setExtra] = useState<Date[]>([]);
  const backups = [
    ...extra,
    ...Array.from({ length: 4 }, (_, i) => {
      const d = addDays(today, -i);
      d.setHours(3, 0, 0, 0);
      return d;
    }),
  ];
  return (
    <Card className="span-6" feature="x.hosting" eyebrow={t('pk.instellingen.avg.hostEyebrow')} title={t('pk.instellingen.avg.hostTitle')} help={t('pk.instellingen.avg.hostHelp')}>
      <div className="pk-se-dcs">
        {(['a', 'b'] as const).map((dc) => (
          <div key={dc} className="pk-se-dc">
            <PkIcon name="building" size={20} />
            <span className="pk-stack">
              <strong>{t(`pk.instellingen.avg.dc.${dc}`)}</strong>
              <small className="pk-muted">{t(dc === 'a' ? 'pk.instellingen.avg.dcPrimary' : 'pk.instellingen.avg.dcMirror')}</small>
            </span>
            <i className="live-dot" />
          </div>
        ))}
      </div>
      <h3 className="pk-subtitle pk-se-gap">{t('pk.instellingen.avg.backups')}</h3>
      <ul className="pk-list pk-se-backups">
        {backups.slice(0, 4).map((b, i) => (
          <li key={b.getTime() + '-' + i}>
            <PkIcon name="history" size={15} />
            <span className="pk-se-grow">
              {i18n.dayMonth(b, today)} · {i18n.clock(b)}
            </span>
            <Chip tone="good">{t('pk.instellingen.avg.backupOk')}</Chip>
          </li>
        ))}
      </ul>
      <div className="pk-row pk-row--between pk-se-gap">
        <small className="pk-muted">{t('pk.instellingen.avg.retention')}</small>
        <button
          className="btn btn-ghost btn-small"
          onClick={() => {
            setExtra((e) => [new Date(), ...e]);
            demo(t('pk.instellingen.avg.backupNow'));
          }}
        >
          <PkIcon name="refresh" size={14} />
          {t('pk.instellingen.avg.backupAction')}
        </button>
      </div>
    </Card>
  );
}

function Status() {
  const { t, locale } = useI18n();
  const uptime = new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <Card
      className="span-6"
      feature="x.status"
      eyebrow={t('pk.instellingen.avg.statusEyebrow')}
      title={t('pk.instellingen.avg.statusTitle')}
      actions={
        <Chip tone="good" icon="check">
          {t('pk.instellingen.avg.allUp')}
        </Chip>
      }
    >
      <ul className="pk-list pk-se-status">
        {STATUS_PARTS.map((p, i) => (
          <li key={p}>
            <i className="live-dot" />
            <span className="pk-se-grow">{t(`pk.instellingen.avg.part.${p}`)}</span>
            <span className="pk-num pk-muted pk-small">{uptime.format(99.9 + ((i * 7) % 10) / 100)}%</span>
            <Chip tone="good">{t('pk.instellingen.avg.up')}</Chip>
          </li>
        ))}
      </ul>
      <p className="pk-small pk-muted pk-se-gap">{t('pk.instellingen.avg.uptime')}</p>
    </Card>
  );
}

function ChangeLog() {
  const i18n = useI18n();
  const { t } = i18n;
  const { now } = usePraktijk();
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60000);
  return (
    <Card feature="x.log" eyebrow={t('pk.instellingen.avg.logEyebrow')} title={t('pk.instellingen.avg.logTitle')} help={t('pk.instellingen.avg.logHelp')}>
      <TableWrap label={t('pk.instellingen.avg.logTitle')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.common.time')}</th>
              <th>{t('pk.common.employee')}</th>
              <th>{t('pk.instellingen.avg.logWhat')}</th>
              <th>{t('pk.instellingen.avg.logObject')}</th>
            </tr>
          </thead>
          <tbody>
            {AUDIT.map((a) => (
              <tr key={a.id}>
                <td className="nowrap pk-num">
                  {i18n.clock(at(a.minutesAgo))} <small className="pk-muted">· {i18n.ago(at(a.minutesAgo), now)}</small>
                </td>
                <td className="nowrap">
                  {staffById(a.who).name} <span className="pk-tm-code">{staffById(a.who).code}</span>
                </td>
                <td>{t(a.key, a.args)}</td>
                <td>
                  <Chip tone="outline">{t(`pk.instellingen.avg.obj.${a.object}`)}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function Inspection() {
  const { t } = useI18n();
  const items = ['files', 'consent', 'complications', 'access', 'agb', 'backup'] as const;
  const [done, setDone] = useState<Record<string, boolean>>({ files: true, consent: true, complications: true, access: true, agb: true, backup: true });
  const count = items.filter((i) => done[i]).length;
  return (
    <Card
      feature="x.igj"
      eyebrow={t('pk.instellingen.avg.igjEyebrow')}
      title={t('pk.instellingen.avg.igjTitle')}
      help={t('pk.instellingen.avg.igjHelp')}
      actions={<Chip tone={count === items.length ? 'good' : 'warn'}>{t('pk.instellingen.avg.igjCount', { n: count, total: items.length })}</Chip>}
    >
      <div className="pk-se-checks">
        {items.map((i) => (
          <Check key={i} checked={Boolean(done[i])} onChange={(on) => setDone((d) => ({ ...d, [i]: on }))} label={t(`pk.instellingen.avg.igj.${i}`)} />
        ))}
      </div>
      <button
        className="btn btn-ghost btn-small pk-se-gap"
        onClick={() =>
          downloadCsv('pure-praktijk-igj.csv', [
            [t('pk.instellingen.avg.igjEyebrow'), t('pk.common.status')],
            ...items.map((i) => [t(`pk.instellingen.avg.igj.${i}`), done[i] ? t('pk.common.yes') : t('pk.common.no')]),
          ])
        }
      >
        <PkIcon name="download" size={14} />
        {t('pk.instellingen.avg.igjExport')}
      </button>
    </Card>
  );
}
