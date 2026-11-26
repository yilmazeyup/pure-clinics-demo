// Privacyverklaring: Dutch is the binding text; English for everyone else, with a line in their own language saying so.
import { $, $$, S, onLang, state } from '../core.js';

export function start() {
  onLang(() => {
    const show = state.lang === 'nl' ? 'nl' : 'en';
    $$('.legal article').forEach((a) => (a.hidden = a.dataset.lang !== show));
    const note = $('#privacy-lang-note');
    note.hidden = state.lang === 'nl' || state.lang === 'en';
    note.textContent = S('privacyLangNote');
  });
}
