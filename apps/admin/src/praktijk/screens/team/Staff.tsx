import { LOCATIONS, type LocationId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { cityOf, roleKey, type StaffRole } from '../../data/core';
import { BOOKKEEPER, codeFor, PROFILE_IDS, type Member, type ProfileId } from '../../data/team';
import { Card, Chip, Field, Kv, Modal, TableWrap, isolate } from '../../kit';
import { PkIcon } from '../../icons';
import { MemberPhoto, useChosen, useMembers, useProfiles, weekdayDate } from './shared';

const ROLES: StaffRole[] = ['therapist', 'beauty', 'reception'];

/** Employees, the chosen one's details, calendar sync and the bookkeeper's login. */
export function StaffTab({ onTab }: { onTab: (tab: 'rights' | 'schedules') => void }) {
  return (
    <div className="pk-grid">
      <Employees />
      <Chosen onTab={onTab} />
      <CalendarSync />
      <Bookkeeper />
    </div>
  );
}

function Employees() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [members, setMembers] = useMembers();
  const [profiles] = useProfiles();
  const [chosen, setChosen] = useChosen();
  const [adding, setAdding] = useState(false);

  const update = (id: string, change: Partial<Member>) => setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...change } : m)));
  const levelOf = (id: ProfileId) => profiles.find((p) => p.id === id)?.level ?? 0;

  return (
    <Card
      className="pk-tm-employees"
      feature="s.employees"
      eyebrow={t('pk.team.staffEyebrow')}
      title={t('pk.team.staffTitle')}
      help={t('pk.team.staffHelp')}
      actions={
        <button className="btn btn-primary btn-small" onClick={() => setAdding(true)}>
          <PkIcon name="plus" size={15} />
          {t('pk.team.new')}
        </button>
      }
    >
      <TableWrap label={t('pk.team.staffEyebrow')}>
        <table className="pk-table pk-cards pk-tm-staff">
          <thead>
            <tr>
              <th>{t('pk.team.col.code')}</th>
              <th>{t('pk.team.col.name')}</th>
              <th>{t('pk.team.col.role')}</th>
              <th>{t('pk.team.col.location')}</th>
              <th>{t('pk.team.col.agb')}</th>
              <th>{t('pk.team.col.email')}</th>
              <th>{t('pk.team.col.profile')}</th>
              <th>{t('pk.team.col.twofa')}</th>
              <th>{t('pk.team.col.active')}</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} aria-selected={chosen === m.id} className={m.active ? '' : 'pk-tm-off'} onClick={() => setChosen(m.id)}>
                <td className="pk-cell-check">
                  <span className="pk-tm-code">{m.code}</span>
                </td>
                <td className="pk-cell-main">
                  <span className="pk-tm-who">
                    <MemberPhoto member={m} size={30} />
                    <strong>{m.name}</strong>
                  </span>
                </td>
                <td className="nowrap pk-cell-inline">{t(roleKey(m.role))}</td>
                <td className="nowrap pk-cell-inline">{m.role === 'beauty' ? 'Blanche Beauty Studio' : cityOf(m.locationId)}</td>
                <td className="nowrap pk-cell-half" data-label={t('pk.team.col.agb')}>
                  <span className="pk-mono">{m.agb || '–'}</span>
                </td>
                <td data-label={t('pk.team.col.email')}>
                  <span className="pk-mono">{m.email}</span>
                </td>
                <td data-label={t('pk.team.col.profile')} onClick={(e) => e.stopPropagation()}>
                  <select
                    className="pk-input pk-tm-select"
                    value={m.profile}
                    aria-label={t('pk.team.col.profile')}
                    onChange={(e) => update(m.id, { profile: e.target.value as ProfileId })}
                  >
                    {PROFILE_IDS.filter((p) => p !== 'bookkeeper').map((p) => (
                      <option key={p} value={p}>
                        {t(`pk.team.profile.${p}`)} · {levelOf(p)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="pk-cell-half" data-label={t('pk.team.col.twofa')}>
                  {m.twofa ? <Chip tone="good" icon="shieldCheck">{t('pk.common.on')}</Chip> : <Chip tone="outline">{t('pk.common.off')}</Chip>}
                </td>
                <td className="pk-cell-side" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={m.active}
                    aria-label={`${t('pk.team.col.active')} · ${m.name}`}
                    className="pk-switch"
                    onClick={() => {
                      update(m.id, { active: !m.active });
                      demo(t(m.active ? 'pk.team.deactivated' : 'pk.team.activated', { name: m.name }));
                    }}
                  >
                    <i />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <NewMember
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(m) => {
          setMembers((list) => [...list, m]);
          setChosen(m.id);
          setAdding(false);
          demo(t('pk.team.added', { name: m.name }));
        }}
      />
    </Card>
  );
}

function NewMember({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (m: Member) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<StaffRole>('therapist');
  const [location, setLocation] = useState<LocationId>('nijmegen');
  const [agb, setAgb] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<ProfileId>('therapist');
  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email);

  const reset = () => {
    setName('');
    setCode('');
    setAgb('');
    setEmail('');
  };
  const add = () => {
    if (!valid) return;
    const id = `new-${Date.now()}`;
    onAdd({
      id,
      staffId: null,
      name: name.trim(),
      role,
      locationId: location,
      code: (code || codeFor(name)).toUpperCase().slice(0, 3),
      agb: agb.trim(),
      email: email.trim(),
      days: [2, 3, 4],
      photo: false,
      profile,
      twofa: false,
      active: true,
      google: false,
      outlook: false,
    });
    reset();
  };

  return (
    <Modal
      open={open}
      title={t('pk.team.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={add}>
            {t('pk.team.addAction')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.team.field.name')}>
          <input className="pk-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('pk.team.field.code')}>
          <input
            className="pk-input pk-mono"
            maxLength={3}
            value={code || (name ? codeFor(name) : '')}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Field label={t('pk.team.field.role')}>
          <select className="pk-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(roleKey(r))}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.team.field.location')}>
          <select className="pk-input" value={location} onChange={(e) => setLocation(e.target.value as LocationId)}>
            {LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.team.field.agb')} hint={t('pk.team.field.agbHint')}>
          <input className="pk-input pk-mono" placeholder="99-000000" value={agb} onChange={(e) => setAgb(e.target.value)} />
        </Field>
        <Field label={t('pk.team.field.email')}>
          <input className="pk-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('pk.team.field.profile')} wide>
          <select className="pk-input" value={profile} onChange={(e) => setProfile(e.target.value as ProfileId)}>
            {PROFILE_IDS.filter((p) => p !== 'bookkeeper').map((p) => (
              <option key={p} value={p}>
                {t(`pk.team.profile.${p}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="pk-small pk-muted pk-tm-note">{t('pk.team.unlimited')}</p>
    </Modal>
  );
}

function Chosen({ onTab }: { onTab: (tab: 'rights' | 'schedules') => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [members] = useMembers();
  const [profiles] = useProfiles();
  const [chosen] = useChosen();
  const m = members.find((x) => x.id === chosen) ?? members[0];
  const profile = profiles.find((p) => p.id === m.profile);
  return (
    <Card className="span-4 pk-tm-chosen" eyebrow={t('pk.team.chosenEyebrow')} title={m.name}>
      <div className="pk-tm-chosen-top">
        <MemberPhoto member={m} size={64} />
        <div className="pk-stack">
          <span className="pk-row">
            <span className="pk-tm-code">{m.code}</span>
            {m.active ? <Chip tone="good">{t('pk.common.active')}</Chip> : <Chip tone="outline">{t('pk.common.inactive')}</Chip>}
          </span>
          <span className="pk-muted pk-small">{t(roleKey(m.role))}</span>
        </div>
      </div>
      <Kv
        rows={[
          [t('pk.team.kv.location'), m.role === 'beauty' ? `Blanche Beauty Studio · ${cityOf(m.locationId)}` : cityOf(m.locationId)],
          [t('pk.team.kv.profile'), `${t(`pk.team.profile.${m.profile}`)} · ${t('pk.team.level', { n: profile?.level ?? 0 })}`],
          [t('pk.team.kv.agb'), <span className="pk-mono">{m.agb || '–'}</span>],
          [t('pk.team.kv.email'), <span className="pk-mono">{m.email}</span>],
          [t('pk.team.kv.days'), m.days.map((d) => i18n.weekdayShort(weekdayDate(d))).join(' · ')],
          [t('pk.team.kv.twofa'), m.twofa ? t('pk.common.on') : t('pk.common.off')],
        ]}
      />
      <div className="pk-row pk-tm-chosen-actions">
        <button className="btn btn-ghost btn-small" onClick={() => onTab('rights')}>
          <PkIcon name="key" size={15} />
          {t('pk.team.toRights')}
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => onTab('schedules')}>
          <PkIcon name="calendar" size={15} />
          {t('pk.team.toSchedule')}
        </button>
      </div>
    </Card>
  );
}

function CalendarSync() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [members, setMembers] = useMembers();
  const flip = (m: Member, which: 'google' | 'outlook') => {
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, [which]: !x[which] } : x)));
    if (!m[which]) demo(t('pk.team.cal.linked', { name: m.name, service: which === 'google' ? 'Google' : 'Outlook' }));
  };
  return (
    <Card className="span-4" feature="more.calendar" eyebrow={t('pk.team.calEyebrow')} title={t('pk.team.calTitle')} help={t('pk.team.calHelp')}>
      <ul className="pk-list pk-tm-cal">
        <li className="pk-tm-cal-head" aria-hidden="true">
          <span />
          <span>Google</span>
          <span>Outlook</span>
        </li>
        {members
          .filter((m) => m.active)
          .map((m) => (
            <li key={m.id}>
              <span className="pk-tm-who">
                <MemberPhoto member={m} size={26} />
                <span className="pk-stack pk-tm-cal-name">
                  <strong>{m.name}</strong>
                  <small className="pk-muted">{m.google || m.outlook ? t('pk.team.cal.synced') : t('pk.team.cal.off')}</small>
                </span>
              </span>
              {(['google', 'outlook'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="switch"
                  aria-checked={m[w]}
                  aria-label={`${w === 'google' ? 'Google' : 'Outlook'} · ${m.name}`}
                  className="pk-switch"
                  onClick={() => flip(m, w)}
                >
                  <i />
                </button>
              ))}
            </li>
          ))}
      </ul>
    </Card>
  );
}

type BookkeeperState = 'active' | 'invited' | 'revoked';

function Bookkeeper() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [profiles] = useProfiles();
  const [state, setState] = useState<BookkeeperState>('active');
  const rights = profiles.find((p) => p.id === 'bookkeeper')!.rights;
  const visible = (Object.keys(rights) as (keyof typeof rights)[]).filter((m) => rights[m].view);
  const tone = state === 'active' ? 'good' : state === 'invited' ? 'warn' : 'outline';
  return (
    <Card className="span-4" feature="o.bookkeeper" eyebrow={t('pk.team.bkEyebrow')} title={t('pk.team.bkTitle')} help={t('pk.team.bkHelp')}>
      <div className="pk-tm-chosen-top">
        <span className="pk-avatar pk-avatar--initial" style={{ width: 46, height: 46, fontSize: 20 }} aria-hidden="true">
          R
        </span>
        <div className="pk-stack pk-tm-bk">
          <strong>{BOOKKEEPER.name}</strong>
          <span className="pk-muted pk-small">{BOOKKEEPER.firm}</span>
          <span className="pk-mono pk-muted">{BOOKKEEPER.email}</span>
        </div>
      </div>
      <div className="pk-row pk-tm-bk-chips">
        <Chip tone={tone}>{t(`pk.team.bk.status.${state}`)}</Chip>
        <Chip tone="brand" icon="eye">
          {t('pk.team.profile.bookkeeper')} · {t('pk.team.bk.readonly')}
        </Chip>
      </div>
      <p className="pk-small pk-muted">{t('pk.team.bk.rights')}</p>
      <div className="pk-row pk-tm-bk-chips">
        {visible.map((m) => (
          <Chip key={m} tone="outline">
            {t(`pk.screen.${m}`)}
          </Chip>
        ))}
      </div>
      <div className="pk-row pk-tm-chosen-actions">
        {state === 'revoked' ? (
          <button
            className="btn btn-primary btn-small"
            onClick={() => {
              setState('invited');
              demo(t('pk.team.bk.invited', { email: isolate(BOOKKEEPER.email) }));
            }}
          >
            <PkIcon name="send" size={15} />
            {t('pk.team.bk.invite')}
          </button>
        ) : (
          <>
            <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.team.bk.invited', { email: isolate(BOOKKEEPER.email) }))}>
              <PkIcon name="send" size={15} />
              {t('pk.team.bk.resend')}
            </button>
            <button
              className="btn btn-ghost btn-small"
              onClick={() => {
                setState('revoked');
                demo(t('pk.team.bk.revoked', { name: BOOKKEEPER.name }));
              }}
            >
              <PkIcon name="lock" size={15} />
              {t('pk.team.bk.revoke')}
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
