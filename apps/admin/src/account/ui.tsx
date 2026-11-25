import { useCallback } from 'react';

import { useI18n } from '../i18n';
import { cityOf, initialsOf, type Account } from './accounts';
import './account.css';

/** The square with someone's initials; square like every avatar in the panel. */
export function AccountAvatar({ account, size = 'normal' }: { account: Account; size?: 'normal' | 'small' }) {
  return (
    <span className={`acc-avatar acc-avatar--${account.role} ${size === 'small' ? 'acc-avatar--small' : ''}`} aria-hidden="true">
      {initialsOf(account.name)}
    </span>
  );
}

/** "Huidtherapeut · Nijmegen", "Receptie · Nijmegen", "Eigenaar · beheerder", "Cliënt". */
export function useJob() {
  const { t } = useI18n();
  return useCallback(
    (account: Account) => {
      if (account.role === 'admin') return t('acc.job.admin');
      if (account.role === 'client') return t('acc.job.client');
      return t(account.desk ? 'acc.job.desk' : 'acc.job.therapist', { city: cityOf(account.locationId) });
    },
    [t],
  );
}
