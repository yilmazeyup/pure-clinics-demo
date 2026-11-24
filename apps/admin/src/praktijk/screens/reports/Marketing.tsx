import { LOCATIONS, type LocationId } from '@pure-clinics/shared';
import { useMemo, useState } from 'react';

import { useI18n, type MessageKey } from '../../../i18n';
import { usePraktijk } from '../../context';
import {
  ageOn,
  CAME_VIA,
  clientFor,
  CONDITIONS,
  dmy,
  insurerById,
  practiceClients,
  type CameVia,
  type ConditionId,
  type PracticeClient,
} from '../../data/core';
import { clampAge, periodRange, realisedSample, stamp, topClients, type Period } from '../../data/reports';
import { PkIcon } from '../../icons';
import { Card, Check, Field, TableWrap, downloadCsv, isolate } from '../../kit';
import { BarList, LOCATION_COLOR } from './charts';
import { ExportButton } from './ExportButton';

type Tri = 'any' | 'yes' | 'no';
type ColumnId = 'name' | 'birth' | 'age' | 'email' | 'phone' | 'city' | 'location' | 'insurer' | 'via' | 'member' | 'newsletter' | 'conditions';

const COLUMNS: ColumnId[] = ['name', 'birth', 'age', 'email', 'phone', 'city', 'location', 'insurer', 'via', 'member', 'newsletter', 'conditions'];
const DEFAULT_COLUMNS: ColumnId[] = ['name', 'age', 'email', 'location', 'via', 'newsletter'];

type Filters = { location: 'all' | LocationId; condition: 'all' | ConditionId; via: 'all' | CameVia; member: Tri; newsletter: Tri; ageFrom: number; ageTo: number };
const NO_FILTERS: Filters = { location: 'all', condition: 'all', via: 'all', member: 'any', newsletter: 'any', ageFrom: 16, ageTo: 90 };

/** Marketing: the most loyal clients, where clients come from, and a list builder that exports to Excel. */
export function Marketing({ period }: { period: Period }) {
  const { t, eur, dayMonth, num } = useI18n();
  const { today, now, go, demo } = usePraktijk();
  const range = useMemo(() => periodRange(period, today), [period, today]);
  const sample = useMemo(() => realisedSample(range.start, range.end, today), [range, today]);
  const top = useMemo(() => topClients(sample.list), [sample]);
  const clients = useMemo(() => practiceClients(today), [today]);

  // New in the period: first visits in the diary, by where those clients came from (scaled up for long periods).
  const sources = useMemo(() => {
    const fresh = new Map<CameVia, number>();
    for (const a of sample.list) {
      if (!a.firstVisit) continue;
      const via = clientFor(a.client, a.clinic, today).cameVia;
      fresh.set(via, (fresh.get(via) ?? 0) + 1);
    }
    return CAME_VIA.map((via) => ({
      via,
      count: clients.filter((c) => c.cameVia === via).length,
      fresh: Math.round((fresh.get(via) ?? 0) * sample.scale),
    })).sort((a, b) => b.count - a.count);
  }, [clients, sample, today]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [columns, setColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const matches = useMemo(() => {
    const tri = (value: boolean, want: Tri) => want === 'any' || value === (want === 'yes');
    return clients.filter((c) => {
      const age = ageOn(c.birth, today);
      return (
        (filters.location === 'all' || c.locationId === filters.location) &&
        (filters.condition === 'all' || c.episodes.some((e) => e.condition === filters.condition)) &&
        (filters.via === 'all' || c.cameVia === filters.via) &&
        tri(c.member, filters.member) &&
        tri(c.flags.newsletter, filters.newsletter) &&
        age >= Math.min(filters.ageFrom, filters.ageTo) &&
        age <= Math.max(filters.ageFrom, filters.ageTo)
      );
    });
  }, [clients, filters, today]);

  const city = (id: LocationId) => LOCATIONS.find((l) => l.id === id)?.city ?? '';
  const yesNo = (v: boolean) => t(v ? 'pk.common.yes' : 'pk.common.no');
  const cell = (c: PracticeClient, col: ColumnId): string | number => {
    switch (col) {
      case 'name':
        return `${c.first} ${c.last}`;
      case 'birth':
        return dmy(c.birth);
      case 'age':
        return ageOn(c.birth, today);
      case 'email':
        return c.email;
      case 'phone':
        return c.phone;
      case 'city':
        return c.city;
      case 'location':
        return city(c.locationId);
      case 'insurer':
        return insurerById(c.insurer).name;
      case 'via':
        return t(`pk.via.${c.cameVia}`);
      case 'member':
        return yesNo(c.member);
      case 'newsletter':
        return yesNo(c.flags.newsletter);
      case 'conditions':
        return c.episodes.map((e) => t(CONDITIONS.find((x) => x.id === e.condition)!.label)).join(', ');
    }
  };
  const header = (col: ColumnId) => t(`pk.rapportages.col.${col}` as MessageKey);
  const shown = matches.slice(0, 12);

  const exportList = () => {
    const file = `pure-clientenlijst-${stamp(today)}.csv`;
    downloadCsv(file, [columns.map(header), ...matches.map((c) => columns.map((col) => cell(c, col)))]);
    demo(t('pk.rapportages.exported', { file }));
  };

  const tri = (label: string, value: Tri, onChange: (v: Tri) => void) => (
    <Field label={label}>
      <select className="pk-input" value={value} onChange={(e) => onChange(e.target.value as Tri)}>
        <option value="any">{t('pk.rapportages.builder.any')}</option>
        <option value="yes">{t('pk.common.yes')}</option>
        <option value="no">{t('pk.common.no')}</option>
      </select>
    </Field>
  );

  return (
    <div className="pk-grid">
      <Card
        className="span-7"
        feature="p.top10"
        eyebrow={t('pk.rapportages.top.eyebrow')}
        title={t('pk.rapportages.top.title')}
        help={t('pk.rapportages.top.help')}
        actions={
          <ExportButton
            file={`pure-top-tien-${stamp(today)}.csv`}
            rows={() => [
              ['#', t('pk.common.client'), t('pk.common.location'), t('pk.rapportages.top.visits'), t('pk.common.amount')],
              ...top.map((r, i) => [i + 1, r.client, city(r.clinic), r.visits, r.revenue]),
            ]}
          />
        }
      >
        <TableWrap label={t('pk.rapportages.top.title')}>
          <table className="pk-table pk-cards pk-rp-top">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('pk.common.client')}</th>
                <th>{t('pk.common.location')}</th>
                <th className="end">{t('pk.rapportages.top.visits')}</th>
                <th>{t('pk.rapportages.top.last')}</th>
                <th className="end">{t('pk.common.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={r.client}>
                  <td className="pk-rp-rank pk-cell-check">{i + 1}</td>
                  <td className="pk-cell-main">
                    <button className="pk-rp-link" onClick={() => go('dossier', { clientId: clientFor(r.client, r.clinic, today).id })}>
                      {isolate(r.client)}
                    </button>
                  </td>
                  <td className="pk-cell-inline">{city(r.clinic)}</td>
                  <td className="end pk-cell-half" data-label={t('pk.rapportages.top.visits')}>
                    {r.visits}
                  </td>
                  <td className="nowrap pk-cell-half" data-label={t('pk.rapportages.top.last')}>
                    {dayMonth(r.last, now)}
                  </td>
                  <td className="end nowrap pk-cell-side">
                    <b>{eur(r.revenue)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <Card className="span-5" eyebrow={t('pk.rapportages.sources.eyebrow')} title={t('pk.rapportages.sources.title')} help={t('pk.rapportages.sources.help')}>
        <BarList
          rows={sources.map((s) => ({
            key: s.via,
            label: t(`pk.via.${s.via}`),
            value: s.count,
            display: num(s.count),
            sub: t('pk.rapportages.sources.new', { n: s.fresh }),
            color: LOCATION_COLOR.nijmegen,
          }))}
        />
      </Card>

      <Card
        feature="p.builder"
        eyebrow={t('pk.rapportages.builder.eyebrow')}
        title={t('pk.rapportages.builder.title')}
        help={t('pk.rapportages.builder.help')}
        actions={
          <button className="btn btn-primary btn-small" onClick={exportList} disabled={!matches.length || !columns.length}>
            <PkIcon name="download" size={14} />
            {t('pk.rapportages.builder.export')}
          </button>
        }
      >
        <div className="pk-rp-builder">
          <fieldset className="pk-rp-fieldset">
            <legend className="eyebrow">{t('pk.rapportages.builder.filters')}</legend>
            <div className="pk-form">
              <Field label={t('pk.common.location')}>
                <select className="pk-input" value={filters.location} onChange={(e) => set({ location: e.target.value as Filters['location'] })}>
                  <option value="all">{t('pk.common.allLocations')}</option>
                  {LOCATIONS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.city}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('pk.common.condition')}>
                <select className="pk-input" value={filters.condition} onChange={(e) => set({ condition: e.target.value as Filters['condition'] })}>
                  <option value="all">{t('pk.common.all')}</option>
                  {CONDITIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t(c.label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('pk.rapportages.col.via')}>
                <select className="pk-input" value={filters.via} onChange={(e) => set({ via: e.target.value as Filters['via'] })}>
                  <option value="all">{t('pk.common.all')}</option>
                  {CAME_VIA.map((v) => (
                    <option key={v} value={v}>
                      {t(`pk.via.${v}`)}
                    </option>
                  ))}
                </select>
              </Field>
              {tri(t('pk.rapportages.builder.member'), filters.member, (member) => set({ member }))}
              {tri(t('pk.rapportages.builder.newsletter'), filters.newsletter, (newsletter) => set({ newsletter }))}
              <div className="pk-rp-ages">
                <Field label={t('pk.rapportages.builder.ageFrom')}>
                  <input type="number" className="pk-input" min={16} max={90} value={filters.ageFrom} onChange={(e) => set({ ageFrom: clampAge(Number(e.target.value)) })} />
                </Field>
                <Field label={t('pk.rapportages.builder.ageTo')}>
                  <input type="number" className="pk-input" min={16} max={90} value={filters.ageTo} onChange={(e) => set({ ageTo: clampAge(Number(e.target.value)) })} />
                </Field>
              </div>
            </div>
            <button className="btn btn-ghost btn-small pk-rp-reset" onClick={() => setFilters(NO_FILTERS)}>
              <PkIcon name="refresh" size={14} />
              {t('pk.rapportages.builder.reset')}
            </button>
          </fieldset>
          <fieldset className="pk-rp-fieldset">
            <legend className="eyebrow">{t('pk.rapportages.builder.columns')}</legend>
            <div className="pk-rp-columns">
              {COLUMNS.map((col) => (
                <Check
                  key={col}
                  label={header(col)}
                  checked={columns.includes(col)}
                  onChange={(on) => setColumns((list) => (on ? COLUMNS.filter((c) => c === col || list.includes(c)) : list.filter((c) => c !== col)))}
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div className="pk-row pk-row--between pk-rp-count">
          <strong>{t('pk.rapportages.builder.count', { n: num(matches.length) })}</strong>
          {matches.length > shown.length ? <small className="pk-muted">{t('pk.rapportages.builder.preview', { n: shown.length })}</small> : null}
        </div>
        {matches.length && columns.length ? (
          <TableWrap label={t('pk.rapportages.builder.title')}>
            <table className="pk-table pk-sticky-start">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col}>{header(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id}>
                    {columns.map((col) => (
                      <td key={col} className={col === 'email' || col === 'phone' ? 'pk-mono' : col === 'conditions' ? '' : 'nowrap'}>
                        {cell(c, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="pk-empty">{t('pk.rapportages.builder.empty')}</p>
        )}
      </Card>
    </div>
  );
}
