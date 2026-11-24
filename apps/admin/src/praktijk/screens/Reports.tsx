import { useEffect, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import type { Period } from '../data/reports';
import { Seg } from '../kit';
import { Episodes } from './reports/Episodes';
import { Finance } from './reports/Finance';
import { Marketing } from './reports/Marketing';
import { Quality } from './reports/Quality';
import './responsive.css';
import './Reports.css';
import { useTabInView } from './useTabInView';

type Group = 'finance' | 'episodes' | 'marketing' | 'quality';

/** Where each report lives, so a jump from the feature overview opens its group. */
const GROUP_OF: Record<string, Group> = {
  'p.revenue': 'finance',
  'p.expected': 'finance',
  'o.forecast': 'finance',
  'p.staff': 'finance',
  'p.gift': 'finance',
  'l.report': 'finance',
  'p.share': 'finance',
  'p.files': 'episodes',
  'p.occupancy': 'episodes',
  'p.complications': 'episodes',
  'p.top10': 'marketing',
  'p.builder': 'marketing',
  'p.qualizorg': 'quality',
};

/** Rapportages: four groups of reports over a chosen period, every one exportable. */
export function ReportsScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const [group, setGroup] = useState<Group>('finance');
  useTabInView(group);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    const next = target?.feature ? GROUP_OF[target.feature] : undefined;
    if (next) setGroup(next);
  }, [target?.at]);

  return (
    <div className="pk-stack pk-rp">
      <div className="pk-rp-head" data-feature="p.groups">
        <Seg
          variant="tabs"
          label={t('pk.rapportages.groups')}
          value={group}
          onChange={setGroup}
          options={[
            { value: 'finance', label: t('pk.rapportages.group.finance'), icon: 'euro' },
            { value: 'episodes', label: t('pk.rapportages.group.episodes'), icon: 'layers' },
            { value: 'marketing', label: t('pk.rapportages.group.marketing'), icon: 'trend' },
            { value: 'quality', label: t('pk.rapportages.group.quality'), icon: 'star' },
          ]}
        />
        <Seg
          label={t('pk.rapportages.period')}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t('pk.rapportages.period.month') },
            { value: 'quarter', label: t('pk.rapportages.period.quarter') },
            { value: 'year', label: t('pk.rapportages.period.year') },
          ]}
        />
      </div>

      {group === 'finance' ? (
        <Finance period={period} />
      ) : group === 'episodes' ? (
        <Episodes period={period} />
      ) : group === 'marketing' ? (
        <Marketing period={period} />
      ) : (
        <Quality period={period} />
      )}
    </div>
  );
}
