import type { CpTab } from '../campagnes/nav';
import type { ScreenId } from './nav';

/**
 * Every feature of the SkinAdmin inventory (marketing/teklif/skinadmin-ozellikler.md, modules A to Y), and the screen of
 * Pure Praktijk where it lives. The screen marks the spot with data-feature="<id>" (several ids may share one element,
 * separated by spaces), so the feature overview can jump straight to it. The label is `pk.f.<id>`.
 */
/** `campagnes`: the feature lives in Campagnes instead, at that tab (the newsletter moved there on 25 Nov). */
export type Feature = { id: string; screen: ScreenId; campagnes?: CpTab };
export type FeatureGroup = { letter: string; features: Feature[] };

const f = (screen: ScreenId, ...ids: string[]): Feature[] => ids.map((id) => ({ id, screen }));

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    letter: 'A',
    features: f('agenda', 'a.views', 'a.modes', 'a.book', 'a.note', 'a.status', 'a.drag', 'a.delete', 'a.mail', 'a.block', 'a.online', 'a.busy'),
  },
  {
    letter: 'B',
    features: f('planner', 'b.equipment', 'b.availability', 'b.prefs', 'b.multi', 'b.gap', 'b.dates', 'b.move', 'b.strict', 'b.occupancy'),
  },
  {
    letter: 'C',
    features: f(
      'portaal',
      'c.self',
      'c.intake',
      'c.auto',
      'c.links',
      'c.window',
      'c.rules',
      'c.staff',
      'c.filters',
      'c.brand',
      'c.templates',
      'c.invite',
      'c.photos',
      'c.embed',
    ),
  },
  { letter: 'D', features: f('clienten', 'd.cov', 'd.covFill', 'd.search', 'd.flags', 'd.source', 'd.foreign', 'd.log', 'd.transfer') },
  {
    letter: 'E',
    features: f(
      'dossier',
      'e.episodes',
      'e.billing',
      'e.ownprice',
      'e.template',
      'e.start',
      'e.history',
      'e.linked',
      'e.zt',
      'e.anamnesis',
      'e.log',
      'e.cosmetic',
      'e.partner',
    ),
  },
  { letter: 'F', features: f('dossier', 'f.intake', 'f.verify', 'f.health', 'f.mrsa', 'f.consent', 'f.dth', 'f.icf', 'f.allergy') },
  { letter: 'G', features: f('dossier', 'g.templates', 'g.flex', 'g.lots', 'g.canvas', 'g.checklists', 'g.injectables', 'g.annotate', 'g.complications') },
  { letter: 'H', features: f('dossier', 'h.photos', 'h.docs', 'h.plan') },
  {
    letter: 'I',
    features: [
      ...f('facturen', 'i.agenda', 'i.draft', 'i.restitutie', 'i.methods', 'i.split', 'i.combined', 'i.free', 'i.products', 'i.giftpay', 'i.layout', 'i.open'),
      ...f('instellingen', 'i.prices'),
    ],
  },
  { letter: 'J', features: [...f('facturen', 'j.credit', 'j.restnota'), ...f('declaraties', 'j.rejection', 'j.resubmit', 'j.insurer')] },
  {
    letter: 'K',
    features: f('declaraties', 'k.vecozo', 'k.bulk', 'k.status', 'k.gds', 'k.portal', 'k.anbos', 'k.gph', 'k.coding', 'k.codes', 'k.008', 'k.vat'),
  },
  { letter: 'L', features: [...f('facturen', 'l.gift', 'l.strip', 'l.packages'), ...f('rapportages', 'l.report')] },
  { letter: 'M', features: [...f('voorraad', 'm.list'), ...f('facturen', 'm.barcode', 'm.closing')] },
  { letter: 'N', features: f('voorraad', 'n.location', 'n.suppliers', 'n.order', 'n.past', 'n.access') },
  { letter: 'O', features: [...f('facturen', 'o.cash', 'o.income', 'o.deposits'), ...f('rapportages', 'o.forecast'), ...f('team', 'o.bookkeeper')] },
  {
    letter: 'P',
    features: f(
      'rapportages',
      'p.groups',
      'p.revenue',
      'p.files',
      'p.complications',
      'p.staff',
      'p.expected',
      'p.top10',
      'p.occupancy',
      'p.builder',
      'p.gift',
      'p.qualizorg',
      'p.share',
    ),
  },
  {
    letter: 'Q',
    features: [
      ...f('berichten', 'q.reminders', 'q.templates', 'q.smtp', 'q.ai'),
      // The newsletter is made in Campagnes: who gets it in Segmenten, consent and unsubscribing in Contacten, the
      // mail itself in Campagnes.
      { id: 'q.newsFilters', screen: 'berichten', campagnes: 'segmenten' },
      { id: 'q.newsConsent', screen: 'berichten', campagnes: 'contacten' },
      { id: 'q.newsContent', screen: 'berichten', campagnes: 'campagnes' },
      { id: 'q.newsSend', screen: 'berichten', campagnes: 'campagnes' },
      { id: 'q.newsUnsub', screen: 'berichten', campagnes: 'contacten' },
      ...f('berichten', 'q.notepad'),
    ],
  },
  { letter: 'R', features: [...f('portaal', 'r.directory'), ...f('instellingen', 'r.starter')] },
  { letter: 'S', features: f('team', 's.employees', 's.profiles', 's.agendaAccess', 's.twofa', 's.lockout', 's.schedules') },
  { letter: 'T', features: f('instellingen', 't.locations', 't.five', 't.perLocation') },
  { letter: 'U', features: f('instellingen', 'u.clinic', 'u.conditions', 'u.treatments', 'u.practice') },
  { letter: 'V', features: [...f('clienten', 'v.merge', 'v.delete'), ...f('dossier', 'v.mergeEpisodes'), ...f('instellingen', 'v.import')] },
  {
    letter: 'W',
    features: f(
      'instellingen',
      'w.vecozo',
      'w.zorgdomein',
      'w.zorgmail',
      'w.qualizorg',
      'w.boekhouding',
      'w.bi',
      'w.api',
      'w.suppliers',
      'w.teamviewer',
      'w.erecept',
    ),
  },
  { letter: 'X', features: f('instellingen', 'x.cert', 'x.dpa', 'x.hosting', 'x.log', 'x.status', 'x.igj') },
  { letter: 'Y', features: f('instellingen', 'y.forum', 'y.help', 'y.webinars', 'y.helpdesk') },
];

export const FEATURES: Feature[] = FEATURE_GROUPS.flatMap((g) => g.features);

/** What Pure has and SkinAdmin lacks; label `pk.f.<id>`, shown with data-feature="<id>" on its screen. */
export const EXTRAS: Feature[] = [
  { id: 'more.languages', screen: 'instellingen' },
  { id: 'more.app', screen: 'portaal' },
  { id: 'more.whatsapp', screen: 'berichten' },
  { id: 'more.mollie', screen: 'portaal' },
  { id: 'more.calendar', screen: 'team' },
  { id: 'more.membership', screen: 'clienten' },
  { id: 'more.waitlist', screen: 'agenda' },
  { id: 'more.shelf', screen: 'voorraad' },
  { id: 'more.forecast', screen: 'voorraad' },
  { id: 'more.sales', screen: 'voorraad' },
  { id: 'more.request', screen: 'voorraad' },
  { id: 'more.reviews', screen: 'voorraad' },
];

/** The features that live on one screen, in inventory order. */
export const featuresOf = (screen: ScreenId) => [...FEATURES, ...EXTRAS].filter((x) => x.screen === screen);
