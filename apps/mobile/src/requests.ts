import { TREATMENTS, type Treatment } from '@pure-clinics/shared';

import { isoDay, type RemoteAppointment } from './api';

/** Pure's own treatments. Blanche Beauty Studio (brows, nails) is a business of its own, with its own app. */
export const PURE_TREATMENTS = TREATMENTS.filter((tr) => tr.category !== 'beauty');

/** The treatment in the app's own catalogue (photo, texts), if Huidly's id is one of Pure's. */
export const treatmentOf = (id: string): Treatment | undefined => PURE_TREATMENTS.find((tr) => tr.id === id);

const when = (a: RemoteAppointment) => (a.start ? new Date(a.start).getTime() : new Date(`${a.date}T12:00:00`).getTime());

/** Requests and appointments that are still ahead: asked for or confirmed, and not past. Soonest first. */
export function upcoming(list: RemoteAppointment[] | undefined, now = new Date()): RemoteAppointment[] {
  const today = isoDay(now);
  return (list ?? [])
    .filter((a) => (a.status === 'requested' || a.status === 'confirmed') && (a.start ? new Date(a.start).getTime() > now.getTime() : a.date >= today))
    .sort((a, b) => when(a) - when(b));
}

/** Whether the client can still cancel it: not cancelled and not started. */
export const cancellable = (a: RemoteAppointment, now = new Date()) =>
  (a.status === 'requested' || a.status === 'confirmed') && (a.start ? new Date(a.start).getTime() > now.getTime() : a.date >= isoDay(now));
