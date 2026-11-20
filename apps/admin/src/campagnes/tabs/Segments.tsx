import { useI18n, type MessageKey } from '../../i18n';
import { PkIcon } from '../../praktijk/icons';
import { Chip } from '../../praktijk/kit';
import type { Segment } from '../data';
import { segmentKey, useCp } from '../state';
import { Tag, useSince } from '../ui';

const SOURCE_ICON = { app: 'phone', agenda: 'calendar', shop: 'bag', kassa: 'cash', file: 'file' } as const;

/** Segmenten: built from the panel's own data and pushed to Mailchimp as tags, with live counts. */
export function SegmentsTab() {
  const { t, clock } = useI18n();
  const { now, sync, runSync, create } = useCp();
  const since = useSince();

  return (
    <>
      <div className="cp-bar">
        <p className="pk-small pk-muted cp-bar-text">
          <PkIcon name="layers" size={16} />
          {t('cp.seg.summary', { n: sync.segments.length, time: clock(sync.at), ago: since(sync.at, now) })}
        </p>
        <button className="btn btn-ghost btn-small" onClick={runSync} disabled={Boolean(sync.running)}>
          <PkIcon name="refresh" size={14} />
          {t(sync.running ? 'cp.ov.syncing' : 'cp.ov.syncNow')}
        </button>
      </div>
      <div className="pk-grid cp-segments">
        {sync.segments.map((s) => (
          <SegmentCard key={s.id} segment={s} syncedAt={new Date(sync.at.getTime() - s.lag * 60000)} running={Boolean(sync.running)} onUse={() => create(s.id === 'sms' ? 'sms' : 'email', { segment: s.id })} />
        ))}
      </div>
      <p className="pk-small pk-muted cp-note">
        <PkIcon name="info" size={14} />
        {t('cp.seg.note')}
      </p>
    </>
  );
}

function SegmentCard({ segment: s, syncedAt, running, onUse }: { segment: Segment; syncedAt: Date; running: boolean; onUse: () => void }) {
  const { t, num } = useI18n();
  const { now } = useCp();
  const since = useSince();
  const rules = Array.from({ length: s.rules }, (_, i) => `cp.seg.${s.id}.r${i + 1}` as MessageKey);
  return (
    <section className="card pk-card cp-seg span-4">
      <div className="pk-stack">
        <span className="cp-seg-head">
          <span className="eyebrow cp-grow">{t(`cp.seg.source.${s.source}`)}</span>
          <Tag>{s.tag}</Tag>
        </span>
        <strong className="cp-seg-name">{t(segmentKey(s.id))}</strong>
      </div>
      <div className="cp-seg-count">
        <strong className="pk-num">{num(s.count)}</strong>
        <span className="cp-live">
          <i className="live-dot" />
          {t('cp.seg.live')}
        </span>
      </div>
      <div className="pk-row cp-seg-split">
        <Chip tone="outline" icon="mail">
          {t('cp.seg.emailCount', { n: num(s.email) })}
        </Chip>
        <Chip tone="outline" icon="sms">
          {t('cp.seg.smsCount', { n: num(s.sms) })}
        </Chip>
      </div>
      <ol className="cp-rules" aria-label={t('cp.seg.rules')}>
        {rules.map((key, i) => (
          <li key={key}>
            <span className="cp-rule-op">{i === 0 ? t('cp.seg.if') : t('cp.seg.and')}</span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ol>
      <div className="cp-seg-foot">
        <small className="pk-muted">
          <PkIcon name={SOURCE_ICON[s.source]} size={13} />
          {running ? t('cp.seg.syncing') : t('cp.seg.synced', { ago: since(syncedAt, now) })}
        </small>
        <button className="btn btn-ghost btn-small" onClick={onUse}>
          <PkIcon name="plus" size={14} />
          {t(s.id === 'sms' ? 'cp.seg.useSms' : 'cp.seg.useEmail')}
        </button>
      </div>
    </section>
  );
}
