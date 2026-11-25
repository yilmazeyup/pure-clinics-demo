import { LOCALE_NAMES, LOCALES, type Locale } from '@pure-clinics/shared';

import { Icon } from '../components/Icon';
import { Accent, useI18n, useSetLocale } from '../i18n';
import { ACCOUNTS, ROLES } from './accounts';
import { useAccount } from './context';
import { AccountAvatar, useJob } from './ui';

/**
 * The first page of the panel: who is signing in. In the demo that is picking one of the accounts (no password, no
 * server); each account then sees its own panel: the owner everything, a team member her own work, a client her own page.
 */
export function SignIn() {
  const { t, locale } = useI18n();
  const setLocale = useSetLocale();
  const { signIn } = useAccount();
  const jobOf = useJob();
  return (
    <div className="app signin">
      <div className="signin-wrap">
        <header className="signin-top">
          <div className="logo" role="img" aria-label="Pure Clinics">
            <span className="wordmark" aria-hidden="true">
              <b>PURE</b>CLINICS
            </span>
          </div>
          <label className="lang-select">
            <Icon name="globe" size={17} />
            <select value={locale} aria-label={t('lang.label')} onChange={(event) => setLocale(event.target.value as Locale)}>
              {LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_NAMES[code]}
                </option>
              ))}
            </select>
          </label>
        </header>

        <main className="signin-card rise">
          <span className="eyebrow">{t('acc.signin.eyebrow')}</span>
          <h1 className="signin-title">
            <Accent text={t('acc.signin.title')} />
          </h1>
          <p className="help">{t('acc.signin.help')}</p>

          {ROLES.map((role) => (
            <section key={role} className="signin-group" aria-labelledby={`signin-${role}`}>
              <h2 id={`signin-${role}`}>{t(`acc.role.${role}`)}</h2>
              <ul>
                {ACCOUNTS.filter((a) => a.role === role).map((account) => (
                  <li key={account.id}>
                    <button className="signin-account" onClick={() => signIn(account)}>
                      <AccountAvatar account={account} />
                      <span className="signin-who">
                        <strong>{account.name}</strong>
                        <span>{jobOf(account)}</span>
                        <small>{t(`acc.sees.${account.id}`)}</small>
                      </span>
                      <span className="signin-go">
                        <Icon name="arrow" size={18} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="signin-note">
            <Icon name="check" size={16} />
            <span>{t('acc.signin.note')}</span>
          </p>
        </main>
      </div>
    </div>
  );
}
