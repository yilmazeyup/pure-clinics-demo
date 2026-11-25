// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'Bereiche der Kampagnen',

  'cp.tab.overzicht': 'Übersicht',
  'cp.tab.kalender': 'Kalender',
  'cp.tab.campagnes': 'Kampagnen',
  'cp.tab.segmenten': 'Segmente',
  'cp.tab.contacten': 'Kontakte & Einwilligung',
  'cp.tab.instellingen': 'Einstellungen',
};
