import { useMemo, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { ageOn, cityOf, dmy, insurerById, type PracticeClient } from '../../data/core';
import { ALLERGIES, type AllergyId } from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Check, Chip, isolate, Modal } from '../../kit';
import { useDossier } from './useDossier';

/** The top of the file: who she is, her insurance, a switcher to another file, the planner, and allergy alerts. */
export function DossierHeader({ client, clients }: { client: PracticeClient; clients: PracticeClient[] }) {
  const i18n = useI18n();
  const { t, monthYear } = i18n;
  const { today, go, setClientId } = usePraktijk();
  const { state, update } = useDossier(client);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AllergyId[]>([]);
  const insurer = insurerById(client.insurer);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((c) => `${c.first} ${c.last}`.toLowerCase().includes(q) || dmy(c.birth).includes(q) || c.policy.toLowerCase().includes(q))
      .slice(0, 7);
  }, [clients, query]);

  const choose = (id: string) => {
    setClientId(id);
    setQuery('');
    setOpen(false);
  };

  const names = state.allergies.map((a) => t(`pk.dossier.allergy.${a}`)).join(', ');
  return (
    <section className="card pk-ds-head">
      <div className="pk-ds-head-top">
        <div className="pk-ds-who">
          <span className="pk-ds-initials" aria-hidden="true">
            {client.first[0]}
            {client.last.replace(/^(van |de |van der |van den )/i, '')[0]}
          </span>
          <div className="pk-ds-who-text">
            <span className="eyebrow">{t('pk.dossier.eyebrow')}</span>
            <h2 className="card-title">
              {client.first} {client.last}
              {client.member ? (
                <Chip tone="brand" icon="star">
                  {t('pk.dossier.member')}
                </Chip>
              ) : null}
            </h2>
            <p className="pk-ds-meta">
              <span>{t('pk.dossier.age', { n: ageOn(client.birth, today) })}</span>
              <span>{t('pk.dossier.born', { date: dmy(client.birth) })}</span>
              {client.bsn ? <span>{t('pk.dossier.bsn', { bsn: isolate(client.bsn) })}</span> : null}
              <span>
                {insurer.name} · {t('pk.dossier.policy', { policy: isolate(client.policy || '—') })}
              </span>
              <span>{cityOf(client.locationId)}</span>
              <span>{t('pk.dossier.since', { date: monthYear(client.since) })}</span>
            </p>
          </div>
        </div>

        <div className="pk-ds-head-actions">
          <div className="pk-ds-switch">
            <label className="pk-search">
              <PkIcon name="search" size={16} />
              <input
                className="pk-input"
                type="search"
                value={query}
                aria-label={t('pk.dossier.switch')}
                placeholder={t('pk.dossier.switchPlaceholder')}
                onFocus={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => setOpen(false), 150)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
              />
            </label>
            {open && query.trim() ? (
              <ul className="pk-ds-switch-list" role="listbox" aria-label={t('pk.dossier.switch')}>
                {matches.length ? (
                  matches.map((c) => (
                    <li key={c.id}>
                      <button role="option" aria-selected={c.id === client.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c.id)}>
                        <strong>
                          {c.first} {c.last}
                        </strong>
                        <span className="pk-muted pk-small">
                          {dmy(c.birth)} · {cityOf(c.locationId)}
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="pk-ds-switch-none">{t('pk.dossier.noMatch')}</li>
                )}
              </ul>
            ) : null}
          </div>
          <button className="btn btn-ghost btn-small" onClick={() => go('clienten', { clientId: client.id })}>
            <PkIcon name="user" size={15} />
            {t('pk.dossier.toClients')}
          </button>
          <button className="btn btn-primary btn-small" title={t('pk.dossier.plannerHint')} onClick={() => go('planner', { clientId: client.id })}>
            <PkIcon name="calendar" size={15} />
            {t('pk.dossier.planner')}
          </button>
        </div>
      </div>

      <div className={`pk-ds-alert ${state.allergies.length ? 'is-on' : ''}`} data-feature="f.allergy" role={state.allergies.length ? 'alert' : undefined}>
        <PkIcon name={state.allergies.length ? 'warning' : 'shieldCheck'} size={18} />
        <span>{state.allergies.length ? t('pk.dossier.allergyTitle', { list: names }) : t('pk.dossier.allergyNone')}</span>
        <button
          className="btn btn-ghost btn-small"
          onClick={() => {
            setDraft(state.allergies);
            setEditing(true);
          }}
        >
          <PkIcon name="edit" size={14} />
          {t('pk.dossier.allergyManage')}
        </button>
      </div>

      <Modal
        open={editing}
        title={t('pk.dossier.allergyManage')}
        onClose={() => setEditing(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>
              {t('pk.common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                update((s) => ({ ...s, allergies: draft }), { key: 'pk.dossier.log.allergy' });
                setEditing(false);
              }}
            >
              {t('pk.common.save')}
            </button>
          </>
        }
      >
        <p className="help">{t('pk.dossier.allergyHelp')}</p>
        <div className="pk-stack">
          {ALLERGIES.map((a) => (
            <Check
              key={a}
              checked={draft.includes(a)}
              onChange={(on) => setDraft((d) => (on ? [...d, a] : d.filter((x) => x !== a)))}
              label={t(`pk.dossier.allergy.${a}`)}
            />
          ))}
        </div>
      </Modal>
    </section>
  );
}
