import { useCallback } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk, useShared } from '../../context';
import type { PracticeClient } from '../../data/core';
import { newId, seedDossier, type DossierState, type Txt } from '../../data/dossier';

export type Update = (change: (state: DossierState) => DossierState, line?: Txt) => void;

/** One client's file, kept per client for the whole visit; every change can add a line to the change log. */
export function useDossier(client: PracticeClient) {
  const { today, now } = usePraktijk();
  const [state, set] = useShared<DossierState>(`dossier:${client.id}`, () => seedDossier(client, today, now));
  const update: Update = useCallback(
    (change, line) =>
      set((s) => {
        const next = change(s);
        return line ? { ...next, log: [{ id: newId('log'), at: new Date(now), who: 'you', line }, ...next.log] } : next;
      }),
    [set, now],
  );
  return { state, update };
}

/** Shows a seeded sentence in the chosen language, or what someone typed. */
export function useTxt() {
  const { t } = useI18n();
  return useCallback((txt: Txt | null | undefined) => (!txt ? '' : 'text' in txt ? txt.text : t(txt.key, txt.args)), [t]);
}
