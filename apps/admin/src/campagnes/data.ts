import type { LocationId } from '@pure-clinics/shared';

import type { MessageKey } from '../i18n';
import type { StaffId } from '../praktijk/data/core';

// Campagnes: Pure's own e-mail and SMS campaigns for November and December, with their texts exactly as Pure wrote them
// (Dutch, because that is what clients receive). Results, counts, contacts and keys are demo values; the contacts are
// obviously made up (example.com addresses, 06-00000xxx numbers). Nothing here talks to Mailchimp.

export type Channel = 'email' | 'sms';
export type Status = 'concept' | 'review' | 'scheduled' | 'sent';
export const STATUSES: Status[] = ['concept', 'review', 'scheduled', 'sent'];

/* ---------- Segments ---------- */

export type SegmentId = 'all' | 'app2000' | 'members' | 'acne' | 'pigment' | 'zo' | 'gift' | 'nijmegen' | 'uden' | 'sms';

export type Segment = {
  id: SegmentId;
  /** The tag the segment becomes in Mailchimp. */
  tag: string;
  /** Contacts in the segment, with e-mail consent and with SMS consent. */
  count: number;
  email: number;
  sms: number;
  /** How the panel builds it, as sentences: cp.seg.<id>.r1, r2, … */
  rules: number;
  /** Where the data comes from. */
  source: 'app' | 'agenda' | 'shop' | 'kassa' | 'file';
  /** Minutes before the demo's last sync that this tag was last pushed (0: in the last sync). */
  lag: number;
};

/** "Alle e-mailabonnees" is the audience itself; the others are synced to Mailchimp as tags. */
export const SEGMENTS: Segment[] = [
  { id: 'app2000', tag: 'app-laatste-2000', count: 2000, email: 1968, sms: 702, rules: 4, source: 'app', lag: 0 },
  { id: 'members', tag: 'members', count: 486, email: 471, sms: 233, rules: 2, source: 'kassa', lag: 0 },
  { id: 'acne', tag: 'acnetraject', count: 312, email: 268, sms: 121, rules: 3, source: 'agenda', lag: 0 },
  { id: 'pigment', tag: 'pigment', count: 274, email: 241, sms: 96, rules: 2, source: 'agenda', lag: 0 },
  { id: 'zo', tag: 'zo-skin-health', count: 538, email: 497, sms: 204, rules: 2, source: 'shop', lag: 0 },
  { id: 'gift', tag: 'cadeaubon', count: 167, email: 142, sms: 58, rules: 2, source: 'kassa', lag: 0 },
  { id: 'nijmegen', tag: 'nijmegen', count: 4105, email: 3236, sms: 1190, rules: 1, source: 'file', lag: 0 },
  { id: 'uden', tag: 'uden', count: 2637, email: 2082, sms: 774, rules: 1, source: 'file', lag: 0 },
  { id: 'sms', tag: 'sms-toestemming', count: 1964, email: 1602, sms: 1964, rules: 3, source: 'app', lag: 0 },
];

/** The audience in Mailchimp, by status; together they make the contacts. */
export const AUDIENCE = {
  subscribed: 5318,
  unsubscribed: 412,
  cleaned: 96,
  pending: 38,
  transactional: 878,
  sms: 1964,
  smsUnsubscribed: 23,
};
export const contactsOf = (a: typeof AUDIENCE) => a.subscribed + a.unsubscribed + a.cleaned + a.pending + a.transactional;

/** Every segment's shape, with "all subscribers" first. */
export const segmentById = (id: SegmentId, list: Segment[] = SEGMENTS): Segment =>
  id === 'all'
    ? { id: 'all', tag: '', count: contactsOf(AUDIENCE), email: AUDIENCE.subscribed, sms: AUDIENCE.sms, rules: 0, source: 'file', lag: 0 }
    : (list.find((s) => s.id === id) ?? list[0]);

/* ---------- Campaign content ---------- */

export type BlockKind = 'heading' | 'text' | 'offer' | 'button' | 'image';
export type PriceLine = { label: string; was: string; now: string };

/** One block of an e-mail. Prices are kept as Pure wrote them ("€202,90"), so nothing is rounded or reformatted. */
export type Block = {
  id: string;
  kind: BlockKind;
  /** Heading, text, the offer's description or the button's label. */
  text: string;
  /** Heading size. */
  size?: 'large' | 'small';
  /** Offer card. */
  title?: string;
  prices?: PriceLine[];
  extra?: string;
  /** Button or image link; UTM tags are added when the mail goes out. */
  url?: string;
  /** Image: what the square tile stands for until a picture is chosen. */
  alt?: string;
};

/** A review note; `who` is a team member, or null for the person using the panel. */
export type Comment = { id: string; who: StaffId | null; at: Date; resolved: boolean; text?: string; key?: MessageKey };

export type ResultLine = { label: string; kind: 'booking' | 'order'; count: number; revenue: number };

export type Results = {
  recipients: number;
  delivered: number;
  bounces: number;
  /** Unique opens; only e-mail has them. */
  opens: number | null;
  clicks: number;
  unsubscribes: number;
  complaints: number;
  /** Bookings and shop orders in the panel after a click, recognised by the UTM tags. */
  lines: ResultLine[];
  /** When the panel last fetched (e-mail) or imported (SMS) the report. */
  fetched: Date;
};

export type Campaign = {
  id: string;
  channel: Channel;
  /** Internal name; for an e-mail it is usually the subject. */
  name: string;
  status: Status;
  segment: SegmentId;
  sendAt: Date;
  author: StaffId;
  /** utm_campaign, also the campaign's name in Mailchimp. */
  utm: string;
  subject: string;
  preview: string;
  fromName: string;
  replyTo: string;
  blocks: Block[];
  /** SMS text, without the unsubscribe link Mailchimp adds. */
  text: string;
  senderId: string;
  comments: Comment[];
  results: Results | null;
  /** Set once the campaign exists in Mailchimp (made up). */
  mailchimpId: string | null;
};

let n = 0;
const id = () => `b${++n}`;
const heading = (text: string, size: 'large' | 'small' = 'large'): Block => ({ id: id(), kind: 'heading', text, size });
const para = (text: string): Block => ({ id: id(), kind: 'text', text });
const offer = (title: string, text: string, prices: PriceLine[] = [], extra = ''): Block => ({ id: id(), kind: 'offer', title, text, prices, extra });
const button = (text: string, url: string): Block => ({ id: id(), kind: 'button', text, url });
const image = (alt: string, url = 'https://pureclinics.nl'): Block => ({ id: id(), kind: 'image', text: '', alt, url });
const price = (label: string, was: string, now: string): PriceLine => ({ label, was, now });

export const newBlock = (kind: BlockKind): Block => {
  switch (kind) {
    case 'heading':
      return heading('', 'large');
    case 'text':
      return para('');
    case 'offer':
      return offer('', '', [price('', '', '')]);
    case 'button':
      return button('', 'https://pureclinics.nl');
    case 'image':
      return image('');
  }
};

export const copyBlocks = (blocks: Block[]): Block[] => blocks.map((b) => ({ ...b, id: id(), prices: b.prices?.map((p) => ({ ...p })) }));

/** Dates are fixed: Pure's real campaign calendar for this season. */
const at = (month: number, day: number, hour: number, year = 2026) => new Date(year, month - 1, day, hour, 0, 0, 0);

const BLACK_FRIDAY_MAIL: Block[] = [
  heading('BLACK FRIDAY BIJ PURE CLINICS'),
  heading('Give your skin a little extra love!', 'small'),
  image('Black Friday'),
  para(
    'Tijd voor een mooie huidboost! Of je nu wilt werken aan huidverjonging, pigmentatie, huidstructuur of gladde benen: bij Pure Clinics profiteer je tijdelijk van exclusieve Black Friday deals!',
  ),
  offer(
    '✨ SKINPEN – Voor een gladdere huid',
    'Stimuleert collageen en elastine en verbetert de huidstructuur, fijne lijntjes en grove poriën.',
    [price('Losse behandeling:', '€195', '€165'), price('3 behandelingen:', '€545', '€499')],
    'Inclusief gratis cleanser t.w.v. €50!',
  ),
  offer(
    '✨ SYLFIRMX + GRATIS PRX',
    'Werk aan een stevigere, egalere huid en verbeter onder andere fijne lijntjes, roodheid en pigmentatie.',
    [],
    'Ontvang een gratis PRX-behandeling t.w.v. €125 bij een SylfirmX-behandeling!',
  ),
  offer('✨ PRX – Voor een frisse glow', 'Stimuleert huidvernieuwing en collageenaanmaak voor een frissere, egalere huid.', [price('', '€125', '€85')]),
  offer(
    '✨ LASERONTHAREN – Voor een gladde huid',
    'Geniet van langdurige haarreductie en zeg vaarwel tegen scheerirritatie!',
    [price('Gehele benen', '', '€295')],
    '+ GRATIS bikinilijn t.w.v. €75!',
  ),
  heading('WEES ER SNEL BIJ!', 'small'),
  para(
    'Onze Black Friday deals zijn geldig t/m 1 december. Wil je profiteren van één van deze acties? Neem contact met ons op of plan direct jouw behandeling in!',
  ),
  button('Plan direct jouw behandeling in', 'https://pureclinics.nl'),
  para("Love the skin you're in!\n\nLiefs,\nTeam Pure Clinics"),
];

const CHRISTMAS_MAIL: Block[] = [
  heading('🎄 CHRISTMAS GLOW BIJ PURE CLINICS'),
  heading('The gift of beautiful skin!', 'small'),
  image('Christmas Glow'),
  para(
    'Verras jezelf of iemand anders deze kerst met de huidverzorging van ZO Skin Health. Speciaal voor de feestdagen hebben we twee mooie kits samengesteld!',
  ),
  offer('✨ THE CLEAR SKIN KIT – A fresh start for your skin! 🎄', 'Speciaal voor de onzuivere en acnegevoelige huid.', [price('', '€150', '€125')]),
  offer(
    '✨ THE ULTIMATE SKIN GLOW KIT – A little Christmas love for every skin!',
    'Een complete skincarekit voor alle huidtypes, voor een gezonde, stralende huid.',
    [price('', '€202,90', '€169')],
    'Inclusief een leuk extraatje van Pure Clinics! 🎁',
  ),
  offer(
    '✨ THE EVEN SKIN KIT – Less pigment, more glow!',
    'Speciaal samengesteld voor de huid met pigmentatie en een ongelijkmatige teint.',
    [price('', '€242', '€199')],
  ),
  heading('🎁 GEEF HUIDVERBETERING CADEAU!', 'small'),
  para(
    'Met onze Pure Clinics cadeaukaart geef je iemand een moment van ontspanning en huidverbetering cadeau. Bij aankoop van een cadeaubon t.w.v. €100 ontvang je €15 cadeau van ons!',
  ),
  heading('Make this Christmas glow!', 'small'),
  para('De kerstacties zijn tijdelijk verkrijgbaar bij Pure Clinics. We helpen je graag bij het kiezen van de juiste kit voor jouw huid!'),
  para('Liefs,\nTeam Pure Clinics'),
];

const ONE_WEEK_MAIL: Block[] = [
  heading('NOG ÉÉN WEEK: JE KERSTKIT 🎄'),
  para('Hoi *|FNAME|*, de kerstacties lopen bijna af. Nog één week kies je een kit van ZO Skin Health met kerstkorting:'),
  offer('✨ THE CLEAR SKIN KIT', 'Voor de onzuivere en acnegevoelige huid.', [price('', '€150', '€125')]),
  offer('✨ THE ULTIMATE SKIN GLOW KIT', 'Voor alle huidtypes.', [price('', '€202,90', '€169')], 'Inclusief een leuk extraatje van Pure Clinics! 🎁'),
  offer('✨ THE EVEN SKIN KIT', 'Voor de huid met pigmentatie en een ongelijkmatige teint.', [price('', '€242', '€199')]),
  para('🎁 Liever iets cadeau geven? Bij een cadeaubon t.w.v. €100 ontvang je €15 cadeau van ons.'),
  button('Kies jouw kit', 'https://pureclinics.nl'),
  para('Liefs,\nTeam Pure Clinics'),
];

const LAST_MINUTE_MAIL: Block[] = [
  heading('LAST-MINUTE CADEAU? 🎁'),
  para('Hoi *|FNAME|*, nog op zoek naar een cadeau? Met de Pure Clinics cadeaubon geef je iemand een moment van ontspanning en huidverbetering cadeau.'),
  offer('🎁 CADEAUBON T.W.V. €100', '', [], 'Bij aankoop ontvang je €15 cadeau van ons!'),
  para('Of kies een ZO kerstkit vanaf €125. We helpen je graag bij het kiezen van de juiste kit.'),
  button('Meer over de cadeaubon', 'https://pureclinics.nl'),
  para('Liefs,\nTeam Pure Clinics'),
];

const mail = (c: Partial<Campaign> & Pick<Campaign, 'id' | 'name' | 'status' | 'segment' | 'sendAt' | 'utm' | 'subject' | 'preview' | 'blocks' | 'author'>): Campaign => ({
  channel: 'email',
  fromName: 'Pure Clinics',
  replyTo: 'info@pureclinics.nl',
  text: '',
  senderId: 'PureClinics',
  comments: [],
  results: null,
  mailchimpId: null,
  ...c,
});

const sms = (c: Pick<Campaign, 'id' | 'name' | 'status' | 'segment' | 'sendAt' | 'utm' | 'text' | 'author'> & Partial<Campaign>): Campaign => ({
  channel: 'sms',
  subject: '',
  preview: '',
  fromName: 'Pure Clinics',
  replyTo: 'info@pureclinics.nl',
  blocks: [],
  senderId: 'PureClinics',
  comments: [],
  results: null,
  mailchimpId: null,
  ...c,
});

/** The results of the Black Friday mail: demo values for about 2,000 recipients, fetched in the last sync. */
const blackFridayResults = (fetched: Date): Results => ({
  recipients: 1968,
  delivered: 1941,
  bounces: 27,
  opens: 902,
  clicks: 158,
  unsubscribes: 7,
  complaints: 1,
  lines: [
    { label: 'SkinPen · losse behandeling', kind: 'booking', count: 4, revenue: 660 },
    { label: 'SkinPen · 3 behandelingen', kind: 'booking', count: 1, revenue: 499 },
    { label: 'PRX', kind: 'booking', count: 4, revenue: 340 },
    { label: 'SylfirmX + gratis PRX', kind: 'booking', count: 1, revenue: 325 },
    { label: 'Laserontharen · gehele benen', kind: 'booking', count: 2, revenue: 590 },
    { label: 'ZO Skin Health (webshop)', kind: 'order', count: 4, revenue: 278 },
  ],
  fetched,
});

export function seedCampaigns(lastSync: Date): Campaign[] {
  return [
    mail({
      id: 'bf-mail',
      name: 'Black Friday bij Pure Clinics',
      subject: 'Black Friday bij Pure Clinics',
      preview: 'Give your skin a little extra love!',
      status: 'sent',
      segment: 'app2000',
      sendAt: at(11, 20, 10),
      utm: 'black-friday-2026',
      author: 'husna',
      blocks: BLACK_FRIDAY_MAIL,
      results: blackFridayResults(lastSync),
      mailchimpId: 'c-7f3a91d2e0',
    }),
    sms({
      id: 'bf-sms',
      name: 'Black Friday',
      status: 'review',
      segment: 'sms',
      sendAt: at(11, 27, 11),
      utm: 'black-friday-2026-sms',
      author: 'husna',
      text: 'Pure Clinics Black Friday: SkinPen €165, PRX €85, SylfirmX + gratis PRX, laser benen + gratis bikinilijn. T/m 1 dec: pureclinics.nl',
    }),
    mail({
      id: 'xmas-mail',
      name: 'Christmas Glow bij Pure Clinics',
      subject: 'Christmas Glow bij Pure Clinics',
      preview: 'The gift of beautiful skin!',
      status: 'review',
      segment: 'all',
      sendAt: at(12, 2, 10),
      utm: 'christmas-glow-2026',
      author: 'husna',
      blocks: CHRISTMAS_MAIL,
      comments: [{ id: 'cm-1', who: 'margot', at: new Date(lastSync.getTime() - 95 * 60000), resolved: false, key: 'cp.review.twoKits' }],
    }),
    sms({
      id: 'xmas-sms',
      name: 'Kerst',
      status: 'concept',
      segment: 'sms',
      sendAt: at(12, 2, 11),
      utm: 'kerst-2026-sms',
      author: 'husna',
      text: 'Kerst bij Pure Clinics: ZO kerstkits vanaf €125 en €15 cadeau bij een cadeaubon van €100. Tijdelijk! pureclinics.nl',
    }),
    mail({
      id: 'week-mail',
      name: 'Nog één week: je kerstkit',
      subject: 'Nog één week: je kerstkit',
      preview: 'De kerstkits van ZO Skin Health vanaf €125, en €15 cadeau bij een cadeaubon van €100.',
      status: 'concept',
      segment: 'zo',
      sendAt: at(12, 17, 10),
      utm: 'kerstkit-reminder-2026',
      author: 'husna',
      blocks: ONE_WEEK_MAIL,
    }),
    mail({
      id: 'gift-mail',
      name: 'Last-minute cadeau? Wij hebben er een 🎁',
      subject: 'Last-minute cadeau? Wij hebben er een 🎁',
      preview: 'Cadeaubon van €100 = €15 cadeau erbij.',
      status: 'concept',
      segment: 'all',
      sendAt: at(12, 21, 10),
      utm: 'last-minute-cadeau-2026',
      author: 'husna',
      blocks: LAST_MINUTE_MAIL,
    }),
    sms({
      id: 'gift-sms',
      name: 'Last-minute cadeau',
      status: 'concept',
      segment: 'sms',
      sendAt: at(12, 21, 11),
      utm: 'last-minute-cadeau-2026-sms',
      author: 'husna',
      text: 'Last-minute cadeau? Pure Clinics cadeaubon van €100 = €15 cadeau erbij. Of een ZO kerstkit vanaf €125. pureclinics.nl',
    }),
  ];
}

/** What an imported SMS report looks like (demo values, scaled to the recipients). */
export function smsResults(recipients: number, fetched: Date): Results {
  const delivered = Math.round(recipients * 0.986);
  return {
    recipients,
    delivered,
    bounces: recipients - delivered,
    opens: null,
    clicks: Math.round(delivered * 0.052),
    unsubscribes: Math.max(1, Math.round(delivered * 0.003)),
    complaints: 0,
    lines: [
      { label: 'PRX', kind: 'booking', count: Math.max(1, Math.round(recipients / 650)), revenue: 85 * Math.max(1, Math.round(recipients / 650)) },
      { label: 'SkinPen · losse behandeling', kind: 'booking', count: Math.max(1, Math.round(recipients / 900)), revenue: 165 * Math.max(1, Math.round(recipients / 900)) },
    ],
    fetched,
  };
}

/** Days that matter for planning, shown in the calendar. */
export const MOMENTS: { date: Date; key: MessageKey }[] = [
  { date: at(11, 27, 0), key: 'cp.moment.blackFriday' },
  { date: at(11, 30, 0), key: 'cp.moment.cyberMonday' },
  { date: at(12, 1, 0), key: 'cp.moment.dealsEnd' },
  { date: at(12, 5, 0), key: 'cp.moment.sinterklaas' },
  { date: at(12, 25, 0), key: 'cp.moment.christmas' },
  { date: at(12, 26, 0), key: 'cp.moment.boxing' },
  { date: at(12, 31, 0), key: 'cp.moment.newYearsEve' },
  { date: at(1, 1, 0, 2027), key: 'cp.moment.newYear' },
];

/** The calendar shows November to January. */
export const CALENDAR_MONTHS = [new Date(2026, 10, 1), new Date(2026, 11, 1), new Date(2027, 0, 1)];

/* ---------- Contacts ---------- */

export type EmailStatus = 'subscribed' | 'unsubscribed' | 'cleaned' | 'pending' | 'transactional';
export type SmsStatus = 'subscribed' | 'unsubscribed' | 'none';

export type Contact = {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  /** MM/DD: Mailchimp's birthday field keeps no year. */
  birthday: string;
  location: LocationId;
  tags: SegmentId[];
  emailStatus: EmailStatus;
  smsStatus: SmsStatus;
  /** Double opt-in: when the confirmation was clicked, in days before today; null while it waits or when not needed. */
  confirmedDaysAgo: number | null;
};

/** A sample of synced contacts; every name, address and number is plainly made up. */
export const CONTACTS: Contact[] = [
  { id: 'k1', first: 'Anna', last: 'Voorbeeld', email: 'anna.voorbeeld@example.com', phone: '06-00000101', birthday: '03/14', location: 'nijmegen', tags: ['app2000', 'members', 'zo', 'nijmegen', 'sms'], emailStatus: 'subscribed', smsStatus: 'subscribed', confirmedDaysAgo: 412 },
  { id: 'k2', first: 'Bram', last: 'Testpersoon', email: 'bram.testpersoon@example.com', phone: '06-00000102', birthday: '07/02', location: 'uden', tags: ['app2000', 'uden'], emailStatus: 'unsubscribed', smsStatus: 'none', confirmedDaysAgo: 230 },
  { id: 'k3', first: 'Chantal', last: 'Demo', email: 'chantal.demo@example.com', phone: '06-00000103', birthday: '11/29', location: 'nijmegen', tags: ['app2000', 'acne', 'nijmegen'], emailStatus: 'subscribed', smsStatus: 'none', confirmedDaysAgo: 61 },
  { id: 'k4', first: 'Daan', last: 'Proef', email: 'daan.proef@example.com', phone: '06-00000104', birthday: '01/08', location: 'uden', tags: ['uden'], emailStatus: 'pending', smsStatus: 'none', confirmedDaysAgo: null },
  { id: 'k5', first: 'Eva', last: 'Fictief', email: 'eva.fictief@example.com', phone: '06-00000105', birthday: '05/21', location: 'nijmegen', tags: ['pigment', 'gift', 'nijmegen', 'sms'], emailStatus: 'subscribed', smsStatus: 'subscribed', confirmedDaysAgo: 803 },
  { id: 'k6', first: 'Fatima', last: 'Voorbeeld', email: 'fatima.voorbeeld@example.com', phone: '06-00000106', birthday: '09/30', location: 'uden', tags: ['app2000', 'members', 'uden'], emailStatus: 'subscribed', smsStatus: 'unsubscribed', confirmedDaysAgo: 145 },
  { id: 'k7', first: 'Gijs', last: 'Testdata', email: 'gijs.testdata@example.com', phone: '06-00000107', birthday: '12/12', location: 'nijmegen', tags: ['nijmegen'], emailStatus: 'cleaned', smsStatus: 'none', confirmedDaysAgo: 977 },
  { id: 'k8', first: 'Hanna', last: 'Demo', email: 'hanna.demo@example.com', phone: '06-00000108', birthday: '04/03', location: 'nijmegen', tags: ['members', 'zo', 'nijmegen'], emailStatus: 'transactional', smsStatus: 'none', confirmedDaysAgo: null },
];

/** Unsubscribes, bounces and complaints that came back from Mailchimp and changed the client's file in the panel. */
export type BackFlow = { id: string; contact: string; kind: 'unsubscribe' | 'smsUnsubscribe' | 'bounce' | 'complaint'; minutesAgo: number; campaign: string | null };

export const BACKFLOW: BackFlow[] = [
  { id: 'f1', contact: 'k2', kind: 'unsubscribe', minutesAgo: 280, campaign: 'bf-mail' },
  { id: 'f2', contact: 'k7', kind: 'bounce', minutesAgo: 340, campaign: 'bf-mail' },
  { id: 'f3', contact: 'k6', kind: 'smsUnsubscribe', minutesAgo: 60 * 52, campaign: null },
  { id: 'f4', contact: 'k9', kind: 'complaint', minutesAgo: 60 * 75, campaign: null },
];

/** A contact who only appears in the flow back. */
export const EXTRA_CONTACTS: Record<string, { first: string; last: string }> = { k9: { first: 'Iris', last: 'Proefpersoon' } };

/* ---------- Settings ---------- */

export const SETTINGS = {
  account: 'Pure Clinics',
  audience: 'Pure Clinics cliënten',
  audienceId: 'a1b2c3d4e5',
  /** A demo key: it looks like Mailchimp's format and opens nothing. */
  apiKey: 'demo0000000000000000000000000000-us21',
  fromName: 'Pure Clinics',
  replyTo: 'info@pureclinics.nl',
  senderId: 'PureClinics',
  smsCreditsMonth: 5000,
  smsCreditsLeft: 4870,
  webhook: 'https://beheer.pureclinics.example/api/mailchimp/webhook',
};

export const SENDER_MAX = 11;

/** A Branded Sender ID: 3 to 11 letters, digits or spaces, with at least one letter. */
export const senderOk = (value: string) => /^[A-Za-z0-9 ]{3,11}$/.test(value) && /[A-Za-z]/.test(value);

/** utm_campaign from a name: lower case, ASCII, dashes. */
export const slug = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'campagne';

export const utmQuery = (channel: Channel, campaign: string, content?: string) =>
  `utm_source=mailchimp&utm_medium=${channel === 'email' ? 'email' : 'sms'}&utm_campaign=${campaign}${content ? `&utm_content=${content}` : ''}`;
