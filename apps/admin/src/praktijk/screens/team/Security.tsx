import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { qrPattern, type Attempt } from '../../data/team';
import { Card, Chip, Field, Modal, TableWrap, Toggle, isolate } from '../../kit';
import { PkIcon } from '../../icons';
import { MemberPhoto, useAttempts, useMembers, useMinutesAgo } from './shared';

/** Two-step login and the lockout after too many wrong passwords. */
export function SecurityTab() {
  return (
    <div className="pk-grid">
      <TwoFactor />
      <Lockout />
    </div>
  );
}

function TwoFactor() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [members, setMembers] = useMembers();
  const [required, setRequired] = useState(false);
  const [setup, setSetup] = useState<string | null>(null);
  const active = members.filter((m) => m.active);
  const missing = active.filter((m) => !m.twofa);

  return (
    <Card className="span-5" feature="s.twofa" eyebrow={t('pk.team.tfEyebrow')} title={t('pk.team.tfTitle')} help={t('pk.team.tfHelp')}>
      <Toggle checked={required} onChange={setRequired} label={t('pk.team.tfRequired')} hint={t('pk.team.tfRequiredHint')} />
      {required && missing.length ? (
        <p className="pk-tm-locked">
          <PkIcon name="warning" size={15} />
          {t('pk.team.tfMissing', { n: missing.length })}
        </p>
      ) : null}
      <ul className="pk-list pk-tm-tf">
        {active.map((m) => (
          <li key={m.id}>
            <span className="pk-tm-who">
              <MemberPhoto member={m} size={28} />
              <strong>{m.name}</strong>
            </span>
            {m.twofa ? (
              <Chip tone="good" icon="shieldCheck">
                {t('pk.common.on')}
              </Chip>
            ) : (
              <button className="btn btn-ghost btn-small" onClick={() => setSetup(m.id)}>
                <PkIcon name="phone" size={14} />
                {t('pk.team.tfSetup')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {!missing.length ? <p className="pk-small pk-muted">{t('pk.team.tfAll')}</p> : null}
      <SetupDialog
        memberId={setup}
        onClose={() => setSetup(null)}
        onDone={(id) => {
          const name = members.find((m) => m.id === id)?.name ?? '';
          setMembers((list) => list.map((m) => (m.id === id ? { ...m, twofa: true } : m)));
          setSetup(null);
          demo(t('pk.team.tfDone', { name }));
        }}
      />
    </Card>
  );
}

function SetupDialog({ memberId, onClose, onDone }: { memberId: string | null; onClose: () => void; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [members] = useMembers();
  const [code, setCode] = useState('');
  const member = members.find((m) => m.id === memberId);
  const grid = useMemo(() => qrPattern(memberId ?? 'none'), [memberId]);
  // A base32-looking secret, made from the same seed as the pattern.
  const secret = useMemo(
    () =>
      grid
        .slice(0, 16)
        .map((row, i) => 'ABCDEFGHJKLMNPQRSTUVWXYZ234567'[(row.filter(Boolean).length * 7 + i * 3) % 30])
        .join('')
        .replace(/(.{4})/g, '$1 ')
        .trim(),
    [grid],
  );
  const ok = /^\d{6}$/.test(code);
  const close = () => {
    setCode('');
    onClose();
  };
  return (
    <Modal
      open={Boolean(member)}
      title={t('pk.team.tfModalTitle')}
      onClose={close}
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            {t('pk.common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              setCode('');
              if (member) onDone(member.id);
            }}
          >
            {t('pk.common.confirm')}
          </button>
        </>
      }
    >
      {member ? (
        <div className="pk-tm-qr-wrap">
          <svg className="pk-tm-qr" viewBox={`-2 -2 ${grid.length + 4} ${grid.length + 4}`} role="img" aria-label={t('pk.team.tfDemo')}>
            <rect x={-2} y={-2} width={grid.length + 4} height={grid.length + 4} fill="#ffffff" />
            {grid.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} /> : null)))}
          </svg>
          <div className="pk-stack">
            <span className="pk-tm-who">
              <MemberPhoto member={member} size={30} />
              <strong>{member.name}</strong>
            </span>
            <ol className="pk-tm-steps">
              <li>{t('pk.team.tfStep1')}</li>
              <li>{t('pk.team.tfStep2')}</li>
            </ol>
            <p className="pk-small pk-muted">
              {t('pk.team.tfKey')} <span className="pk-mono">{secret}</span>
            </p>
            <Field label={t('pk.team.tfCode')} hint={t('pk.team.tfDemo')}>
              <input
                className="pk-input pk-mono pk-tm-code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Lockout() {
  const i18n = useI18n();
  const { t, ago } = i18n;
  const { demo, now } = usePraktijk();
  const at = useMinutesAgo();
  const [attempts, setAttempts] = useAttempts();
  const [limit, setLimit] = useState(5);
  const [minutes, setMinutes] = useState(30);
  // An account is locked when its latest attempt is a lock.
  const latest = new Map<string, Attempt>();
  for (const a of [...attempts].sort((x, y) => x.minutesAgo - y.minutesAgo)) if (!latest.has(a.email)) latest.set(a.email, a);
  const locked = [...latest.values()].filter((a) => a.result === 'locked');
  const tone: Record<Attempt['result'], 'good' | 'bad' | 'warn'> = { ok: 'good', failed: 'warn', locked: 'bad' };

  const unlock = (email: string) => {
    setAttempts((list) => [{ id: `unlock-${Date.now()}`, minutesAgo: 0, email, result: 'ok', ip: '192.0.2.31', device: 'desktop' }, ...list]);
    demo(t('pk.team.unlocked', { email: isolate(email) }));
  };

  return (
    <Card className="span-7" feature="s.lockout" eyebrow={t('pk.team.lockEyebrow')} title={t('pk.team.lockTitle')} help={t('pk.team.lockHelp')}>
      <div className="pk-form pk-tm-lock-form">
        <Field label={t('pk.team.lockAttempts')}>
          <select className="pk-input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.team.lockMinutes')}>
          <select className="pk-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {t('pk.team.lockMinutesOption', { n })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="pk-tm-rule">
        <PkIcon name="lock" size={15} />
        {t('pk.team.lockRule', { n: limit, m: minutes })}
      </p>

      <h3 className="pk-subtitle">{t('pk.team.lockedNow')}</h3>
      {locked.length ? (
        <ul className="pk-list">
          {locked.map((a) => (
            <li key={a.email} className="pk-row--between">
              <span className="pk-stack pk-tm-cal-name">
                <span className="pk-mono">{a.email}</span>
                <small className="pk-muted">{t('pk.team.lockedSince', { time: i18n.clock(at(a.minutesAgo)) })}</small>
              </span>
              <button className="btn btn-primary btn-small" onClick={() => unlock(a.email)}>
                <PkIcon name="key" size={14} />
                {t('pk.team.unlock')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pk-small pk-muted">{t('pk.team.noneLocked')}</p>
      )}

      <h3 className="pk-subtitle pk-tm-gap">{t('pk.team.attempts')}</h3>
      <TableWrap label={t('pk.team.attempts')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.team.col.when')}</th>
              <th>{t('pk.team.col.account')}</th>
              <th>{t('pk.team.col.result')}</th>
              <th>{t('pk.team.col.device')}</th>
              <th>{t('pk.team.col.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">
                  {i18n.clock(at(a.minutesAgo))} <small className="pk-muted">· {ago(at(a.minutesAgo), now)}</small>
                </td>
                <td className="pk-mono">{a.email}</td>
                <td>
                  <Chip tone={tone[a.result]}>{t(`pk.team.result.${a.result}`)}</Chip>
                </td>
                <td className="nowrap">{t(`pk.team.device.${a.device}`)}</td>
                <td className="pk-mono">{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
