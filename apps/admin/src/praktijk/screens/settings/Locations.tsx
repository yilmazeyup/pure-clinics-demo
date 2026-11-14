import { LOCATIONS, type LocationId } from '@pure-clinics/shared';

import { useI18n } from '../../../i18n';
import { useShared, usePraktijk } from '../../context';
import { AGENDAS, LOCATION_AGB } from '../../data/core';
import { Card, Chip, Stat } from '../../kit';
import { PkIcon } from '../../icons';
import { hourText, weekdayDate } from '../team/shared';

/** Agendas in the subscription; more can be added per month. */
const INCLUDED = 5;

type AgendaRow = { id: string; locationId: LocationId; name: string; staff: string | null; beauty: boolean; active: boolean };

const seedAgendas = (): AgendaRow[] =>
  AGENDAS.map((a) => ({ id: a.id, locationId: a.locationId, name: a.staff.name, staff: a.staff.name, beauty: a.beauty, active: true }));

/** Monday first, Sunday last, the way opening hours are read. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Locations with their own AGB code, opening hours and agendas; stock and cash are kept per location. */
export function LocationsTab() {
  const i18n = useI18n();
  const { t } = i18n;
  const { go, demo } = usePraktijk();
  const [agendas, setAgendas] = useShared('settings.agendas', seedAgendas);
  const active = agendas.filter((a) => a.active).length;

  const add = (locationId: LocationId) => {
    const n = agendas.filter((a) => a.locationId === locationId).length + 1;
    setAgendas((list) => [...list, { id: `new-${Date.now()}`, locationId, name: t('pk.instellingen.loc.newAgenda', { n }), staff: null, beauty: false, active: true }]);
    demo(t('pk.instellingen.loc.added'));
  };

  return (
    <div className="pk-grid">
      <div className="pk-stats" data-feature="t.five">
        <Stat label={t('pk.instellingen.loc.locations')} value={LOCATIONS.length} sub={LOCATIONS.map((l) => l.city).join(' · ')} />
        <Stat label={t('pk.instellingen.loc.inUse')} value={active} sub={t('pk.instellingen.loc.inUseSub')} />
        <Stat label={t('pk.instellingen.loc.included')} value={INCLUDED} sub={t('pk.instellingen.loc.includedSub')} />
        <Stat label={t('pk.instellingen.loc.extra')} value={Math.max(0, active - INCLUDED)} sub={t('pk.instellingen.loc.extraSub')} />
      </div>

      <div className="pk-grid pk-se-locations" data-feature="t.locations">
        {LOCATIONS.map((l) => {
          const list = agendas.filter((a) => a.locationId === l.id);
          return (
            <Card
              key={l.id}
              className="span-6"
              eyebrow={t('pk.instellingen.loc.eyebrow')}
              title={l.city}
              actions={<Chip tone="brand">AGB {LOCATION_AGB[l.id]}</Chip>}
            >
              <div className="pk-se-loc">
                <div className="pk-stack">
                  <span className="pk-se-line">
                    <PkIcon name="pin" size={15} />
                    {l.address}
                  </span>
                  <span className="pk-se-line">
                    <PkIcon name="phone" size={15} />
                    <span className="pk-mono">{l.phone}</span>
                  </span>
                  <h3 className="pk-subtitle pk-se-gap">{t('pk.instellingen.loc.hours')}</h3>
                  <dl className="pk-se-hours">
                    {WEEK.map((d) => {
                      const h = l.hours[d];
                      return (
                        <div key={d} className={h ? '' : 'closed'}>
                          <dt>{i18n.weekdayLong(weekdayDate(d))}</dt>
                          <dd className="pk-num">{h ? `${hourText(h.open)}–${hourText(h.close)}` : t('pk.instellingen.loc.closed')}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
                <div className="pk-stack">
                  <h3 className="pk-subtitle">{t('pk.instellingen.loc.agendas')}</h3>
                  <ul className="pk-list pk-se-agendas">
                    {list.map((a, i) => (
                      <li key={a.id}>
                        <span className="pk-se-room">{i + 1}</span>
                        <span className="pk-stack pk-se-agenda-name">
                          <strong>{a.beauty ? 'Blanche Beauty Studio' : t('pk.instellingen.loc.room', { n: i + 1 })}</strong>
                          <small className="pk-muted">{a.staff ?? a.name}</small>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={a.active}
                          aria-label={`${t('pk.common.active')} · ${a.staff ?? a.name}`}
                          className="pk-switch"
                          onClick={() => setAgendas((all) => all.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)))}
                        >
                          <i />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="btn btn-ghost btn-small pk-se-add" onClick={() => add(l.id)}>
                    <PkIcon name="plus" size={14} />
                    {t('pk.instellingen.loc.addAgenda')}
                  </button>
                </div>
              </div>
              <div className="pk-row pk-se-per" data-feature="t.perLocation">
                <span className="pk-small pk-muted">{t('pk.instellingen.loc.per')}</span>
                <button className="btn btn-ghost btn-small" onClick={() => go('voorraad', { feature: 'n.location' })}>
                  <PkIcon name="box" size={14} />
                  {t('pk.instellingen.loc.stock')}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => go('facturen', { feature: 'o.cash' })}>
                  <PkIcon name="cash" size={14} />
                  {t('pk.instellingen.loc.cash')}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
