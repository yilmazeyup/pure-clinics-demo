import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { STAFF, type PracticeClient } from '../data/core';
import { Seg } from '../kit';
import { useClients } from './clients/useClients';
import { EpisodesTab } from './dossier/Episodes';
import { DossierHeader } from './dossier/Header';
import { IntakeTab } from './dossier/Intake';
import { LogTab } from './dossier/Log';
import { MediaTab } from './dossier/Media';
import { ReportsTab } from './dossier/Reports';
import { useDossier } from './dossier/useDossier';
import './responsive.css';
import './Dossier.css';
import { useTabInView } from './useTabInView';

type Tab = 'episodes' | 'intake' | 'reports' | 'media' | 'log';
const TABS: Tab[] = ['episodes', 'intake', 'reports', 'media', 'log'];

/** Which tab holds each feature, so a jump from the feature overview opens the right one. */
const FEATURE_TAB: Record<string, Tab> = {
  'e.episodes': 'episodes',
  'e.billing': 'episodes',
  'e.ownprice': 'episodes',
  'e.template': 'episodes',
  'e.start': 'episodes',
  'e.history': 'episodes',
  'e.linked': 'episodes',
  'e.zt': 'episodes',
  'e.anamnesis': 'episodes',
  'e.cosmetic': 'episodes',
  'e.partner': 'episodes',
  'v.mergeEpisodes': 'episodes',
  'f.intake': 'intake',
  'f.verify': 'intake',
  'f.health': 'intake',
  'f.mrsa': 'intake',
  'f.consent': 'intake',
  'f.dth': 'intake',
  'f.icf': 'intake',
  'g.templates': 'reports',
  'g.flex': 'reports',
  'g.lots': 'reports',
  'g.canvas': 'reports',
  'g.checklists': 'reports',
  'g.injectables': 'reports',
  'g.annotate': 'reports',
  'g.complications': 'reports',
  'h.photos': 'media',
  'h.docs': 'media',
  'h.plan': 'media',
  'e.log': 'log',
};

/** Client first names that are also team names; a demo file should never look like it belongs to a colleague. */
const TEAM_NAMES = new Set(STAFF.map((s) => s.name));

/** A rich file to open on when nobody was chosen: several episodes, one well under way, and an allergy to warn about. */
function defaultClient(list: PracticeClient[]): PracticeClient | undefined {
  const real = list.filter((c) => !c.id.endsWith('-dup') && !TEAM_NAMES.has(c.first));
  const underway = (c: PracticeClient) => c.episodes.some((e) => !e.closed && e.sessions.done >= 3 && e.condition !== 'beauty');
  return (
    real.find((c) => c.episodes.length >= 2 && c.allergies.length > 0 && underway(c)) ??
    real.find((c) => c.episodes.length >= 2 && underway(c)) ??
    real.find((c) => c.episodes.length >= 2) ??
    real[0]
  );
}

/** The electronic file (EPD) of one client. */
export function DossierScreen() {
  const { t } = useI18n();
  const { clientId, target } = usePraktijk();
  const { list, byId } = useClients();
  const fallback = useMemo(() => defaultClient(list), [list]);
  const client = byId(clientId) ?? fallback;
  const [tab, setTab] = useState<Tab>('episodes');
  useTabInView(tab);

  useEffect(() => {
    const tabFor = target?.feature ? FEATURE_TAB[target.feature] : undefined;
    if (tabFor) setTab(tabFor);
  }, [target?.at]);

  if (!client) return null;
  return (
    <div className="pk-ds">
      <DossierHeader client={client} clients={list} />
      <Seg
        variant="tabs"
        value={tab}
        onChange={setTab}
        label={t('pk.dossier.tabs')}
        options={TABS.map((id) => ({ value: id, label: t(`pk.dossier.tab.${id}`) }))}
      />
      <DossierBody key={client.id} client={client} tab={tab} />
    </div>
  );
}

function DossierBody({ client, tab }: { client: PracticeClient; tab: Tab }) {
  const { state, update } = useDossier(client);
  switch (tab) {
    case 'episodes':
      return <EpisodesTab client={client} state={state} update={update} />;
    case 'intake':
      return <IntakeTab client={client} state={state} update={update} />;
    case 'reports':
      return <ReportsTab client={client} state={state} update={update} />;
    case 'media':
      return <MediaTab client={client} state={state} update={update} />;
    case 'log':
      return <LogTab state={state} />;
  }
}
