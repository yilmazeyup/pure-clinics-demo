// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'Parts of Campaigns',

  'cp.tab.overzicht': 'Overview',
  'cp.tab.kalender': 'Calendar',
  'cp.tab.campagnes': 'Campaigns',
  'cp.tab.segmenten': 'Segments',
  'cp.tab.contacten': 'Contacts & consent',
  'cp.tab.instellingen': 'Settings',
};
