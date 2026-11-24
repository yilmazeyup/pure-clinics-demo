import type { SpecialistId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { AGENDAS, cityOf, type StaffId } from '../../data/core';
import { MODULES, PROFILE_IDS, RIGHTS, type ProfileId, type Right } from '../../data/team';
import { Card, Chip, Field, TableWrap } from '../../kit';
import { PkIcon } from '../../icons';
import { MemberPhoto, useAgendaAccess, useMembers, useProfiles } from './shared';

/** Permission profiles and who may open which agenda. */
export function RightsTab() {
  return (
    <div className="pk-grid">
      <Profiles />
      <AgendaAccess />
    </div>
  );
}

/** Who is logged in, to show that a profile above one's own level can be read but not changed. */
const VIEWERS: { id: StaffId; profile: ProfileId }[] = [
  { id: 'margot', profile: 'admin' },
  { id: 'loubna', profile: 'therapist' },
  { id: 'husna', profile: 'reception' },
];

function Profiles() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [profiles, setProfiles] = useProfiles();
  const [members] = useMembers();
  const [current, setCurrent] = useState<ProfileId>('therapist');
  const [viewer, setViewer] = useState<StaffId>('margot');
  const profile = profiles.find((p) => p.id === current)!;
  const myLevel = profiles.find((p) => p.id === VIEWERS.find((v) => v.id === viewer)!.profile)!.level;
  const locked = profile.level < myLevel;
  const holders = members.filter((m) => m.profile === current && m.active).map((m) => m.name);

  const setRight = (module: (typeof MODULES)[number], right: Right, on: boolean) =>
    setProfiles((list) =>
      list.map((p) => {
        if (p.id !== current) return p;
        const now = { ...p.rights[module], [right]: on };
        // Adding or editing needs seeing; without seeing, nothing else.
        if (on && right !== 'view') now.view = true;
        if (!on && right === 'view') {
          now.add = false;
          now.edit = false;
        }
        return { ...p, rights: { ...p.rights, [module]: now } };
      }),
    );
  const setAll = (on: boolean) =>
    setProfiles((list) =>
      list.map((p) =>
        p.id === current
          ? { ...p, rights: Object.fromEntries(MODULES.map((m) => [m, { view: on, add: on, edit: on }])) as typeof p.rights }
          : p,
      ),
    );
  const setLevel = (level: number) => setProfiles((list) => list.map((p) => (p.id === current ? { ...p, level } : p)));

  return (
    <Card className="span-7" feature="s.profiles" eyebrow={t('pk.team.profEyebrow')} title={t('pk.team.profTitle')} help={t('pk.team.profHelp')}>
      <div className="pk-row pk-tm-prof-top">
        <Field label={t('pk.team.loggedAs')}>
          <select className="pk-input" value={viewer} onChange={(e) => setViewer(e.target.value as StaffId)}>
            {VIEWERS.map((v) => {
              const p = profiles.find((x) => x.id === v.profile)!;
              const name = members.find((m) => m.id === v.id)?.name ?? v.id;
              return (
                <option key={v.id} value={v.id}>
                  {t('pk.team.loggedAsOption', { name, profile: t(`pk.team.profile.${p.id}`), n: p.level })}
                </option>
              );
            })}
          </select>
        </Field>
      </div>
      <div className="pk-tm-prof">
        <ul className="pk-tm-prof-list" role="listbox" aria-label={t('pk.team.profEyebrow')}>
          {PROFILE_IDS.map((id) => {
            const p = profiles.find((x) => x.id === id)!;
            const count = members.filter((m) => m.profile === id && m.active).length + (id === 'bookkeeper' ? 1 : 0);
            return (
              <li key={id}>
                <button type="button" role="option" aria-selected={id === current} onClick={() => setCurrent(id)}>
                  <span>
                    <strong>{t(`pk.team.profile.${id}`)}</strong>
                    <small>{t('pk.team.users', { n: count })}</small>
                  </span>
                  <span className="pk-tm-level">{p.level}</span>
                  {p.level < myLevel ? <PkIcon name="lock" size={14} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="pk-stack pk-tm-prof-main">
          <div className="pk-row pk-row--between">
            <label className="pk-row pk-small">
              <span className="pk-muted">{t('pk.team.levelLabel')}</span>
              <select className="pk-input pk-tm-select" value={profile.level} disabled={locked} onChange={(e) => setLevel(Number(e.target.value))}>
                {Array.from({ length: 10 }, (_, n) => n)
                  .filter((n) => n >= myLevel)
                  .concat(profile.level < myLevel ? [profile.level] : [])
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <span className="pk-row">
              <button className="btn btn-ghost btn-small" disabled={locked} onClick={() => setAll(true)}>
                <PkIcon name="check" size={14} />
                {t('pk.team.selectAll')}
              </button>
              <button className="btn btn-ghost btn-small" disabled={locked} onClick={() => setAll(false)}>
                {t('pk.team.clearAll')}
              </button>
            </span>
          </div>
          {locked ? (
            <p className="pk-tm-locked">
              <PkIcon name="lock" size={15} />
              {t('pk.team.locked')}
            </p>
          ) : null}
          <TableWrap label={t('pk.team.profEyebrow')}>
            <table className="pk-table pk-tm-matrix pk-sticky-start">
              <thead>
                <tr>
                  <th>{t('pk.team.module')}</th>
                  {RIGHTS.map((r) => (
                    <th key={r} className="pk-tm-center">
                      {t(`pk.team.right.${r}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((m) => (
                  <tr key={m}>
                    <td>{t(`pk.screen.${m}`)}</td>
                    {RIGHTS.map((r) => (
                      <td key={r} className="pk-tm-center">
                        <input
                          type="checkbox"
                          className="pk-tm-box"
                          checked={profile.rights[m][r]}
                          disabled={locked}
                          aria-label={`${t(`pk.screen.${m}`)} · ${t(`pk.team.right.${r}`)}`}
                          onChange={(e) => setRight(m, r, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="pk-small pk-muted">
            {holders.length ? t('pk.team.appliesTo', { names: holders.join(', ') }) : t('pk.team.appliesNobody')}
          </p>
          <div className="pk-row">
            <button className="btn btn-primary btn-small" disabled={locked} onClick={() => demo(t('pk.team.profSaved', { profile: t(`pk.team.profile.${current}`) }))}>
              {t('pk.common.save')}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AgendaAccess() {
  const { t } = useI18n();
  const [access, setAccess] = useAgendaAccess();
  const [members] = useMembers();
  const team = members.filter((m) => m.staffId);
  const flip = (staff: StaffId, agenda: SpecialistId, on: boolean) =>
    setAccess((a) => ({ ...a, [staff]: on ? [...a[staff], agenda] : a[staff].filter((x) => x !== agenda) }));
  return (
    <Card className="span-5" feature="s.agendaAccess" eyebrow={t('pk.team.accEyebrow')} title={t('pk.team.accTitle')} help={t('pk.team.accHelp')}>
      <TableWrap label={t('pk.team.accEyebrow')}>
        <table className="pk-table pk-tm-matrix pk-tm-access pk-sticky-start">
          <thead>
            <tr>
              <th>{t('pk.team.col.name')}</th>
              {AGENDAS.map((a) => (
                <th key={a.id} className="pk-tm-center">
                  <span className="pk-tm-agenda-head">
                    {a.staff.name}
                    <small>{a.beauty ? 'Blanche' : cityOf(a.locationId)}</small>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.map((m) => {
              const id = m.staffId!;
              const mine = access[id] ?? [];
              return (
                <tr key={m.id}>
                  <td>
                    <span className="pk-tm-who">
                      <MemberPhoto member={m} size={24} />
                      {m.name}
                    </span>
                  </td>
                  {AGENDAS.map((a) => (
                    <td key={a.id} className="pk-tm-center">
                      <input
                        type="checkbox"
                        className="pk-tm-box"
                        checked={mine.includes(a.id)}
                        aria-label={`${m.name} · ${a.staff.name}`}
                        onChange={(e) => flip(id, a.id, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      <div className="pk-row pk-tm-legend">
        <Chip tone="outline" icon="lock">
          {t('pk.team.accBusy')}
        </Chip>
      </div>
    </Card>
  );
}
