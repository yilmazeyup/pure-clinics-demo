// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'Apartados de Campañas',

  'cp.tab.overzicht': 'Resumen',
  'cp.tab.kalender': 'Calendario',
  'cp.tab.campagnes': 'Campañas',
  'cp.tab.social': 'Planificación social',
  'cp.tab.segmenten': 'Segmentos',
  'cp.tab.contacten': 'Contactos y consentimiento',
  'cp.tab.instellingen': 'Ajustes',
};
