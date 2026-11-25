// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'Sezioni di Campagne',

  'cp.tab.overzicht': 'Panoramica',
  'cp.tab.kalender': 'Calendario',
  'cp.tab.campagnes': 'Campagne',
  'cp.tab.segmenten': 'Segmenti',
  'cp.tab.contacten': 'Contatti e consensi',
  'cp.tab.instellingen': 'Impostazioni',
};
