import { addDays, type TreatmentId } from '@pure-clinics/shared';

import type { MessageKey } from '../../i18n';
import { rng } from '../../data/random';
import type { Channel } from '../screens/messages/template';
import type { StaffId } from './core';

// Berichten: the templates, earlier newsletters and team notes of the demo. Texts are message keys until someone edits
// them; then the typed text is kept as it is.

export type MessageTemplate = { id: 'reminderEmail' | 'reminderSms' | 'reminderWhatsapp' | 'intakeForm' | 'followUp' | 'review'; channel: Channel };

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { id: 'reminderEmail', channel: 'email' },
  { id: 'reminderSms', channel: 'sms' },
  { id: 'reminderWhatsapp', channel: 'whatsapp' },
  { id: 'intakeForm', channel: 'email' },
  { id: 'followUp', channel: 'email' },
  { id: 'review', channel: 'email' },
];

export type ReminderSettings = { email: boolean; sms: boolean; whatsapp: boolean; hours: 24 | 48; time: string };
export const SEED_REMINDERS: ReminderSettings = { email: true, sms: true, whatsapp: true, hours: 24, time: '02:00' };

export type DeliveryStatus = 'delivered' | 'opened' | 'failed';

/** How last night's reminder for an appointment fared; the same on every load. */
export function deliveryOf(apptId: string, channel: Channel): DeliveryStatus {
  const roll = rng(`delivery-${apptId}-${channel}`)();
  if (roll < 0.05) return 'failed';
  return roll < (channel === 'email' ? 0.62 : 0.86) ? 'opened' : 'delivered';
}

export type Newsletter = {
  id: string;
  subject: string | null;
  subjectKey?: MessageKey;
  at: Date;
  recipients: number;
  /** Share opened, 0 to 1; null while it is a draft. */
  opened: number | null;
  draft: boolean;
};

export function seedNewsletters(today: Date): Newsletter[] {
  return [
    { id: 'n3', subject: null, subjectKey: 'pk.berichten.news.seed1', at: addDays(today, -19), recipients: 1184, opened: 0.47, draft: false },
    { id: 'n2', subject: null, subjectKey: 'pk.berichten.news.seed2', at: addDays(today, -96), recipients: 1121, opened: 0.52, draft: false },
    { id: 'n1', subject: null, subjectKey: 'pk.berichten.news.seed3', at: addDays(today, -171), recipients: 1063, opened: 0.58, draft: false },
  ];
}

export type BlockKind = 'text' | 'image' | 'file';
export type Block = { id: string; kind: BlockKind; text: string; image: string | null; file: string | null };

export type NewsTemplate = { id: string; name: string | null; nameKey?: MessageKey; subject: string; preview: string; blocks: Block[] };

export type Note = { id: string; author: StaffId; at: Date; text: string | null; textKey?: MessageKey; pinned: boolean };

export function seedNotes(now: Date): Note[] {
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600000);
  return [
    { id: 'note1', author: 'nadila', at: ago(3), text: null, textKey: 'pk.berichten.note.seed1', pinned: true },
    { id: 'note2', author: 'husna', at: ago(1.2), text: null, textKey: 'pk.berichten.note.seed2', pinned: false },
    { id: 'note3', author: 'margot', at: ago(20), text: null, textKey: 'pk.berichten.note.seed3', pinned: false },
    { id: 'note4', author: 'loubna', at: ago(46), text: null, textKey: 'pk.berichten.note.seed4', pinned: false },
  ];
}

/** Weeks to the next session of a series, for the aftercare mail's last line. */
export const NEXT_WEEKS: Partial<Record<TreatmentId, number>> = {
  laser: 5,
  epilation: 4,
  acne: 3,
  couperose: 5,
  pigment: 4,
  skinpen: 5,
  sylfirm: 4,
  tattoo: 10,
  xlhair: 2,
  ipl: 4,
  peel: 3,
  deepclean: 4,
  tixel: 6,
  prx: 3,
};
