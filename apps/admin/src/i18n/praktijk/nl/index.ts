import { agenda } from './agenda';
import { berichten } from './berichten';
import { overzicht } from './overzicht';
import { details } from './details';
import { clienten } from './clienten';
import { declaraties } from './declaraties';
import { dossier } from './dossier';
import { facturen } from './facturen';
import { features } from './features';
import { instellingen } from './instellingen';
import { live } from './live';
import { planner } from './planner';
import { portaal } from './portaal';
import { rapportages } from './rapportages';
import { shell } from './shell';
import { team } from './team';
import { voorraad } from './voorraad';

/** Every text of Pure Praktijk in Dutch, the source language; one file per screen. */
export const nl = {
  ...shell,
  ...overzicht,
  ...details,
  ...features,
  ...agenda,
  ...planner,
  ...portaal,
  ...clienten,
  ...dossier,
  ...facturen,
  ...declaraties,
  ...voorraad,
  ...live,
  ...berichten,
  ...rapportages,
  ...team,
  ...instellingen,
};
