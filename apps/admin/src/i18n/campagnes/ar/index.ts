import type { nl } from '../nl';
import { audience } from './audience';
import { composer } from './composer';
import { frame } from './frame';
import { settings } from './settings';
import { shell } from './shell';

/** Every text of Campagnes in Arabic, the same keys as the Dutch source. */
export const ar: Record<keyof typeof nl, string> = {
  ...shell,
  ...frame,
  ...audience,
  ...settings,
  ...composer,
};
