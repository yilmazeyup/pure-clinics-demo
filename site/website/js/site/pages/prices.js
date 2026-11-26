// Prijzen: the campaigns that run now, every price on one card, and the laser package prices.
import { $, nameOf, onLang } from '../core.js';
import { campaignList, laserPackages, menuCard } from '../parts.js';

export function start() {
  campaignList();
  menuCard();
  laserPackages();
  onLang(() => ($('#laser-eyebrow').textContent = nameOf('laser')));
}
