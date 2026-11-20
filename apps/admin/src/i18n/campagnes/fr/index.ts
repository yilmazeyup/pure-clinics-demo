import type { nl } from '../nl';
import { audience } from './audience';
import { composer } from './composer';
import { frame } from './frame';
import { settings } from './settings';

/** Every text of Campagnes in French, the same keys as the Dutch source. */
export const fr: Record<keyof typeof nl, string> = {
  ...frame,
  ...audience,
  ...settings,
  ...composer,
};
