// Campagnes: the names of its parts, under Campagnes in the panel's menu.
import type { shell as source } from '../nl/shell';

export const shell: Record<keyof typeof source, string> = {
  'cp.tabs': 'أقسام الحملات',

  'cp.tab.overzicht': 'نظرة عامة',
  'cp.tab.kalender': 'التقويم',
  'cp.tab.campagnes': 'الحملات',
  'cp.tab.segmenten': 'الشرائح',
  'cp.tab.contacten': 'جهات الاتصال والموافقة',
  'cp.tab.instellingen': 'الإعدادات',
};
