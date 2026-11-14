import { addDays, SPECIALISTS, treatmentById, type LocationId, type SpecialistId } from '@pure-clinics/shared';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { CONDITIONS, conditionById, type ConditionId, type Episode, type PracticeClient } from '../../data/core';
import { blankEpisode, makeZt } from '../../data/dossier';
import { PkIcon } from '../../icons';
import { Check, Field, Modal } from '../../kit';
import { useDossier } from '../dossier/useDossier';

type Props = {
  open: boolean;
  clients: PracticeClient[];
  initial: PracticeClient | null;
  onClose: () => void;
  onDone: (client: PracticeClient, episodes: Episode[]) => void;
};

/**
 * Taking over a client from another practice: with her consent the file comes over, and care that began there gets an
 * episode with code 008 and the entitlement start date of the old practice, so the count of treatments carries on.
 */
export function TransferDialog({ open, clients, initial, onClose, onDone }: Props) {
  const { t } = useI18n();
  const [clientId, setClientId] = useState(initial?.id ?? clients[0]?.id ?? '');
  useEffect(() => {
    if (open) setClientId(initial?.id ?? clients[0]?.id ?? '');
  }, [open]);
  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  if (!open || !client) return null;
  return (
    <Modal open={open} wide title={t('pk.clienten.tr.title')} onClose={onClose}>
      <p className="help">{t('pk.clienten.tr.help')}</p>
      <Field label={t('pk.clienten.tr.client')}>
        <select className="pk-input" value={client.id} onChange={(e) => setClientId(e.target.value)}>
          {clients.slice(0, 300).map((c) => (
            <option key={c.id} value={c.id}>
              {c.last}, {c.first}
            </option>
          ))}
        </select>
      </Field>
      <TransferForm key={client.id} client={client} onDone={onDone} />
    </Modal>
  );
}

function TransferForm({ client, onDone }: { client: PracticeClient; onDone: Props['onDone'] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { today, demo } = usePraktijk();
  const { update } = useDossier(client);
  const [practice, setPractice] = useState('');
  const [agb, setAgb] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [condition, setCondition] = useState<ConditionId>('acne');
  const [since, setSince] = useState(() => toInput(addDays(today, -240)));
  const [done, setDone] = useState(6);
  const [file, setFile] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const sinceDate = new Date(`${since}T12:00`);

  const apply = () => {
    const c = conditionById(condition);
    const practitioner = specialistsForCondition(condition, client.locationId)[0];
    const episode: Episode = {
      id: `${client.id}-${condition}-transfer`,
      condition,
      treatment: c.treatments[0],
      practitioner,
      billing: c.insured ? 'insurer' : 'client',
      zt: makeZt(today),
      start: today,
      price: null,
      minutes: null,
      sessions: { done, total: Math.max(done + 1, 20) },
      step: 'intake',
      closed: false,
    };
    const full = { ...blankEpisode(episode), code008: { since: sinceDate, done, practice: practice.trim(), agb: agb.trim() } };
    update((s) => ({ ...s, episodes: [full, ...s.episodes], selected: full.id }), { key: 'pk.dossier.log.transfer', args: { practice: practice.trim() } });
    onDone(client, [episode, ...client.episodes]);
    demo(t('pk.clienten.tr.processed', { name: `${client.first} ${client.last}` }));
  };

  return (
    <div className="pk-stack pk-cl-transfer">
      <div className="pk-form">
        <Field label={t('pk.clienten.tr.practice')}>
          <input className="pk-input" value={practice} placeholder={t('pk.clienten.tr.practicePlaceholder')} onChange={(e) => setPractice(e.target.value)} />
        </Field>
        <Field label={t('pk.clienten.tr.agb')}>
          <input className="pk-input pk-mono" value={agb} placeholder="99-000000" onChange={(e) => setAgb(e.target.value)} />
        </Field>
        <Field label={t('pk.clienten.tr.condition')}>
          <select className="pk-input" value={condition} onChange={(e) => setCondition(e.target.value as ConditionId)}>
            {CONDITIONS.filter((c) => c.id !== 'beauty').map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.clienten.tr.since')}>
          <input className="pk-input" type="date" value={since} max={toInput(today)} onChange={(e) => setSince(e.target.value)} />
        </Field>
        <Field label={t('pk.clienten.tr.done')}>
          <input className="pk-input pk-num" type="number" min={0} max={40} value={done} onChange={(e) => setDone(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <div className="pk-field">
          <span className="pk-field-label">{t('pk.clienten.tr.file')}</span>
          <input ref={fileInput} type="file" accept=".pdf,.zip,.xml" hidden onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
          <button type="button" className="btn btn-ghost pk-cl-file" onClick={() => fileInput.current?.click()}>
            <PkIcon name="upload" size={15} />
            <span className="pk-cl-file-name">{file ?? t('pk.clienten.tr.choose')}</span>
          </button>
          <small className="pk-field-hint">{t('pk.clienten.tr.fileHint')}</small>
        </div>
      </div>
      <div className="pk-row">
        <button className="btn btn-ghost btn-small" onClick={() => demo(t('pk.clienten.tr.requested'))}>
          <PkIcon name="send" size={15} />
          {t('pk.clienten.tr.zorgmail')}
        </button>
      </div>
      <p className="pk-cl-result">
        <PkIcon name="info" size={16} />
        {t('pk.clienten.tr.result', { condition: { msg: conditionById(condition).label }, date: i18n.dayMonth(sinceDate, new Date(0)), n: done + 1 })}
      </p>
      <Check checked={consent} onChange={setConsent} label={t('pk.clienten.tr.consent')} />
      <div className="pk-row pk-row--end">
        <button className="btn btn-primary" disabled={!consent || !practice.trim()} onClick={apply}>
          <PkIcon name="swap" size={16} />
          {t('pk.clienten.tr.do')}
        </button>
      </div>
    </div>
  );
}

/** Who at the client's own location gives the usual treatment for a condition. */
function specialistsForCondition(condition: ConditionId, location: LocationId): SpecialistId[] {
  const category = treatmentById(conditionById(condition).treatments[0]).category;
  const here = SPECIALISTS.filter((s) => s.locationId === location && s.categories.includes(category));
  return (here.length ? here : SPECIALISTS.filter((s) => s.categories.includes(category))).map((s) => s.id);
}

const pad = (n: number) => String(n).padStart(2, '0');
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
