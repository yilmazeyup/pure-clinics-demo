import { useEffect, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { Seg } from '../kit';
import { Lineup } from './team/Lineup';
import { RightsTab } from './team/Rights';
import { SchedulesTab } from './team/Schedules';
import { SecurityTab } from './team/Security';
import { useChosen, useMembers, useNarrow } from './team/shared';
import { StaffTab } from './team/Staff';
import './responsive.css';
import './Team.css';
import { useTabInView } from './useTabInView';

type Tab = 'staff' | 'rights' | 'security' | 'schedules';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const TAB_OF: Record<string, Tab> = {
  's.employees': 'staff',
  'o.bookkeeper': 'staff',
  'more.calendar': 'staff',
  's.profiles': 'rights',
  's.agendaAccess': 'rights',
  's.twofa': 'security',
  's.lockout': 'security',
  's.schedules': 'schedules',
};

/** Team & rechten: the team in 3D, then employees, permission profiles, security and schedules. */
export function TeamScreen() {
  const { t, locale } = useI18n();
  const { target } = usePraktijk();
  const [tab, setTab] = useState<Tab>('staff');
  useTabInView(tab);
  const [members] = useMembers();
  const [chosen, setChosen] = useChosen();
  const narrow = useNarrow();

  useEffect(() => {
    const to = target?.feature ? TAB_OF[target.feature] : undefined;
    if (to) setTab(to);
  }, [target?.at]);

  return (
    <>
      <Lineup
        key={`${locale}-${narrow ? 'narrow' : 'wide'}`}
        members={members}
        chosen={chosen}
        compact={narrow}
        onChoose={(id) => {
          setChosen(id);
          setTab((current) => (current === 'rights' || current === 'schedules' ? current : 'staff'));
        }}
      />
      <Seg
        variant="tabs"
        label={t('pk.team.tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'staff', label: t('pk.team.tab.staff'), icon: 'users' },
          { value: 'rights', label: t('pk.team.tab.rights'), icon: 'key' },
          { value: 'security', label: t('pk.team.tab.security'), icon: 'shieldCheck' },
          { value: 'schedules', label: t('pk.team.tab.schedules'), icon: 'calendar' },
        ]}
      />
      {tab === 'staff' ? <StaffTab onTab={setTab} /> : null}
      {tab === 'rights' ? <RightsTab /> : null}
      {tab === 'security' ? <SecurityTab /> : null}
      {tab === 'schedules' ? <SchedulesTab /> : null}
    </>
  );
}
