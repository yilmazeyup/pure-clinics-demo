import { audience } from './audience';
import { composer } from './composer';
import { frame } from './frame';
import { settings } from './settings';
import { shell } from './shell';
import { social } from './social';

/** Every text of Campagnes in Dutch, the source language; one file per part. */
export const nl = {
  ...shell,
  ...frame,
  ...audience,
  ...settings,
  ...composer,
  ...social,
};
