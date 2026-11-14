import type { PkIconName } from './icons';

/** The screens of Pure Praktijk, in the order of the sub-navigation; the id is also the link: #praktijk/<id>. */
export const SCREENS = [
  { id: 'agenda', icon: 'calendar' },
  { id: 'planner', icon: 'device' },
  { id: 'portaal', icon: 'globe' },
  { id: 'clienten', icon: 'users' },
  { id: 'dossier', icon: 'file' },
  { id: 'facturen', icon: 'euro' },
  { id: 'declaraties', icon: 'shieldCheck' },
  { id: 'voorraad', icon: 'box' },
  { id: 'berichten', icon: 'mail' },
  { id: 'rapportages', icon: 'chart' },
  { id: 'team', icon: 'user' },
  { id: 'instellingen', icon: 'cog' },
  { id: 'functies', icon: 'check' },
] as const satisfies readonly { id: string; icon: PkIconName }[];

export type ScreenId = (typeof SCREENS)[number]['id'];

export const isScreen = (value: string): value is ScreenId => SCREENS.some((s) => s.id === value);

/** Reads #praktijk or #praktijk/<screen> (optionally /<feature>); null when the link is for the overview. */
export function screenFromHash(hash: string): { screen: ScreenId; feature?: string } | null {
  const match = /^#praktijk(?:\/([a-z]+))?(?:\/([\w.]+))?$/.exec(hash);
  if (!match) return null;
  const screen = match[1] && isScreen(match[1]) ? match[1] : 'agenda';
  return { screen, feature: match[2] };
}
