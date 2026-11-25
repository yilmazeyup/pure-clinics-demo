import { LOCALE_NAMES, LOCALES, type Locale } from '@pure-clinics/shared';
import { useState } from 'react';

import { Drawer } from '../components/Drawer';
import { useToast } from '../components/ui';
import { Accent, useI18n, useSetLocale, type MessageKey } from '../i18n';
import type { Account, Role } from './accounts';
import { useAccount } from './context';
import { AccountAvatar, useJob } from './ui';

/** The notices each kind of account can switch on or off, and how they start. */
const NOTICES: Record<Role, { key: MessageKey; on: boolean }[]> = {
  admin: [
    { key: 'acc.set.n.booking', on: true },
    { key: 'acc.set.n.stock', on: true },
    { key: 'acc.set.n.review', on: false },
    { key: 'acc.set.n.daily', on: true },
  ],
  staff: [
    { key: 'acc.set.n.mine', on: true },
    { key: 'acc.set.n.moved', on: true },
    { key: 'acc.set.n.daily', on: false },
  ],
  client: [
    { key: 'acc.set.n.sms', on: true },
    { key: 'acc.set.n.mail', on: true },
    { key: 'acc.set.n.news', on: false },
  ],
};

const emailOf = (account: Account) => (account.role === 'client' ? 'sanne.willems@example.nl' : `${account.name.toLowerCase()}@pureclinics.nl`);

/**
 * A person's own settings, opened from her name at the foot of the menu: her name and e-mail, the language of the panel,
 * which notices she gets and, for the team, signing in in two steps. The clinic's own settings live in Kliniek.
 */
export function AccountSettings({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const setLocale = useSetLocale();
  const toast = useToast();
  const { signOut } = useAccount();
  const jobOf = useJob();
  // Kept while the person is signed in, so closing and opening again shows what she chose.
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(emailOf(account));
  const [notices, setNotices] = useState(() => Object.fromEntries(NOTICES[account.role].map((n) => [n.key, n.on])));
  const [twoStep, setTwoStep] = useState(true);
  const team = account.role !== 'client';

  return (
    <Drawer open={open} onClose={onClose} label={t('acc.set.title').replace(/\*/g, '')}>
      <AccountAvatar account={account} />
      <h2 className="drawer-title">
        <Accent text={t('acc.set.title')} />
      </h2>
      <p className="help">
        {jobOf(account)} · {account.role === 'admin' ? t('acc.set.helpAdmin') : t('acc.set.help')}
      </p>

      <section className="drawer-section">
        <h3>{t('acc.set.profile')}</h3>
        <div className="set-fields">
          <label className="set-field">
            {t('acc.set.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          </label>
          <label className="set-field">
            {t('acc.set.email')}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
          </label>
          <label className="set-field">
            {t('acc.set.language')}
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="drawer-section">
        <h3>{t('acc.set.notify')}</h3>
        <div className="set-toggles">
          {NOTICES[account.role].map((n) => (
            <label key={n.key} className="set-toggle">
              <span>{t(n.key)}</span>
              <input type="checkbox" checked={notices[n.key]} onChange={(event) => setNotices((all) => ({ ...all, [n.key]: event.target.checked }))} />
              <i className="set-switch" aria-hidden="true" />
            </label>
          ))}
        </div>
      </section>

      {team ? (
        <section className="drawer-section">
          <h3>{t('acc.set.security')}</h3>
          <div className="set-toggles">
            <label className="set-toggle">
              <span>
                {t('acc.set.twofa')}
                <small>{t('acc.set.twofaHint')}</small>
              </span>
              <input type="checkbox" checked={twoStep} onChange={(event) => setTwoStep(event.target.checked)} />
              <i className="set-switch" aria-hidden="true" />
            </label>
          </div>
          <button className="btn btn-ghost btn-small" style={{ marginTop: 10 }} onClick={() => toast(t('acc.set.real'))}>
            {t('acc.set.password')}
          </button>
        </section>
      ) : null}

      <div className="set-actions">
        <button className="btn btn-ghost" onClick={signOut}>
          {t('acc.signout')}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            toast(t('acc.set.saved'));
            onClose();
          }}
        >
          {t('acc.set.save')}
        </button>
      </div>
    </Drawer>
  );
}
