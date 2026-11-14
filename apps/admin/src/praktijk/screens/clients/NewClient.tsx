import { LOCATIONS, type LocationId } from '@pure-clinics/shared';
import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../../../i18n';
import { rng } from '../../../data/random';
import { usePraktijk } from '../../context';
import { covCheck, newClient, parseDmy, type CovMethod, type CovPerson, type CovResult } from '../../data/clients';
import { CAME_VIA, dmy, INSURERS, insurerById, testBsn, type CameVia, type InsurerId, type PracticeClient } from '../../data/core';
import { PkIcon } from '../../icons';
import { Chip, Field, Modal, Seg, Steps, Toggle } from '../../kit';

type Props = {
  open: boolean;
  known: PracticeClient[];
  onClose: () => void;
  onSave: (client: PracticeClient, foreign: string) => void;
  onOpenExisting: (id: string) => void;
};

const EMPTY: CovPerson = { first: '', last: '', street: '', postcode: '', city: '', insurer: 'zk', policy: '', bsn: '' };
const FLAGS = ['newsletter', 'sms', 'email', 'share'] as const;

/**
 * A new client in three steps: the COV check through Vecozo (simulated) fills in name, address, insurer and policy and
 * warns about a duplicate; then the details; then consents, reminders and where she came from.
 */
export function NewClientDialog({ open, known, onClose, onSave, onOpenExisting }: Props) {
  const { t } = useI18n();
  const { today, demo } = usePraktijk();
  const [step, setStep] = useState(0);
  const [birth, setBirth] = useState('');
  const [method, setMethod] = useState<CovMethod>('bsn');
  const [bsn, setBsn] = useState('');
  const [policy, setPolicy] = useState('');
  const [postcode, setPostcode] = useState('');
  const [house, setHouse] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CovResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<CovPerson>(EMPTY);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState<LocationId>('nijmegen');
  const [foreign, setForeign] = useState('');
  const [via, setVia] = useState<CameVia>('google');
  const [flags, setFlags] = useState({ newsletter: true, sms: true, email: true, share: false });
  const timer = useRef(0);
  const tries = useRef(0);

  // Every time the dialog opens it starts empty.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setBirth('');
    setMethod('bsn');
    setBsn('');
    setPolicy('');
    setPostcode('');
    setHouse('');
    setResult(null);
    setError(null);
    setPerson(EMPTY);
    setEmail('');
    setPhone('');
    setForeign('');
    setVia('google');
    setFlags({ newsletter: true, sms: true, email: true, share: false });
    return () => window.clearTimeout(timer.current);
  }, [open]);

  const birthDate = parseDmy(birth);
  const bsnBad = method === 'bsn' && bsn.trim().length === 9 && covCheck({ birth: today, method, bsn, policy, postcode, house }, [], location, today).ok === false;

  const check = () => {
    setError(null);
    if (!birthDate) {
      setError(t('pk.clienten.cov.needBirth'));
      return;
    }
    setChecking(true);
    setResult(null);
    timer.current = window.setTimeout(() => {
      setChecking(false);
      const answer = covCheck({ birth: birthDate, method, bsn, policy, postcode, house }, known, location, today);
      setResult(answer);
      if (!answer.ok) {
        setError(t(answer.reason === 'bsn' ? 'pk.clienten.cov.bsnInvalid' : 'pk.clienten.cov.empty'));
        return;
      }
      setPerson(answer.person);
      if (answer.duplicate) {
        setEmail(answer.duplicate.email);
        setPhone(answer.duplicate.phone);
      } else {
        const local = `${answer.person.first}.${answer.person.last}`
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .replace(/[^a-z.]+/g, '');
        setEmail(`${local}@example.com`);
        setPhone(`06 0000 ${String(1000 + Math.floor(rng(answer.person.bsn)() * 8999))}`);
      }
    }, 900);
  };

  /** Fills the fields with an existing client, to show the duplicate warning. */
  const tryExisting = () => {
    const pick = known.filter((c) => c.bsn)[Math.floor(Math.random() * Math.min(40, known.length))] ?? known[0];
    if (!pick) return;
    setBirth(dmy(pick.birth));
    setMethod('bsn');
    setBsn(pick.bsn);
    setResult(null);
  };

  const save = () => {
    if (!birthDate) return;
    const client = newClient(person, birthDate, { locationId: location, cameVia: via, flags, email, phone }, today);
    onSave(client, foreign.trim());
    demo(t('pk.clienten.cov.saved', { name: `${client.first} ${client.last}` }));
  };

  const found = result?.ok ? result : null;
  const canNext = step === 0 ? Boolean(found) : step === 1 ? Boolean(person.first && person.last && birthDate) : true;
  const set = (patch: Partial<CovPerson>) => setPerson((p) => ({ ...p, ...patch }));

  return (
    <Modal
      open={open}
      wide
      title={t('pk.clienten.cov.title')}
      onClose={onClose}
      footer={
        <>
          {step > 0 ? (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              {t('pk.common.previous')}
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => {
                if (!birthDate) setError(t('pk.clienten.cov.needBirth'));
                else setStep(1);
              }}
            >
              {t('pk.clienten.cov.manual')}
            </button>
          )}
          {step < 2 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {t('pk.common.next')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={save}>
              <PkIcon name="check" size={16} />
              {t('pk.clienten.cov.save')}
            </button>
          )}
        </>
      }
    >
      <Steps steps={[t('pk.clienten.cov.step1'), t('pk.clienten.cov.step2'), t('pk.clienten.cov.step3')]} current={step} onStep={(i) => i <= step && setStep(i)} />

      {step === 0 ? (
        <div className="pk-stack pk-cl-cov">
          <p className="help">{t('pk.clienten.cov.help')}</p>
          <div className="pk-form">
            <Field label={t('pk.clienten.cov.birth')}>
              <input className="pk-input pk-num" value={birth} placeholder={t('pk.clienten.cov.birthPlaceholder')} inputMode="numeric" onChange={(e) => setBirth(e.target.value)} />
            </Field>
            <Field label={t('pk.clienten.cov.by')} wide>
              <Seg
                value={method}
                label={t('pk.clienten.cov.by')}
                onChange={(m) => {
                  setMethod(m);
                  setResult(null);
                  setError(null);
                }}
                options={[
                  { value: 'bsn', label: t('pk.clienten.cov.bsn') },
                  { value: 'policy', label: t('pk.clienten.cov.policy') },
                  { value: 'postcode', label: t('pk.clienten.cov.postcode') },
                ]}
              />
            </Field>
            {method === 'bsn' ? (
              <Field label={t('pk.clienten.cov.bsn')} hint={t('pk.clienten.cov.bsnHint')}>
                <input
                  className="pk-input pk-mono"
                  value={bsn}
                  inputMode="numeric"
                  maxLength={9}
                  aria-invalid={bsnBad}
                  onChange={(e) => setBsn(e.target.value.replace(/\D+/g, ''))}
                />
              </Field>
            ) : method === 'policy' ? (
              <Field label={t('pk.clienten.cov.policy')}>
                <input className="pk-input pk-mono" value={policy} onChange={(e) => setPolicy(e.target.value)} />
              </Field>
            ) : (
              <>
                <Field label={t('pk.clienten.cov.postcodeLabel')}>
                  <input className="pk-input pk-mono" value={postcode} placeholder="6521 AB" onChange={(e) => setPostcode(e.target.value)} />
                </Field>
                <Field label={t('pk.clienten.cov.house')}>
                  <input className="pk-input pk-num" value={house} inputMode="numeric" onChange={(e) => setHouse(e.target.value)} />
                </Field>
              </>
            )}
          </div>
          <div className="pk-row">
            <button className="btn btn-primary" onClick={check} disabled={checking}>
              <PkIcon name={checking ? 'refresh' : 'shieldCheck'} size={16} />
              {checking ? t('pk.clienten.cov.checking') : t('pk.clienten.cov.check')}
            </button>
            {method === 'bsn' ? (
              <button
                className="btn btn-ghost btn-small"
                onClick={() => {
                  setBsn(testBsn(rng(`try-${Date.now()}-${tries.current++}`)));
                  if (!birth) setBirth(dmy(new Date(today.getFullYear() - 29, 4, 17)));
                  setResult(null);
                }}
              >
                {t('pk.clienten.cov.testBsn')}
              </button>
            ) : null}
            <button className="btn btn-ghost btn-small" onClick={tryExisting}>
              {t('pk.clienten.cov.testExisting')}
            </button>
          </div>
          {error ? <p className="pk-cl-error">{error}</p> : null}
          {found ? (
            <div className="pk-cl-found">
              <div className="pk-row">
                <Chip tone="good" icon="check">
                  {t('pk.clienten.cov.found')}
                </Chip>
                <strong>
                  {found.person.first} {found.person.last}
                </strong>
              </div>
              <p className="pk-small">
                {found.person.street}, {found.person.postcode} {found.person.city}
              </p>
              <p className="pk-small">
                {t('pk.clienten.cov.insured', {
                  insurer: insurerById(found.person.insurer).name,
                  uzovi: insurerById(found.person.insurer).uzovi,
                  policy: found.person.policy,
                })}{' '}
                · BSN <span className="pk-mono">{found.person.bsn}</span>
              </p>
              <p className="pk-muted pk-small">{t('pk.clienten.cov.foundHelp')}</p>
              {found.duplicate ? (
                <div className="pk-cl-warn">
                  <PkIcon name="warning" size={17} />
                  <span>{t('pk.clienten.cov.duplicate', { name: `${found.duplicate.first} ${found.duplicate.last}`, date: dmy(found.duplicate.birth) })}</span>
                  <button className="btn btn-ghost btn-small" onClick={() => onOpenExisting(found.duplicate!.id)}>
                    {t('pk.clienten.cov.openExisting')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : step === 1 ? (
        <div className="pk-form">
          <Field label={t('pk.clienten.cov.first')}>
            <input className="pk-input" value={person.first} onChange={(e) => set({ first: e.target.value })} />
          </Field>
          <Field label={t('pk.clienten.cov.last')}>
            <input className="pk-input" value={person.last} onChange={(e) => set({ last: e.target.value })} />
          </Field>
          <Field label={t('pk.clienten.cov.birth')}>
            <input className="pk-input pk-num" value={birth} onChange={(e) => setBirth(e.target.value)} />
          </Field>
          <Field label={t('pk.clienten.cov.street')}>
            <input className="pk-input" value={person.street} onChange={(e) => set({ street: e.target.value })} />
          </Field>
          <Field label={t('pk.clienten.cov.postcodeF')}>
            <input className="pk-input pk-mono" value={person.postcode} onChange={(e) => set({ postcode: e.target.value })} />
          </Field>
          <Field label={t('pk.clienten.cov.city')}>
            <input className="pk-input" value={person.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label={t('pk.common.insurer')}>
            <select className="pk-input" value={person.insurer} onChange={(e) => set({ insurer: e.target.value as InsurerId })}>
              {INSURERS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.uzovi}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.clienten.cov.policy')}>
            <input className="pk-input pk-mono" value={person.policy} onChange={(e) => set({ policy: e.target.value })} />
          </Field>
          <Field label={t('pk.clienten.cov.bsn')}>
            <input className="pk-input pk-mono" value={person.bsn} maxLength={9} onChange={(e) => set({ bsn: e.target.value.replace(/\D+/g, '') })} />
          </Field>
          <Field label={t('pk.clienten.cov.email')}>
            <input className="pk-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('pk.clienten.cov.phone')}>
            <input className="pk-input pk-mono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t('pk.clienten.cov.location')}>
            <select className="pk-input" value={location} onChange={(e) => setLocation(e.target.value as LocationId)}>
              {LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.city}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pk.clienten.cov.foreign')} hint={t('pk.clienten.cov.foreignHint')} wide>
            <input className="pk-input pk-mono" value={foreign} onChange={(e) => setForeign(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="pk-stack">
          <div>
            {FLAGS.map((f) => (
              <Toggle
                key={f}
                checked={flags[f]}
                onChange={(on) => setFlags((all) => ({ ...all, [f]: on }))}
                label={t(`pk.clienten.flag.${f}`)}
                hint={t(`pk.clienten.flag.${f}Hint`)}
              />
            ))}
          </div>
          <Field label={t('pk.clienten.cov.via')}>
            <select className="pk-input" value={via} onChange={(e) => setVia(e.target.value as CameVia)}>
              {CAME_VIA.map((v) => (
                <option key={v} value={v}>
                  {t(`pk.via.${v}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </Modal>
  );
}
