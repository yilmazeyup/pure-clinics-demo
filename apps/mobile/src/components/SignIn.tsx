import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError, token, type Me } from '@/api';
import { useI18n } from '@/i18n';
import { useAccount } from '@/state/account';
import { useTheme } from '@/theme';

import { Button } from './Button';
import { Field } from './Field';
import { Notice } from './Notice';
import { Txt } from './Txt';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sign in or sign up in one go, as on the website: your e-mail address, then the six-digit code Huidly mails you.
 * A new client adds a name and, if they like, a phone number. Used in Mijn Pure, the booking flow and at checkout.
 */
export function SignIn({ intro, onDone }: { intro?: string; onDone?: (me: Me) => void }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const account = useAccount();
  const [step, setStep] = useState<'email' | 'code' | 'name'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | { code: string } | null>(null);
  const [pending, setPending] = useState<{ token: string; me: Me } | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof ApiError ? e : { code: 'offline' });
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => {
    const address = email.trim();
    if (!EMAIL.test(address)) return setError({ code: 'email-invalid' });
    run(async () => {
      await api.requestCode(address, locale);
      setCode('');
      setStep('code');
    });
  };

  const check = (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError({ code: 'code-wrong' });
    run(async () => {
      const r = await api.signIn(email.trim(), value);
      if (r.isNew || !r.me?.name) {
        // A new client first gives a name; the rest of the app hears about the sign-in once that is done.
        token.set(r.token);
        setPending({ token: r.token, me: r.me });
        setName(r.me?.name ?? '');
        setStep('name');
      } else {
        account.signedIn(r.token, r.me);
        onDone?.(r.me);
      }
    });
  };

  const saveName = () => {
    if (name.trim().length < 2) return setError({ code: 'name-invalid' });
    if (!pending) return;
    run(async () => {
      const fields = { name: name.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}), locale };
      const r = await api.updateMe(fields);
      const me = r?.me ?? { ...pending.me, ...fields };
      account.signedIn(pending.token, me);
      onDone?.(me);
    });
  };

  return (
    <View style={{ gap: 14 }}>
      {step === 'email' ? (
        <>
          {intro ? (
            <Txt variant="body" color={theme.c.muted}>
              {intro}
            </Txt>
          ) : null}
          <Field
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            ltr
            onSubmitEditing={sendCode}
            returnKeyType="send"
          />
          <Txt variant="small" color={theme.c.muted}>
            {t('codeExplain')}
          </Txt>
          <Notice error={error?.code === 'offline' ? null : error} tone="inline" />
          <Button label={t('sendCode')} disabled={busy} onPress={sendCode} />
        </>
      ) : null}

      {step === 'code' ? (
        <>
          <Txt variant="body" color={theme.c.ink}>
            {t('codeSent', { e: email.trim() })}
          </Txt>
          <Field
            label={t('code')}
            value={code}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 6);
              setCode(digits);
              if (digits.length === 6 && !busy) check(digits);
            }}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={6}
            ltr
            autoFocus
          />
          <Notice error={error?.code === 'offline' ? null : error} tone="inline" />
          <Button label={t('signIn')} disabled={busy} onPress={() => check()} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setStep('email');
            }}
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <Txt variant="smallStrong" color={theme.c.primary}>
              {t('otherEmail')}
            </Txt>
          </Pressable>
        </>
      ) : null}

      {step === 'name' ? (
        <>
          <Txt variant="body" color={theme.c.ink}>
            {t('welcomeNew')}
          </Txt>
          <Field label={t('name')} value={name} onChangeText={setName} autoComplete="name" autoFocus />
          <Field label={t('phone')} hint={t('optional')} value={phone} onChangeText={setPhone} autoComplete="tel" inputMode="tel" keyboardType="phone-pad" ltr />
          <Notice error={error?.code === 'offline' ? null : error} tone="inline" />
          <Button label={t('save')} disabled={busy} onPress={saveName} />
        </>
      ) : null}

      {error?.code === 'offline' ? <Notice error={error} /> : null}
    </View>
  );
}
