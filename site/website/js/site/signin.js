// Sign in or sign up in one go: your e-mail address, then the six-digit code Huidly mails you. New clients add their
// name and phone number. Used on Mijn Pure, in the booking flow and at checkout.
import { $, S, esc, state } from './core.js';
import { account } from './account.js';
import { api, token } from './api.js';
import { track } from './track.js';

export const errorText = (e) =>
  S(
    {
      'email-invalid': 'errEmail',
      'code-wrong': 'errCode',
      'code-expired': 'errCodeExpired',
      'too-many': 'errTooMany',
      'name-invalid': 'errName',
      'phone-invalid': 'errPhone',
      'date-invalid': 'errDate',
      'out-of-stock': 'errStock',
      'too-late': 'errTooLate',
      offline: 'errOffline',
    }[e?.code] ?? 'errGeneric',
  );

/**
 * Draws the sign-in steps into `box`. Calls onDone(client) once signed in (and, for a new client, named).
 */
export function signIn(box, { onDone, intro = '' } = {}) {
  let email = '';
  const step = (html) => {
    box.innerHTML = html;
    box.querySelector('input')?.focus({ preventScroll: true });
  };
  const fail = (form, e) => {
    const p = form.querySelector('.form-error');
    p.textContent = errorText(e);
    p.hidden = false;
    form.querySelector('button[type=submit]').disabled = false;
  };

  const askEmail = () => {
    step(`<form class="form" novalidate>
      ${intro ? `<p class="form-intro">${intro}</p>` : ''}
      <label class="field"><span>${S('email')}</span><input type="email" name="email" autocomplete="email" inputmode="email" required value="${esc(email)}" /></label>
      <p class="fine">${S('codeExplain')}</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-solid" type="submit">${S('sendCode')}</button>
    </form>`);
    const form = box.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = form.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(form, { code: 'email-invalid' });
      form.querySelector('button[type=submit]').disabled = true;
      try {
        await api.requestCode(email, state.lang);
        askCode();
      } catch (err) {
        fail(form, err);
      }
    });
  };

  const askCode = () => {
    step(`<form class="form" novalidate>
      <p class="form-intro">${S('codeSent', { e: `<b>${esc(email)}</b>` })}</p>
      <label class="field"><span>${S('code')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required class="code-input" /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-solid" type="submit">${S('signIn')}</button>
      <button class="link-arrow" type="button" data-back>${S('otherEmail')}</button>
    </form>`);
    const form = box.querySelector('form');
    form.querySelector('[data-back]').addEventListener('click', askEmail);
    form.code.addEventListener('input', () => {
      form.code.value = form.code.value.replace(/\D/g, '').slice(0, 6);
      if (form.code.value.length === 6) form.requestSubmit();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = form.code.value;
      if (code.length !== 6) return fail(form, { code: 'code-wrong' });
      form.querySelector('button[type=submit]').disabled = true;
      try {
        const { token: t, me, isNew } = await api.signIn(email, code);
        track(isNew ? 'sign_up' : 'login', { method: 'email_code' });
        // A new client first gives a name; the page only hears about the sign-in once that is done.
        if (isNew || !me?.name) {
          token.set(t);
          askName(me, t);
        } else {
          account.signedIn(t, me);
          onDone?.(me);
        }
      } catch (err) {
        fail(form, err);
      }
    });
  };

  const askName = (client, t) => {
    step(`<form class="form" novalidate>
      <p class="form-intro">${S('welcomeNew')}</p>
      <label class="field"><span>${S('name')}</span><input name="name" autocomplete="name" required value="${esc(client?.name ?? '')}" /></label>
      <label class="field"><span>${S('phone')} <small>${S('optional')}</small></span><input name="phone" type="tel" autocomplete="tel" /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-solid" type="submit">${S('save')}</button>
    </form>`);
    const form = box.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (name.length < 2) return fail(form, { code: 'name-invalid' });
      form.querySelector('button[type=submit]').disabled = true;
      try {
        const phone = form.phone.value.trim();
        const res = await api.updateMe({ name, ...(phone ? { phone } : {}), locale: state.lang });
        const me = res?.me ?? { ...client, name, phone };
        account.signedIn(t, me);
        onDone?.(me);
      } catch (err) {
        fail(form, err);
      }
    });
  };

  askEmail();
}

export { $ };
