import { addDays, LOCATIONS } from '@pure-clinics/shared';
import { useMemo } from 'react';

import { useI18n, type MessageKey } from '../../../i18n';
import { usePraktijk } from '../../context';
import { periodRange, QUALITY_COMMENTS, qualizorg, stamp, type Period } from '../../data/reports';
import { Card, Chip, Stat } from '../../kit';
import { BarList, LOCATION_COLOR, useChartFormat } from './charts';
import { ExportButton } from './ExportButton';

/** Kwaliteit: Qualizorg's satisfaction survey per location, with the latest comments. */
export function Quality({ period }: { period: Period }) {
  const { t, pct, dayMonth } = useI18n();
  const { today, now } = usePraktijk();
  const fmt = useChartFormat();
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const results = useMemo(() => qualizorg(range), [range]);

  return (
    <div className="pk-grid">
      <Card
        feature="p.qualizorg"
        eyebrow={t('pk.rapportages.quality.eyebrow')}
        title={t('pk.rapportages.quality.title')}
        help={t('pk.rapportages.quality.help')}
        actions={
          <ExportButton
            file={`pure-qualizorg-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.common.location'), t('pk.rapportages.quality.score'), t('pk.rapportages.quality.nps'), t('pk.rapportages.quality.response'), '6', '7', '8', '9', '10'],
              ...results.map((q) => [
                LOCATIONS.find((l) => l.id === q.locationId)?.city ?? '',
                q.score.toFixed(1),
                q.nps,
                `${Math.round((q.responses / q.invited) * 100)}%`,
                ...q.spread,
              ]),
            ]}
          />
        }
      >
        <div className="pk-grid">
          {results.map((q) => {
            const city = LOCATIONS.find((l) => l.id === q.locationId)?.city ?? '';
            return (
              <section key={q.locationId} className="pk-rp-quality span-6">
                <h3 className="pk-subtitle">{city}</h3>
                <div className="pk-rp-quality-stats">
                  <Stat label={t('pk.rapportages.quality.score')} value={fmt.one(q.score)} tone="good" />
                  <Stat label={t('pk.rapportages.quality.nps')} value={q.nps > 0 ? `+${q.nps}` : q.nps} />
                  <Stat
                    label={t('pk.rapportages.quality.response')}
                    value={pct(q.responses / q.invited)}
                    sub={t('pk.rapportages.quality.responseSub', { n: q.responses, total: q.invited })}
                  />
                </div>
                <span className="eyebrow pk-rp-spread-title">{t('pk.rapportages.quality.spread')}</span>
                <BarList
                  rows={q.spread
                    .map((n, i) => ({
                      key: String(6 + i),
                      label: t('pk.rapportages.quality.mark', { n: 6 + i }),
                      value: n,
                      display: String(n),
                      color: LOCATION_COLOR[q.locationId],
                    }))
                    .reverse()}
                />
              </section>
            );
          })}
        </div>

        <h3 className="pk-subtitle pk-rp-comments-title">{t('pk.rapportages.quality.comments')}</h3>
        <ul className="pk-rp-comments">
          {QUALITY_COMMENTS.map((c) => (
            <li key={c.key}>
              <blockquote>{t(`pk.rapportages.quality.${c.key}` as MessageKey)}</blockquote>
              <span className="pk-row">
                <Chip tone={c.score >= 9 ? 'good' : 'brand'}>{t('pk.rapportages.quality.mark', { n: c.score })}</Chip>
                <small className="pk-muted">
                  {LOCATIONS.find((l) => l.id === c.locationId)?.city} · {dayMonth(addDays(today, -c.back), now)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
