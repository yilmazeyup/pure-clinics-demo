// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'Rubriques de Campagnes',

  'cp.tab.overzicht': 'Vue d’ensemble',
  'cp.tab.kalender': 'Calendrier',
  'cp.tab.campagnes': 'Campagnes',
  'cp.tab.social': 'Planning social',
  'cp.tab.segmenten': 'Segments',
  'cp.tab.contacten': 'Contacts & consentement',
  'cp.tab.instellingen': 'Réglages',
};
