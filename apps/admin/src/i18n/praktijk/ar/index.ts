import type { nl } from '../nl';
import { agenda } from './agenda';
import { berichten } from './berichten';
import { clienten } from './clienten';
import { declaraties } from './declaraties';
import { dossier } from './dossier';
import { facturen } from './facturen';
import { features } from './features';
import { instellingen } from './instellingen';
import { planner } from './planner';
import { portaal } from './portaal';
import { rapportages } from './rapportages';
import { shell } from './shell';
import { team } from './team';
import { voorraad } from './voorraad';

/** Every text of Pure Praktijk in Arabic, the same keys as the Dutch source. */
export const ar: Record<keyof typeof nl, string> = {
  ...shell,
  ...features,
  ...agenda,
  ...planner,
  ...portaal,
  ...clienten,
  ...dossier,
  ...facturen,
  ...declaraties,
  ...voorraad,
  ...berichten,
  ...rapportages,
  ...team,
  ...instellingen,
};
