// Counts an SMS the way Mailchimp does. GSM-7: 160 characters for one message, 153 per part when it is longer; the
// characters of the extension table (€ [ ] { } | ~ ^ \ and the form feed) take two places. One character outside
// GSM-7 (an emoji, a curly quote, an en dash) switches the whole message to Unicode: 70, then 67 per part, counted in
// UTF-16 units, so most emoji take two. Mailchimp adds an unsubscribe link to every Branded Sender ID message, so about
// 25 places are kept free for it.

const GSM_BASIC = new Set([
  ...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
]);
const GSM_EXTENDED = new Set([...'\f^{}\\[~]|€']);

/** Places kept free for the unsubscribe link that Mailchimp adds. */
export const UNSUBSCRIBE_RESERVE = 25;

export type SmsCount = {
  encoding: 'gsm7' | 'unicode';
  /** Places the text itself takes. */
  used: number;
  reserve: number;
  /** Text plus the reserve. */
  total: number;
  parts: number;
  /** 160 or 70 for one message. */
  single: number;
  /** 153 or 67 per part of a longer one. */
  perPart: number;
  /** Places left before the next part starts. */
  left: number;
  /** Characters that count double in GSM-7, each listed once (none in Unicode). */
  doubles: string[];
  /** Characters outside GSM-7 that force Unicode, each listed once. */
  outside: string[];
  emoji: boolean;
};

const EMOJI = /\p{Extended_Pictographic}/u;

export function countSms(text: string, reserve = UNSUBSCRIBE_RESERVE): SmsCount {
  const chars = [...text];
  const outside = [...new Set(chars.filter((c) => !GSM_BASIC.has(c) && !GSM_EXTENDED.has(c)))];
  const doubles = [...new Set(chars.filter((c) => GSM_EXTENDED.has(c)))];
  const encoding = outside.length ? 'unicode' : 'gsm7';
  const used = encoding === 'unicode' ? text.length : chars.reduce((n, c) => n + (GSM_EXTENDED.has(c) ? 2 : 1), 0);
  const single = encoding === 'unicode' ? 70 : 160;
  const perPart = encoding === 'unicode' ? 67 : 153;
  const total = used + (used ? reserve : 0);
  const parts = total === 0 ? 0 : total <= single ? 1 : Math.ceil(total / perPart);
  const room = parts <= 1 ? single : parts * perPart;
  // In Unicode every character takes one place (two for most emoji), so nothing counts double any more.
  return { encoding, used, reserve: used ? reserve : 0, total, parts, single, perPart, left: room - total, doubles: encoding === 'gsm7' ? doubles : [], outside, emoji: chars.some((c) => EMOJI.test(c)) };
}

/** Swaps the usual typographic characters for their GSM-7 lookalikes; emoji stay, they have none. */
export function toGsm(text: string): string {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ');
}
