import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { scheduleOf, WEEKDAYS, type Schedule, type Slot } from '../../data/team';
import { Card, TableWrap } from '../../kit';
import { hourText, MemberPhoto, useChosen, useMembers, useSchedules, weekdayDate } from './shared';

const HOURS = Array.from({ length: 16 }, (_, i) => 7 + i);

const hoursOf = (s: Schedule) => WEEKDAYS.reduce((sum, d) => sum + (s[d]?.on ? s[d].to - s[d].from : 0), 0);

/** Weekly schedules as availability: the agenda, planner and online booking only plan inside them. */
export function SchedulesTab() {
  const i18n = useI18n();
  const { t } = i18n;
  const { demo } = usePraktijk();
  const [members] = useMembers();
  const [schedules, setSchedules] = useSchedules();
  const [chosen, setChosen] = useChosen();
  const active = members.filter((m) => m.active);
  const scheduleFor = (id: string) => schedules[id] ?? scheduleOf(members.find((m) => m.id === id)!);
  const setSlot = (id: string, day: number, change: Partial<Slot>) =>
    setSchedules((all) => {
      const current = all[id] ?? scheduleOf(members.find((m) => m.id === id)!);
      return { ...all, [id]: { ...current, [day]: { ...current[day], ...change } } };
    });
  const editing = active.find((m) => m.id === chosen) ?? active[0];
  const mine = scheduleFor(editing.id);

  return (
    <div className="pk-grid">
      <Card className="span-8" feature="s.schedules" eyebrow={t('pk.team.schEyebrow')} title={t('pk.team.schTitle')} help={t('pk.team.schHelp')}>
        <TableWrap label={t('pk.team.schEyebrow')}>
          <table className="pk-table pk-tm-week pk-sticky-start">
            <thead>
              <tr>
                <th>{t('pk.team.col.name')}</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="pk-tm-center">
                    {i18n.weekdayShort(weekdayDate(d))}
                  </th>
                ))}
                <th className="end">{t('pk.team.schHours')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((m) => {
                const s = scheduleFor(m.id);
                return (
                  <tr key={m.id} aria-selected={m.id === editing.id} onClick={() => setChosen(m.id)}>
                    <td>
                      <span className="pk-tm-who">
                        <MemberPhoto member={m} size={24} />
                        {m.name}
                      </span>
                    </td>
                    {WEEKDAYS.map((d) => (
                      <td key={d} className="pk-tm-center">
                        <button
                          type="button"
                          className={`pk-tm-slot ${s[d]?.on ? 'on' : ''}`}
                          aria-pressed={Boolean(s[d]?.on)}
                          aria-label={`${m.name} · ${i18n.weekdayLong(weekdayDate(d))}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSlot(m.id, d, { on: !s[d]?.on });
                          }}
                        >
                          {s[d]?.on ? `${s[d].from}–${s[d].to}` : t('pk.team.schOff')}
                        </button>
                      </td>
                    ))}
                    <td className="end pk-num">{hoursOf(s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card className="span-4" eyebrow={t('pk.team.schEyebrow')} title={t('pk.team.schEdit', { name: editing.name })}>
        <div className="pk-tm-who pk-tm-edit-who">
          <MemberPhoto member={editing} size={40} />
          <span className="pk-muted pk-small">{t('pk.team.schWeek', { n: hoursOf(mine) })}</span>
        </div>
        <ul className="pk-list pk-tm-edit">
          {WEEKDAYS.map((d) => {
            const slot = mine[d];
            return (
              <li key={d}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={slot.on}
                  aria-label={i18n.weekdayLong(weekdayDate(d))}
                  className="pk-switch"
                  onClick={() => setSlot(editing.id, d, { on: !slot.on })}
                >
                  <i />
                </button>
                <span className="pk-tm-day">{i18n.weekdayLong(weekdayDate(d))}</span>
                <select
                  className="pk-input pk-tm-select"
                  value={slot.from}
                  disabled={!slot.on}
                  aria-label={t('pk.team.schFrom')}
                  onChange={(e) => setSlot(editing.id, d, { from: Math.min(Number(e.target.value), slot.to - 1) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourText(h)}
                    </option>
                  ))}
                </select>
                <select
                  className="pk-input pk-tm-select"
                  value={slot.to}
                  disabled={!slot.on}
                  aria-label={t('pk.team.schTo')}
                  onChange={(e) => setSlot(editing.id, d, { to: Math.max(Number(e.target.value), slot.from + 1) })}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourText(h)}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-primary btn-small" onClick={() => demo(t('pk.team.schSaved', { name: editing.name }))}>
          {t('pk.common.save')}
        </button>
      </Card>
    </div>
  );
}
