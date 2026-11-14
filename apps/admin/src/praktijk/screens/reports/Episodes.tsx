import { addDays, LOCATIONS, SPECIALISTS, type LocationId } from '@pure-clinics/shared';
import { useMemo, useState, type CSSProperties } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { CONDITIONS, practiceClients, staffById, type ConditionId } from '../../data/core';
import {
  complications,
  COMPLICATION_TYPES,
  isoWeek,
  occupancyWeek,
  periodRange,
  SEVERITIES,
  stamp,
  weekStartOf,
  type Period,
} from '../../data/reports';
import { PkIcon } from '../../icons';
import { Avatar, Bar, Card, Seg, Stat, TableWrap, useDecimal } from '../../kit';
import { ExportButton } from './ExportButton';

/** Episodes: the client files by condition, how full each agenda is, and the complications register. */
export function Episodes({ period }: { period: Period }) {
  const { t, pct, weekdayShort, dayMonth } = useI18n();
  const { today, now, go } = usePraktijk();
  const dec = useDecimal();

  const clients = useMemo(() => practiceClients(today), [today]);
  const rows = useMemo(() => {
    const map = new Map<ConditionId, { open: number; closed: number; done: number; total: number; insured: number }>();
    for (const c of clients) {
      for (const e of c.episodes) {
        const r = map.get(e.condition) ?? { open: 0, closed: 0, done: 0, total: 0, insured: 0 };
        if (e.closed) r.closed++;
        else r.open++;
        r.done += e.sessions.done;
        r.total += e.sessions.total;
        if (e.billing === 'insurer') r.insured++;
        map.set(e.condition, r);
      }
    }
    return CONDITIONS.map((c) => ({ condition: c, ...(map.get(c.id) ?? { open: 0, closed: 0, done: 0, total: 0, insured: 0 }) })).filter((r) => r.open + r.closed);
  }, [clients]);
  const episodes = rows.reduce((s, r) => s + r.open + r.closed, 0);
  const open = rows.reduce((s, r) => s + r.open, 0);

  const range = useMemo(() => periodRange(period, today), [period, today]);
  const register = useMemo(() => complications(range, today), [range, today]);
  const total = (type: (typeof COMPLICATION_TYPES)[number]) => SEVERITIES.reduce((s, v) => s + register[type][v], 0);

  const [week, setWeek] = useState(() => weekStartOf(today));
  const [where, setWhere] = useState<LocationId>('nijmegen');
  const grid = useMemo(() => occupancyWeek(week), [week]);
  const team = SPECIALISTS.filter((s) => s.locationId === where);
  const days = grid[team[0].id].map((c) => c.day);
  const average = (values: (number | null)[]) => {
    const list = values.filter((v): v is number => v !== null);
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  };

  return (
    <div className="pk-grid">
      <Card
        className="span-7"
        feature="p.files"
        eyebrow={t('pk.rapportages.files.eyebrow')}
        title={t('pk.rapportages.files.title')}
        help={t('pk.rapportages.files.help')}
        actions={
          <ExportButton
            file={`pure-episodes-${stamp(today)}.csv`}
            rows={() => [
              [t('pk.common.condition'), t('pk.rapportages.files.open'), t('pk.rapportages.files.closed'), t('pk.rapportages.files.avg'), t('pk.rapportages.files.insured')],
              ...rows.map((r) => [t(r.condition.label), r.open, r.closed, (r.done / Math.max(1, r.open + r.closed)).toFixed(1), r.insured]),
            ]}
          />
        }
      >
        <div className="pk-stats pk-rp-stats-tight">
          <Stat label={t('pk.rapportages.files.clients')} value={clients.length} />
          <Stat label={t('pk.rapportages.files.open')} value={open} />
          <Stat label={t('pk.rapportages.files.closed')} value={episodes - open} />
        </div>
        <TableWrap label={t('pk.rapportages.files.title')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.common.condition')}</th>
                <th className="end">{t('pk.rapportages.files.open')}</th>
                <th className="end">{t('pk.rapportages.files.closed')}</th>
                <th className="end">{t('pk.rapportages.files.avg')}</th>
                <th className="end">{t('pk.rapportages.files.insured')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.condition.id}>
                  <td>{t(r.condition.label)}</td>
                  <td className="end">{r.open}</td>
                  <td className="end">{r.closed}</td>
                  <td className="end pk-rp-progress" title={t('pk.rapportages.files.progress')}>
                    {dec(r.done / Math.max(1, r.open + r.closed))}
                    <Bar value={r.done} max={r.total} />
                  </td>
                  <td className="end">{r.condition.insured ? pct(r.insured / Math.max(1, r.open + r.closed)) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card
        className="span-5"
        feature="p.complications"
        eyebrow={t('pk.rapportages.complications.eyebrow')}
        title={t('pk.rapportages.complications.title')}
        help={t('pk.rapportages.complications.help')}
        actions={
          <button className="btn btn-ghost btn-small" onClick={() => go('dossier', { feature: 'g.complications' })}>
            {t('pk.rapportages.complications.toRegister')}
            <PkIcon name="arrow" size={14} />
          </button>
        }
      >
        <TableWrap label={t('pk.rapportages.complications.title')}>
          <table className="pk-table">
            <thead>
              <tr>
                <th>{t('pk.rapportages.complications.type')}</th>
                {SEVERITIES.map((s) => (
                  <th key={s} className="end">
                    {t(`pk.rapportages.severity.${s}`)}
                  </th>
                ))}
                <th className="end">{t('pk.rapportages.complications.total')}</th>
              </tr>
            </thead>
            <tbody>
              {COMPLICATION_TYPES.map((type) => (
                <tr key={type}>
                  <td>{t(`pk.rapportages.complications.${type}`)}</td>
                  {SEVERITIES.map((s) => (
                    <td key={s} className={`end pk-rp-sev pk-rp-sev--${s}`}>
                      {register[type][s] || '–'}
                    </td>
                  ))}
                  <td className="end">
                    <b>{total(type)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('pk.rapportages.complications.total')}</td>
                {SEVERITIES.map((s) => (
                  <td key={s} className="end">
                    {COMPLICATION_TYPES.reduce((n, type) => n + register[type][s], 0)}
                  </td>
                ))}
                <td className="end">{COMPLICATION_TYPES.reduce((n, type) => n + total(type), 0)}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>

      <Card
        feature="p.occupancy"
        eyebrow={t('pk.rapportages.occupancy.eyebrow')}
        title={t('pk.rapportages.occupancy.title')}
        help={t('pk.rapportages.occupancy.help')}
        actions={
          <ExportButton
            file={`pure-bezetting-wk${isoWeek(week)}.csv`}
            rows={() => [
              [t('pk.rapportages.occupancy.agenda'), ...days.map((d) => stamp(d))],
              ...SPECIALISTS.map((s) => [s.name, ...grid[s.id].map((c) => (c.value === null ? '' : `${Math.round(c.value * 100)}%`))]),
            ]}
          />
        }
      >
        <div className="pk-rp-toolbar">
          <div className="pk-rp-weeknav">
            <button className="icon-button small" aria-label={t('pk.rapportages.occupancy.prev')} onClick={() => setWeek((w) => addDays(w, -7))}>
              <PkIcon name="chevronStart" size={18} />
            </button>
            <strong>
              {t('pk.rapportages.weekOf', {
                n: isoWeek(week),
                from: dayMonth(week, now),
                to: dayMonth(addDays(week, 5), now),
              })}
            </strong>
            <button className="icon-button small" aria-label={t('pk.rapportages.occupancy.next')} onClick={() => setWeek((w) => addDays(w, 7))}>
              <PkIcon name="chevronEnd" size={18} />
            </button>
          </div>
          <Seg label={t('pk.common.location')} value={where} onChange={setWhere} options={LOCATIONS.map((l) => ({ value: l.id, label: l.city }))} />
        </div>
        <TableWrap label={t('pk.rapportages.occupancy.title')}>
          <table className="pk-table pk-rp-heat">
            <thead>
              <tr>
                <th>{t('pk.rapportages.occupancy.agenda')}</th>
                {days.map((d) => (
                  <th key={d.getTime()} className="end">
                    {weekdayShort(d)} {d.getDate()}
                  </th>
                ))}
                <th className="end">{t('pk.rapportages.occupancy.average')}</th>
              </tr>
            </thead>
            <tbody>
              {team.map((s) => {
                const cells = grid[s.id];
                const avg = average(cells.map((c) => c.value));
                return (
                  <tr key={s.id}>
                    <td>
                      <span className="pk-rp-person">
                        <Avatar staff={staffById(s.id)} size={26} />
                        <strong>{s.name}</strong>
                      </span>
                    </td>
                    {cells.map((c) => (
                      <td
                        key={c.day.getTime()}
                        className="end"
                        title={c.value === null ? t('pk.rapportages.occupancy.off') : t('pk.rapportages.occupancy.cell', { minutes: c.minutes, open: c.open })}
                      >
                        {c.value === null ? (
                          <span className="pk-muted">–</span>
                        ) : (
                          <span className="pk-rp-cell" style={{ '--v': c.value } as CSSProperties}>
                            {pct(c.value)}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="end">
                      <b>{avg === null ? '–' : pct(avg)}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('pk.rapportages.occupancy.location', { city: LOCATIONS.find((l) => l.id === where)?.city ?? '' })}</td>
                {days.map((d, i) => {
                  const avg = average(team.map((s) => grid[s.id][i].value));
                  return (
                    <td key={d.getTime()} className="end">
                      {avg === null ? '–' : pct(avg)}
                    </td>
                  );
                })}
                <td className="end">{(() => {
                  const avg = average(team.flatMap((s) => grid[s.id].map((c) => c.value)));
                  return avg === null ? '–' : pct(avg);
                })()}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrap>
      </Card>
    </div>
  );
}
