import type { PkIconName } from '../praktijk/icons';

/** The tabs of Campagnes, in order; the id is also the link: #campagnes/<tab>, and #campagnes/<tab>/<campaign> opens one. */
export const CP_TABS = [
  { id: 'overzicht', icon: 'grid' },
  { id: 'kalender', icon: 'calendar' },
  { id: 'campagnes', icon: 'send' },
  { id: 'social', icon: 'camera' },
  { id: 'segmenten', icon: 'layers' },
  { id: 'contacten', icon: 'users' },
  { id: 'instellingen', icon: 'cog' },
] as const satisfies readonly { id: string; icon: PkIconName }[];

export type CpTab = (typeof CP_TABS)[number]['id'];

export type CpRoute = { tab: CpTab; campaign?: string };

const isTab = (value: string): value is CpTab => CP_TABS.some((t) => t.id === value);

/** Reads #campagnes, #campagnes/<tab> or #campagnes/<tab>/<campaign>; null when the link is for another part of the panel. */
export function campagnesFromHash(hash: string): CpRoute | null {
  const match = /^#campagnes(?:\/([a-z]+))?(?:\/([\w-]+))?$/.exec(hash);
  if (!match) return null;
  const tab = match[1] && isTab(match[1]) ? match[1] : 'overzicht';
  return { tab, campaign: match[2] };
}

export const campagnesHash = (route: CpRoute) => `campagnes/${route.tab}${route.campaign ? `/${route.campaign}` : ''}`;
