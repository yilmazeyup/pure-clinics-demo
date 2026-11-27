import type { nl } from '../nl';
import { audience } from './audience';
import { composer } from './composer';
import { frame } from './frame';
import { settings } from './settings';
import { shell } from './shell';
import { social } from './social';

/** Every text of Campagnes in German, the same keys as the Dutch source. */
export const de: Record<keyof typeof nl, string> = {
  ...shell,
  ...frame,
  ...audience,
  ...settings,
  ...composer,
  ...social,
};
