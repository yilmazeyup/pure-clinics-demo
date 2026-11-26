// Who is signed in on this browser: a client of Pure, signed in through Huidly with a code by e-mail.
// The token stays in this browser; the name and e-mail are kept next to it so the header can greet without a call.
import { api, token } from './api.js';

const KEY = 'pure-web-me';
const hooks = [];
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const write = (me) => {
  try {
    if (me) localStorage.setItem(KEY, JSON.stringify(me));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  hooks.forEach((fn) => fn(me));
};

export const account = {
  current() {
    return token.get() ? read() : null;
  },
  /** After the code was right: keep the token and who it is. */
  signedIn(t, client) {
    token.set(t);
    write(client);
  },
  update(client) {
    write({ ...read(), ...client });
  },
  async refresh() {
    if (!token.get()) return null;
    try {
      const { me } = await api.me();
      write(me);
      return me;
    } catch (e) {
      if (e.status === 401) write(null);
      return read();
    }
  },
  async signOut() {
    await api.logout();
    token.set(null);
    write(null);
  },
  onChange(fn) {
    hooks.push(fn);
  },
};
