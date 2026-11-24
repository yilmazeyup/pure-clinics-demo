import { useEffect, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { Seg } from '../kit';
import { AvgTab } from './settings/Avg';
import { IntegrationsTab } from './settings/Integrations';
import { LocationsTab } from './settings/Locations';
import { MasterTab } from './settings/Master';
import { SupportTab } from './settings/Support';
import './responsive.css';
import './Settings.css';
import { useTabInView } from './useTabInView';

type Tab = 'locations' | 'master' | 'integrations' | 'avg' | 'support';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const TAB_OF: Record<string, Tab> = {
  't.locations': 'locations',
  't.five': 'locations',
  't.perLocation': 'locations',
  'u.clinic': 'master',
  'u.conditions': 'master',
  'u.treatments': 'master',
  'u.practice': 'master',
  'i.prices': 'master',
  'more.languages': 'master',
  'x.cert': 'avg',
  'x.dpa': 'avg',
  'x.hosting': 'avg',
  'x.log': 'avg',
  'x.status': 'avg',
  'x.igj': 'avg',
  'v.import': 'support',
  'r.starter': 'support',
  'y.forum': 'support',
  'y.help': 'support',
  'y.webinars': 'support',
  'y.helpdesk': 'support',
};

/** Instellingen & koppelingen: locations, master data, integrations, security and privacy, import and support. */
export function SettingsScreen() {
  const { t } = useI18n();
  const { target } = usePraktijk();
  const [tab, setTab] = useState<Tab>('locations');
  useTabInView(tab);

  useEffect(() => {
    const feature = target?.feature;
    if (!feature) return;
    const to = TAB_OF[feature] ?? (feature.startsWith('w.') ? 'integrations' : undefined);
    if (to) setTab(to);
  }, [target?.at]);

  return (
    <>
      <Seg
        variant="tabs"
        label={t('pk.instellingen.tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'locations', label: t('pk.instellingen.tab.locations'), icon: 'building' },
          { value: 'master', label: t('pk.instellingen.tab.master'), icon: 'list' },
          { value: 'integrations', label: t('pk.instellingen.tab.integrations'), icon: 'plug' },
          { value: 'avg', label: t('pk.instellingen.tab.avg'), icon: 'shieldCheck' },
          { value: 'support', label: t('pk.instellingen.tab.support'), icon: 'help' },
        ]}
      />
      {tab === 'locations' ? <LocationsTab /> : null}
      {tab === 'master' ? <MasterTab /> : null}
      {tab === 'integrations' ? <IntegrationsTab /> : null}
      {tab === 'avg' ? <AvgTab /> : null}
      {tab === 'support' ? <SupportTab /> : null}
    </>
  );
}
