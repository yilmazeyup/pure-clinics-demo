import './huidly.css';
import { useState, type FormEvent } from 'react';

import { useI18n, type MessageKey } from '../i18n';
import { Card, Field } from '../praktijk/kit';
import { PkIcon } from '../praktijk/icons';
import { askCode, connect, disconnect, HuidlyError, useHuidlyTeam } from './client';

const ERRORS: Record<string, MessageKey> = {
  'email-invalid': 'hy.err.email',
  'code-wrong': 'hy.err.code',
  'code-expired': 'hy.err.expired',
  'not-team': 'hy.err.notTeam',
  'too-many': 'hy.err.tooMany',
  offline: 'hy.err.offline',
};

/**
 * Connects this admin to Huidly, where the real orders and the social planning live: the team member's e-mail, then
 * the six-digit code Huidly mails. `what` says what the connection is for on this screen.
 */
export function HuidlyConnect({ what }: { what: string }) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const fail = (e: unknown) => setError(ERRORS[e instanceof HuidlyError ? e.code : ''] ?? 'hy.err.generic');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'email') {
        const sent = await askCode(email.trim(), locale);
        if (sent.devCode) setCode(sent.devCode);
        setStep('code');
      } else {
        await connect(email.trim(), code.replace(/\D/g, ''));
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card eyebrow={t('hy.eyebrow')} title={t('hy.title')} help={what} className="hy-connect">
      <form className="hy-form" onSubmit={submit}>
        {step === 'email' ? (
          <Field label={t('hy.email')}>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@pureclinics.nl" />
          </Field>
        ) : (
          <Field label={t('hy.code')} hint={t('hy.codeSent', { email })}>
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        )}
        <div className="hy-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <PkIcon name={step === 'email' ? 'send' : 'lock'} size={15} />
            {t(step === 'email' ? 'hy.sendCode' : 'hy.connect')}
          </button>
          {step === 'code' ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              {t('hy.otherEmail')}
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="hy-error" role="alert">
            {t(error)}
          </p>
        ) : null}
      </form>
      <p className="hy-note pk-small">{t('hy.note')}</p>
    </Card>
  );
}

/** One quiet line: who is connected to Huidly, with a way to end it. */
export function HuidlyConnected() {
  const { t } = useI18n();
  const team = useHuidlyTeam();
  if (!team) return null;
  return (
    <p className="hy-connected pk-small">
      <i className="live-dot" aria-hidden="true" />
      <span>{t('hy.connectedAs', { name: team.name || team.email })}</span>
      <button className="btn btn-ghost btn-small" onClick={() => void disconnect()}>
        {t('hy.disconnect')}
      </button>
    </p>
  );
}
