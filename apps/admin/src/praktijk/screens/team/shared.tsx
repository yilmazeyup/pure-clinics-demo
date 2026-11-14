import { useEffect, useState } from 'react';

import { useShared, usePraktijk } from '../../context';
import { portrait, type StaffId } from '../../data/core';
import { seedAgendaAccess } from '../../data/shared';
import { scheduleOf, seedAttempts, seedMembers, seedProfiles, type Attempt, type Member, type Schedule } from '../../data/team';

// State of Team & rechten, kept in the module so it survives switching tabs and screens.

export const useMembers = () => useShared('team.members', seedMembers);
export const useProfiles = () => useShared('team.profiles', seedProfiles);
export const useAttempts = () => useShared<Attempt[]>('team.attempts', seedAttempts);
export const useAgendaAccess = () => useShared('agendaAccess', seedAgendaAccess);
export const useSchedules = () =>
  useShared<Record<string, Schedule>>('team.schedules', () => Object.fromEntries(seedMembers().map((m) => [m.id, scheduleOf(m)])));

/** The member the 3D lineup and the tables have chosen. */
export const useChosen = () => useShared<string>('team.chosen', () => 'margot');

/** A team member's portrait, or her initial in a sand disc when there is no photo. */
export function MemberPhoto({ member, size }: { member: Pick<Member, 'id' | 'name' | 'photo' | 'staffId'>; size: number }) {
  return member.photo && member.staffId ? (
    <img className="pk-avatar" src={portrait(member.staffId as StaffId)} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="pk-avatar pk-avatar--initial" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {member.name[0]}
    </span>
  );
}

/** A day of the week to format weekday names with: the 8th of November 2026 was a Sunday. */
export const weekdayDate = (day: number) => new Date(2026, 10, 8 + day);

export const hourText = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** True while the screen is phone-sized; the 3D lineup is laid out closer together then. */
export function useNarrow(query = '(max-width: 640px)') {
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const on = () => setNarrow(media.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

/** A moment some minutes before the demo clock. */
export function useMinutesAgo() {
  const { now } = usePraktijk();
  return (minutes: number) => new Date(now.getTime() - minutes * 60000);
}
