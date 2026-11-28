import { useEffect } from 'react';

import { useToast } from '../components/ui';
import { connectShared, type Stored, type Transport } from '../data/sharedStore';
import { useI18n } from '../i18n';
import { HuidlyError, jsonInit, teamCall, useHuidlyTeam, ZAAK } from './client';

/** The business's data at Huidly (data/sharedStore.ts), reached with the team's Huidly connection. */
const transport: Transport = {
  list: () => teamCall<{ items: { key: string; version: string }[] }>('/store').then((r) => r.items),
  values: (keys) => teamCall<{ items: Stored[] }>(`/store?values=1${keys ? `&keys=${keys.map(encodeURIComponent).join(',')}` : ''}`).then((r) => r.items),
  put: async (key, value, version) => {
    try {
      return await teamCall<{ version: string }>(`/store/${encodeURIComponent(key)}`, jsonInit('POST', { value, version }));
    } catch (error) {
      if (!(error instanceof HuidlyError) || error.status !== 409) throw error;
      const [now] = await transport.values([key]);
      return { conflict: { version: now?.version ?? null, value: now?.value ?? null } };
    }
  },
};

/**
 * Connects this admin's data (stock, reminders, campaigns…) to Huidly while the team's connection is there, so it is
 * the very same data as in Kliniek. Without the connection the screens that show it ask for one.
 */
export function SharedConnection() {
  const team = useHuidlyTeam();
  const { t } = useI18n();
  const toast = useToast();
  const id = team ? `${ZAAK}:${team.email}` : 'local';
  useEffect(() => {
    connectShared(id, team ? transport : null, () => toast(t('hy.notSaved')));
  }, [id, team, t, toast]);
  return null;
}
