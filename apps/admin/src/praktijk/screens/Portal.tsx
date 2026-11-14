import {
  addDays,
  LOCATIONS,
  MEMBER,
  SPECIALISTS,
  specialistsFor,
  TREATMENTS,
  treatmentById,
  type LocationId,
  type SpecialistId,
  type TreatmentId,
} from '@pure-clinics/shared';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import { useI18n } from '../../i18n';
import { personName, rng } from '../../data/random';
import { usePraktijk, useShared } from '../context';
import { onlineBookings, seedAgenda } from '../data/agenda';
import { AGENDAS, cityOf, CONDITIONS, conditionById, practiceClients, roleKey, staffById, type ConditionId } from '../data/core';
import {
  DIRECTORY,
  PORTAL_EMAILS,
  PORTAL_URL,
  SEED_BRAND,
  SEED_DEPOSIT,
  SEED_OPTIONS,
  SEED_RULES,
  SEED_STAFF,
  seedBookings,
  type IntakeOption,
  type PortalEmail,
  type PriceMode,
} from '../data/portal';
import { PkIcon } from '../icons';
import { Avatar, Bar, Card, Check, Chip, copyText, Field, Modal, Seg, Stat, TableWrap, Toggle, useDecimal } from '../kit';
import { TemplateEditor, TOKEN_ARGS, type Token } from './messages/template';
import { optionPrice, optionTitle, PortalPreview, type PortalConfig } from './portal/Preview';
import './Portal.css';

type Tab = 'intake' | 'rules' | 'look' | 'reach';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const FEATURE_TAB: Record<string, Tab> = {
  'c.intake': 'intake',
  'c.auto': 'intake',
  'c.links': 'intake',
  'c.window': 'rules',
  'c.rules': 'rules',
  'c.staff': 'rules',
  'c.filters': 'rules',
  'more.mollie': 'rules',
  'c.brand': 'look',
  'c.photos': 'look',
  'c.templates': 'look',
  'c.invite': 'reach',
  'c.embed': 'reach',
  'r.directory': 'reach',
  'more.app': 'reach',
};

const EMAIL_TOKENS: Token[] = ['voornaam', 'datum', 'tijd', 'behandeling', 'locatie', 'specialist', 'link'];

/** Online boeken: what clients can book online, under which rules, and how the portal looks; with a live preview. */
export function PortalScreen() {
  const i18n = useI18n();
  const { t, num } = i18n;
  const { now, today, target } = usePraktijk();
  const [tab, setTab] = useState<Tab>('intake');

  const [live, setLive] = useState(true);
  const [options, setOptions] = useState<IntakeOption[]>(SEED_OPTIONS);
  const [rules, setRules] = useState(SEED_RULES);
  const [staff, setStaff] = useState(SEED_STAFF);
  const [order, setOrder] = useState<SpecialistId[]>(SPECIALISTS.map((s) => s.id));
  const [orderMode, setOrderMode] = useState<'fixed' | 'random'>('fixed');
  const [locations, setLocations] = useState<Record<LocationId, boolean>>({ nijmegen: true, uden: true });
  const [agendas, setAgendas] = useState<Record<SpecialistId, boolean>>(
    () => Object.fromEntries(AGENDAS.map((a) => [a.id, true])) as Record<SpecialistId, boolean>,
  );
  const [brand, setBrand] = useState(SEED_BRAND);
  const [deposit, setDeposit] = useState(SEED_DEPOSIT);
  const [payOnline, setPayOnline] = useState(true);
  const [photos, setPhotos] = useState(true);
  const [bookings, setBookings] = useState(() => seedBookings(today));

  useEffect(() => {
    const next = target?.feature ? FEATURE_TAB[target.feature] : undefined;
    if (next) setTab(next);
  }, [target?.at]);

  const cfg: PortalConfig = { live, options, rules, staff, order, orderMode, locations, agendas, brand, deposit, payOnline, photos };

  // The same online bookings as the Agenda's 28-day counter, so both screens give one number.
  const [agendaState] = useShared('agenda', () => seedAgenda(today));
  const stats = useMemo(() => {
    const list = onlineBookings(today, now, agendaState);
    const fresh = list.filter((b) => b.appt.treatment.id === 'consult').length;
    const app = list.filter((b) => rng(`online-app-${b.appt.id}`)() < 0.37).length;
    return { online: list.length, fresh, app };
  }, [today, agendaState]);

  const tabs = [
    { value: 'intake' as const, label: t('pk.portaal.tab.intake'), icon: 'clipboard' as const },
    { value: 'rules' as const, label: t('pk.portaal.tab.rules'), icon: 'sliders' as const },
    { value: 'look' as const, label: t('pk.portaal.tab.look'), icon: 'sparkle' as const },
    { value: 'reach' as const, label: t('pk.portaal.tab.reach'), icon: 'send' as const },
  ];

  return (
    <div className="pk-po">
      <div className="pk-stats">
        <Stat label={t('pk.portaal.stat.online')} value={num(stats.online)} sub={t('pk.portaal.stat.onlineSub')} />
        <Stat label={t('pk.portaal.stat.new')} value={num(stats.fresh)} sub={t('pk.portaal.stat.newSub')} />
        <Stat
          label={t('pk.portaal.stat.options')}
          value={num(options.length)}
          sub={t('pk.portaal.stat.optionsSub', { n: options.filter((o) => o.visible).length })}
        />
        <div className="pk-stat">
          <span className="eyebrow">{t('pk.portaal.stat.status')}</span>
          <strong className={live ? 'pk-po-live' : 'pk-muted'}>{live ? t('pk.portaal.stat.live') : t('pk.portaal.stat.paused')}</strong>
          <Toggle checked={live} onChange={setLive} label={<small>{t('pk.portaal.stat.toggle')}</small>} />
        </div>
      </div>

      <div className="pk-po-layout">
        <div className="pk-po-settings">
          <Seg variant="tabs" value={tab} options={tabs} onChange={setTab} label={t('pk.portaal.tabs')} />
          {tab === 'intake' ? (
            <>
              <IntakeCard options={options} onOptions={setOptions} />
              <AutoCard options={options} />
              <LinksCard options={options} />
            </>
          ) : null}
          {tab === 'rules' ? (
            <>
              <div className="pk-grid">
                <WindowCard rules={rules} onRules={setRules} now={now} />
                <RulesCard rules={rules} onRules={setRules} />
              </div>
              <StaffCard
                staff={staff}
                onStaff={setStaff}
                order={order}
                onOrder={setOrder}
                orderMode={orderMode}
                onOrderMode={setOrderMode}
              />
              <FiltersCard locations={locations} onLocations={setLocations} agendas={agendas} onAgendas={setAgendas} />
              <PayCard deposit={deposit} onDeposit={setDeposit} payOnline={payOnline} onPayOnline={setPayOnline} />
            </>
          ) : null}
          {tab === 'look' ? (
            <>
              <BrandCard brand={brand} onBrand={setBrand} />
              <PhotosCard photos={photos} onPhotos={setPhotos} />
              <EmailCard />
            </>
          ) : null}
          {tab === 'reach' ? (
            <>
              <InviteCard />
              <EmbedCard primary={brand.primary} />
              <div className="pk-grid">
                <DirectoryCard />
                <AppCard bookings={stats.app} />
              </div>
            </>
          ) : null}
        </div>

        <aside className="pk-po-preview">
          <span className="eyebrow">{t('pk.portaal.pv.eyebrow')}</span>
          <p className="pk-po-preview-hint">{t('pk.portaal.pv.hint')}</p>
          <PortalPreview cfg={cfg} now={now} bookings={bookings} onBookings={setBookings} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- Intake options ---------- */

const emptyOption = (): IntakeOption => ({
  id: `opt-${Date.now()}`,
  title: null,
  condition: 'acne',
  treatment: 'consult',
  practitioner: 'any',
  price: 'free',
  priceText: '',
  featured: false,
  visible: true,
});

function IntakeCard({ options, onOptions }: { options: IntakeOption[]; onOptions: (next: IntakeOption[]) => void }) {
  const i18n = useI18n();
  const { t, text } = i18n;
  const { demo } = usePraktijk();
  const [editing, setEditing] = useState<{ option: IntakeOption; isNew: boolean } | null>(null);

  const save = (o: IntakeOption) => {
    onOptions(editing?.isNew ? [...options, o] : options.map((x) => (x.id === o.id ? o : x)));
    setEditing(null);
    demo(t('pk.portaal.intake.saved'));
  };

  return (
    <Card
      feature="c.intake"
      eyebrow={t('pk.portaal.intake.eyebrow')}
      title={t('pk.portaal.intake.title')}
      help={t('pk.portaal.intake.help')}
      actions={
        <button className="btn btn-primary btn-small" onClick={() => setEditing({ option: emptyOption(), isNew: true })}>
          <PkIcon name="plus" size={15} />
          {t('pk.portaal.intake.add')}
        </button>
      }
    >
      <TableWrap label={t('pk.portaal.intake.eyebrow')}>
        <table className="pk-table">
          <thead>
            <tr>
              <th>{t('pk.portaal.intake.visible')}</th>
              <th>{t('pk.portaal.intake.option')}</th>
              <th>{t('pk.common.condition')}</th>
              <th>{t('pk.portaal.intake.practitioner')}</th>
              <th>{t('pk.common.price')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.id}>
                <td>
                  <button
                    type="button"
                    role="switch"
                    className="pk-switch"
                    aria-checked={o.visible}
                    aria-label={t('pk.portaal.intake.visibleField')}
                    onClick={() => onOptions(options.map((x) => (x.id === o.id ? { ...x, visible: !x.visible } : x)))}
                  >
                    <i />
                  </button>
                </td>
                <td>
                  <div className="pk-po-opt">
                    <b>{optionTitle(o, i18n)}</b>
                    {o.title ? <span className="pk-muted pk-small">{text(treatmentById(o.treatment).name)}</span> : null}
                  </div>
                  {o.featured ? <Chip tone="brand" icon="star">{t('pk.portaal.intake.featured')}</Chip> : null}
                </td>
                <td>{t(conditionById(o.condition).label)}</td>
                <td>{o.practitioner === 'any' ? <span className="pk-muted">{t('pk.portaal.intake.anyone')}</span> : staffById(o.practitioner).name}</td>
                <td className="nowrap">{optionPrice(o, i18n)}</td>
                <td className="end">
                  <button className="btn btn-ghost btn-small" onClick={() => setEditing({ option: o, isNew: false })}>
                    <PkIcon name="edit" size={14} />
                    {t('pk.common.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {editing ? (
        <OptionModal
          key={editing.option.id}
          option={editing.option}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={() => {
            onOptions(options.filter((x) => x.id !== editing.option.id));
            setEditing(null);
            demo(t('pk.portaal.intake.deleted'));
          }}
        />
      ) : null}
    </Card>
  );
}

function OptionModal({
  option,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  option: IntakeOption;
  isNew: boolean;
  onClose: () => void;
  onSave: (o: IntakeOption) => void;
  onDelete: () => void;
}) {
  const i18n = useI18n();
  const { t, text } = i18n;
  const [o, setO] = useState(option);
  const treatment = treatmentById(o.treatment);
  const givers = specialistsFor(treatment);
  const set = (patch: Partial<IntakeOption>) => setO((prev) => ({ ...prev, ...patch }));
  return (
    <Modal
      open
      title={isNew ? t('pk.portaal.intake.new') : t('pk.portaal.intake.edit')}
      onClose={onClose}
      footer={
        <>
          {!isNew ? (
            <button className="btn btn-ghost" onClick={onDelete}>
              <PkIcon name="trash" size={15} />
              {t('pk.common.delete')}
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={() => onSave(o)}>
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.portaal.intake.titleField')} hint={t('pk.portaal.intake.titleHint')} wide>
          <input className="pk-input" value={o.title ?? ''} placeholder={optionTitle({ ...o, title: null }, i18n)} onChange={(e) => set({ title: e.target.value || null })} />
        </Field>
        <Field label={t('pk.common.condition')}>
          <select className="pk-input" value={o.condition} onChange={(e) => set({ condition: e.target.value as ConditionId })}>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.common.treatment')}>
          <select
            className="pk-input"
            value={o.treatment}
            onChange={(e) => {
              const next = e.target.value as TreatmentId;
              const keep = o.practitioner === 'any' || specialistsFor(treatmentById(next)).some((s) => s.id === o.practitioner);
              set({ treatment: next, practitioner: keep ? o.practitioner : 'any', price: next === 'consult' ? 'free' : o.price === 'free' ? 'from' : o.price });
            }}
          >
            {TREATMENTS.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {text(tr.name)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.portaal.intake.practitioner')}>
          <select className="pk-input" value={o.practitioner} onChange={(e) => set({ practitioner: e.target.value as SpecialistId | 'any' })}>
            <option value="any">{t('pk.portaal.intake.anyone')}</option>
            {givers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {cityOf(s.locationId)}
              </option>
            ))}
          </select>
        </Field>
        <div className="pk-field pk-field--wide">
          <span className="pk-field-label">{t('pk.portaal.intake.priceField')}</span>
          <Seg<PriceMode>
            value={o.price}
            label={t('pk.portaal.intake.priceField')}
            onChange={(price) => set({ price })}
            options={[
              { value: 'free', label: t('pk.portaal.intake.priceFree') },
              { value: 'from', label: t('pk.portaal.intake.priceFrom') },
              { value: 'text', label: t('pk.portaal.intake.priceText') },
            ]}
          />
        </div>
        {o.price === 'text' ? (
          <Field label={t('pk.portaal.intake.priceTextField')} hint={t('pk.portaal.intake.priceTextHint')} wide>
            <input className="pk-input" value={o.priceText} onChange={(e) => set({ priceText: e.target.value })} />
          </Field>
        ) : null}
        <div className="pk-field--wide pk-stack">
          <Check checked={o.featured} onChange={(featured) => set({ featured })} label={t('pk.portaal.intake.featuredField')} />
          <Check checked={o.visible} onChange={(visible) => set({ visible })} label={t('pk.portaal.intake.visibleField')} />
        </div>
      </div>
    </Modal>
  );
}

/** What a first booking creates by itself: the client file, an episode with its care-trajectory number, the appointment. */
function AutoCard({ options }: { options: IntakeOption[] }) {
  const i18n = useI18n();
  const { t, dateShort, clock } = i18n;
  const { today } = usePraktijk();
  const [on, setOn] = useState(true);
  const option = options.find((o) => o.visible && o.treatment === 'consult') ?? options[0];
  const r = rng('pk-portal-new');
  const client = personName(r);
  let day = addDays(today, 3);
  while (day.getDay() === 0) day = addDays(day, 1);
  const at = new Date(day);
  at.setHours(10, 30, 0, 0);
  const zt = `ZT-${today.getFullYear()}-${String(10000 + Math.floor(r() * 89999))}`;
  const steps = [
    { icon: 'user' as const, title: t('pk.portaal.auto.file'), body: t('pk.portaal.auto.fileBody') },
    {
      icon: 'file' as const,
      title: t('pk.portaal.auto.episode'),
      body: t('pk.portaal.auto.episodeBody', { condition: { msg: conditionById(option.condition).label }, zt, date: { date: at } }),
    },
    { icon: 'calendar' as const, title: t('pk.portaal.auto.appt'), body: t('pk.portaal.auto.apptBody', { date: dateShort(at), time: clock(at), location: 'Nijmegen' }) },
    { icon: 'mail' as const, title: t('pk.portaal.auto.intakeMail'), body: t('pk.portaal.auto.intakeMailBody') },
  ];
  return (
    <Card feature="c.auto" eyebrow={t('pk.portaal.auto.eyebrow')} title={t('pk.portaal.auto.title')} help={t('pk.portaal.auto.help')}>
      <Toggle checked={on} onChange={setOn} label={t('pk.portaal.auto.toggle')} />
      <p className="pk-po-example">{t('pk.portaal.auto.example', { client, option: optionTitle(option, i18n) })}</p>
      <ol className={`pk-po-flow ${on ? '' : 'is-off'}`}>
        {steps.map((s) => (
          <li key={s.title}>
            <span className="pk-po-flow-icon">
              <PkIcon name={s.icon} size={16} />
            </span>
            <b>{s.title}</b>
            <small>{s.body}</small>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function CopyRow({ label, url }: { label: string; url: string }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  return (
    <li className="pk-po-link">
      <span className="pk-po-link-label">{label}</span>
      <code className="pk-mono pk-po-url">{url}</code>
      <button
        className="btn btn-ghost btn-small"
        aria-label={`${t('pk.portaal.links.copy')}: ${label}`}
        onClick={async () => {
          await copyText(url);
          demo(t('pk.portaal.links.copied'));
        }}
      >
        <PkIcon name="copy" size={14} />
        {t('pk.common.copy')}
      </button>
    </li>
  );
}

function LinksCard({ options }: { options: IntakeOption[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [redirectOn, setRedirectOn] = useState(true);
  const [redirect, setRedirect] = useState('https://pureclinics.nl/');
  return (
    <Card
      feature="c.links"
      eyebrow={t('pk.portaal.links.eyebrow')}
      title={t('pk.portaal.links.title')}
      help={t('pk.portaal.links.help')}
      actions={<Chip tone="outline" icon="info">{t('pk.portaal.links.demo')}</Chip>}
    >
      <ul className="pk-po-links">
        <CopyRow label={t('pk.portaal.links.all')} url={PORTAL_URL} />
        {LOCATIONS.map((l) => (
          <CopyRow key={l.id} label={t('pk.portaal.links.clinic', { city: l.city })} url={`${PORTAL_URL}?locatie=${l.id}`} />
        ))}
        {options
          .filter((o) => o.visible)
          .map((o) => (
            <CopyRow key={o.id} label={t('pk.portaal.links.option', { option: optionTitle(o, i18n) })} url={`${PORTAL_URL}?intake=${o.id}`} />
          ))}
      </ul>
      <div className="pk-po-redirect">
        <Toggle checked={redirectOn} onChange={setRedirectOn} label={t('pk.portaal.links.redirectOn')} hint={t('pk.portaal.links.redirectHint')} />
        <Field label={t('pk.portaal.links.redirect')}>
          <input className="pk-input pk-mono" dir="ltr" value={redirect} disabled={!redirectOn} onChange={(e) => setRedirect(e.target.value)} />
        </Field>
      </div>
    </Card>
  );
}

/* ---------- Rules ---------- */

type RulesProps = { rules: typeof SEED_RULES; onRules: (next: typeof SEED_RULES) => void };

function WindowCard({ rules, onRules, now }: RulesProps & { now: Date }) {
  const { t, dateShort, clock } = useI18n();
  const from = new Date(now.getTime() + rules.minHours * 3600000);
  const until = addDays(now, rules.maxWeeks * 7);
  return (
    <Card feature="c.window" className="span-6" eyebrow={t('pk.portaal.window.eyebrow')} title={t('pk.portaal.window.title')}>
      <div className="pk-form">
        <Field label={t('pk.portaal.window.min')}>
          <select className="pk-input" value={rules.minHours} onChange={(e) => onRules({ ...rules, minHours: Number(e.target.value) })}>
            {[0, 2, 4, 12, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h === 0 ? t('pk.portaal.window.now') : t('pk.portaal.window.hours', { n: h })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pk.portaal.window.max')}>
          <select className="pk-input" value={rules.maxWeeks} onChange={(e) => onRules({ ...rules, maxWeeks: Number(e.target.value) })}>
            {[2, 4, 8, 12, 26, 52].map((w) => (
              <option key={w} value={w}>
                {t('pk.portaal.window.weeks', { n: w })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="pk-po-explain">
        <PkIcon name="clock" size={15} />
        {t('pk.portaal.window.explain', { from: `${dateShort(from)} ${clock(from)}`, until: dateShort(until) })}
      </p>
    </Card>
  );
}

function RulesCard({ rules, onRules }: RulesProps) {
  const { t } = useI18n();
  const hours = [2, 12, 24, 48, 72];
  return (
    <Card feature="c.rules" className="span-6" eyebrow={t('pk.portaal.rules.eyebrow')} title={t('pk.portaal.rules.title')}>
      <Toggle checked={rules.allowReschedule} onChange={(allowReschedule) => onRules({ ...rules, allowReschedule })} label={t('pk.portaal.rules.reschedule')} />
      <select
        className="pk-input pk-po-inline-select"
        aria-label={`${t('pk.portaal.rules.deadline')}: ${t('pk.portaal.rules.reschedule')}`}
        value={rules.rescheduleHours}
        disabled={!rules.allowReschedule}
        onChange={(e) => onRules({ ...rules, rescheduleHours: Number(e.target.value) })}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {t('pk.portaal.rules.until', { n: h })}
          </option>
        ))}
      </select>
      <Toggle checked={rules.allowCancel} onChange={(allowCancel) => onRules({ ...rules, allowCancel })} label={t('pk.portaal.rules.cancel')} />
      <select
        className="pk-input pk-po-inline-select"
        aria-label={`${t('pk.portaal.rules.deadline')}: ${t('pk.portaal.rules.cancel')}`}
        value={rules.cancelHours}
        disabled={!rules.allowCancel}
        onChange={(e) => onRules({ ...rules, cancelHours: Number(e.target.value) })}
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {t('pk.portaal.rules.until', { n: h })}
          </option>
        ))}
      </select>
      <p className="pk-po-explain">
        <PkIcon name="info" size={15} />
        {t('pk.portaal.rules.explain')}
      </p>
    </Card>
  );
}

function StaffCard({
  staff,
  onStaff,
  order,
  onOrder,
  orderMode,
  onOrderMode,
}: {
  staff: typeof SEED_STAFF;
  onStaff: (next: typeof SEED_STAFF) => void;
  order: SpecialistId[];
  onOrder: (next: SpecialistId[]) => void;
  orderMode: 'fixed' | 'random';
  onOrderMode: (mode: 'fixed' | 'random') => void;
}) {
  const { t } = useI18n();
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onOrder(next);
  };
  return (
    <Card
      feature="c.staff"
      eyebrow={t('pk.portaal.staff.eyebrow')}
      title={t('pk.portaal.staff.title')}
      help={t('pk.portaal.staff.help')}
      actions={
        <Seg
          value={orderMode}
          label={t('pk.portaal.staff.order')}
          onChange={onOrderMode}
          options={[
            { value: 'fixed', label: t('pk.portaal.staff.fixed') },
            { value: 'random', label: t('pk.portaal.staff.random'), icon: 'repeat' },
          ]}
        />
      }
    >
      <ol className="pk-po-staff">
        {order.map((id, index) => {
          const s = staffById(id);
          const setting = staff[id];
          return (
            <li key={id} className={setting.excluded ? 'is-off' : ''}>
              {orderMode === 'fixed' ? <span className="pk-po-rank pk-num">{index + 1}</span> : null}
              <Avatar staff={s} size={34} />
              <span className="pk-po-staff-name">
                <b>{s.name}</b>
                <small>
                  {t(roleKey(s.role))} · {cityOf(s.locationId)}
                </small>
              </span>
              {setting.excluded ? <Chip tone="outline">{t('pk.portaal.staff.excluded')}</Chip> : setting.hidden ? <Chip tone="brand">{t('pk.portaal.staff.hidden')}</Chip> : null}
              <span className="pk-po-staff-actions">
                <Check checked={setting.excluded} onChange={(excluded) => onStaff({ ...staff, [id]: { ...setting, excluded } })} label={t('pk.portaal.staff.exclude')} />
                <Check checked={setting.hidden} onChange={(hidden) => onStaff({ ...staff, [id]: { ...setting, hidden } })} label={t('pk.portaal.staff.hide')} />
                {orderMode === 'fixed' ? (
                  <span className="pk-po-move">
                    <button className="icon-button small" disabled={index === 0} aria-label={t('pk.portaal.staff.up', { name: s.name })} onClick={() => move(index, -1)}>
                      <PkIcon name="up" size={15} />
                    </button>
                    <button
                      className="icon-button small"
                      disabled={index === order.length - 1}
                      aria-label={t('pk.portaal.staff.down', { name: s.name })}
                      onClick={() => move(index, 1)}
                    >
                      <PkIcon name="down" size={15} />
                    </button>
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function FiltersCard({
  locations,
  onLocations,
  agendas,
  onAgendas,
}: {
  locations: Record<LocationId, boolean>;
  onLocations: (next: Record<LocationId, boolean>) => void;
  agendas: Record<SpecialistId, boolean>;
  onAgendas: (next: Record<SpecialistId, boolean>) => void;
}) {
  const { t } = useI18n();
  return (
    <Card feature="c.filters" eyebrow={t('pk.portaal.filters.eyebrow')} title={t('pk.portaal.filters.title')} help={t('pk.portaal.filters.help')}>
      <div className="pk-po-filters">
        {LOCATIONS.map((l) => (
          <div key={l.id} className="pk-po-filter">
            <Toggle checked={locations[l.id]} onChange={(on) => onLocations({ ...locations, [l.id]: on })} label={<b>{t('pk.portaal.filters.location', { city: l.city })}</b>} hint={l.address} />
            <div className="pk-po-agendas">
              {AGENDAS.filter((a) => a.locationId === l.id).map((a) => (
                <label key={a.id} className={`pk-check ${locations[l.id] ? '' : 'is-disabled'}`}>
                  <input type="checkbox" disabled={!locations[l.id]} checked={agendas[a.id]} onChange={(e) => onAgendas({ ...agendas, [a.id]: e.target.checked })} />
                  <span>{a.beauty ? t('pk.portaal.filters.beauty', { name: a.staff.name }) : t('pk.portaal.filters.room', { n: a.index + 1, name: a.staff.name })}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PayCard({
  deposit,
  onDeposit,
  payOnline,
  onPayOnline,
}: {
  deposit: typeof SEED_DEPOSIT;
  onDeposit: (next: typeof SEED_DEPOSIT) => void;
  payOnline: boolean;
  onPayOnline: (on: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Card
      feature="more.mollie"
      eyebrow={t('pk.portaal.pay.eyebrow')}
      title={t('pk.portaal.pay.title')}
      help={t('pk.portaal.pay.help')}
      actions={<Chip tone="warn" icon="card">{t('pk.portaal.pay.test')}</Chip>}
    >
      <Toggle checked={payOnline} onChange={onPayOnline} label={t('pk.portaal.pay.online')} hint="iDEAL · Visa · Mastercard · Bancontact" />
      <Toggle checked={deposit.on} onChange={(on) => onDeposit({ ...deposit, on })} label={t('pk.portaal.pay.deposit')} hint={t('pk.portaal.pay.free')} />
      {deposit.on ? (
        <div className="pk-row pk-po-deposit">
          <Seg
            value={deposit.mode}
            label={t('pk.portaal.pay.deposit')}
            onChange={(mode) => onDeposit({ ...deposit, mode, value: mode === 'percent' ? 20 : 25 })}
            options={[
              { value: 'amount', label: t('pk.portaal.pay.amount') },
              { value: 'percent', label: t('pk.portaal.pay.percent') },
            ]}
          />
          <label className="pk-po-amount">
            <span className="pk-field-label">{t('pk.portaal.pay.value')}</span>
            <span className="pk-po-amount-box">
              {deposit.mode === 'amount' ? <span>€</span> : null}
              <input
                className="pk-input"
                type="number"
                min={0}
                max={deposit.mode === 'percent' ? 100 : 500}
                value={deposit.value}
                onChange={(e) => onDeposit({ ...deposit, value: Math.max(0, Number(e.target.value)) })}
              />
              {deposit.mode === 'percent' ? <span>%</span> : null}
            </span>
          </label>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------- Look and e-mails ---------- */

function BrandCard({ brand, onBrand }: { brand: typeof SEED_BRAND; onBrand: (next: typeof SEED_BRAND) => void }) {
  const { t } = useI18n();
  const upload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onBrand({ ...brand, logo: URL.createObjectURL(file) });
  };
  return (
    <Card
      feature="c.brand"
      eyebrow={t('pk.portaal.brand.eyebrow')}
      title={t('pk.portaal.brand.title')}
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => onBrand({ ...SEED_BRAND })}>
          <PkIcon name="undo" size={14} />
          {t('pk.portaal.brand.reset')}
        </button>
      }
    >
      <div className="pk-form">
        <Field label={t('pk.portaal.brand.primary')}>
          <span className="pk-po-color">
            <input type="color" value={brand.primary} onChange={(e) => onBrand({ ...brand, primary: e.target.value.toUpperCase() })} />
            <code className="pk-mono">{brand.primary}</code>
          </span>
        </Field>
        <Field label={t('pk.portaal.brand.accent')}>
          <span className="pk-po-color">
            <input type="color" value={brand.accent} onChange={(e) => onBrand({ ...brand, accent: e.target.value.toUpperCase() })} />
            <code className="pk-mono">{brand.accent}</code>
          </span>
        </Field>
        <Field label={t('pk.portaal.brand.addresses')}>
          <select className="pk-input" value={brand.addresses} onChange={(e) => onBrand({ ...brand, addresses: e.target.value as 'all' | 'selected' })}>
            <option value="all">{t('pk.portaal.brand.addressesAll')}</option>
            <option value="selected">{t('pk.portaal.brand.addressesSelected')}</option>
          </select>
        </Field>
        <div className="pk-field pk-field--wide">
          <span className="pk-field-label">{t('pk.portaal.brand.logo')}</span>
          <div className="pk-row">
            <button className={`btn btn-small ${brand.logo ? 'btn-ghost' : 'btn-primary'}`} onClick={() => onBrand({ ...brand, logo: null })}>
              {t('pk.portaal.brand.wordmark')}
            </button>
            <label className="btn btn-ghost btn-small pk-po-upload">
              <PkIcon name="upload" size={14} />
              {t('pk.portaal.brand.upload')}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={upload} />
            </label>
            {brand.logo ? <img className="pk-po-logo-thumb" src={brand.logo} alt="" /> : null}
          </div>
          <small className="pk-field-hint">{t('pk.portaal.brand.uploadHint')}</small>
        </div>
      </div>
    </Card>
  );
}

function PhotosCard({ photos, onPhotos }: { photos: boolean; onPhotos: (on: boolean) => void }) {
  const { t } = useI18n();
  return (
    <Card feature="c.photos" eyebrow={t('pk.portaal.photos.eyebrow')} title={t('pk.portaal.photos.title')}>
      <Toggle checked={photos} onChange={onPhotos} label={t('pk.portaal.photos.toggle')} hint={t('pk.portaal.photos.hint')} />
      <div className={`pk-po-ba pk-po-ba--wide ${photos ? '' : 'is-off'}`}>
        <span className="pk-po-ba-tile pk-po-ba-tile--before">{t('pk.portaal.photos.before')}</span>
        <span className="pk-po-ba-tile pk-po-ba-tile--after">{t('pk.portaal.photos.after')}</span>
      </div>
    </Card>
  );
}

type Draft = { subject: string | null; body: string | null };
const MAIL_LABEL: Record<PortalEmail, 'pk.portaal.mail.confirmNew' | 'pk.portaal.mail.confirmExisting' | 'pk.portaal.mail.cancel' | 'pk.portaal.mail.password'> = {
  confirmNew: 'pk.portaal.mail.confirmNew',
  confirmExisting: 'pk.portaal.mail.confirmExisting',
  cancel: 'pk.portaal.mail.cancel',
  password: 'pk.portaal.mail.password',
};

function EmailCard() {
  const i18n = useI18n();
  const { t, text, dateShort } = i18n;
  const { today } = usePraktijk();
  const [which, setWhich] = useState<PortalEmail>('confirmNew');
  const [drafts, setDrafts] = useState<Record<PortalEmail, Draft>>(
    () => Object.fromEntries(PORTAL_EMAILS.map((e) => [e, { subject: null, body: null }])) as Record<PortalEmail, Draft>,
  );
  const draft = drafts[which];
  const subject = draft.subject ?? t(`pk.portaal.tpl.${which}.subject`, TOKEN_ARGS);
  const body = draft.body ?? t(`pk.portaal.tpl.${which}.body`, TOKEN_ARGS);
  const sampleDay = addDays(today, 4);
  const sample = {
    voornaam: MEMBER.firstName,
    datum: dateShort(sampleDay),
    tijd: '14:30',
    behandeling: text(treatmentById('acne').name),
    locatie: 'Nijmegen',
    specialist: 'Loubna',
    link: PORTAL_URL,
  };
  const update = (patch: Partial<Draft>) => setDrafts({ ...drafts, [which]: { ...draft, ...patch } });
  return (
    <Card feature="c.templates" eyebrow={t('pk.portaal.mail.eyebrow')} title={t('pk.portaal.mail.title')}>
      <Seg
        value={which}
        label={t('pk.portaal.mail.eyebrow')}
        onChange={setWhich}
        options={PORTAL_EMAILS.map((e) => ({ value: e, label: t(MAIL_LABEL[e]) }))}
      />
      <div className="pk-po-mail">
        <TemplateEditor
          key={which}
          channel="email"
          subject={subject}
          body={body}
          onSubject={(v) => update({ subject: v })}
          onBody={(v) => update({ body: v })}
          tokens={which === 'password' ? ['voornaam', 'link'] : EMAIL_TOKENS}
          sample={sample}
          sampleName={`${MEMBER.firstName} ${MEMBER.lastName}`}
          onReset={draft.subject !== null || draft.body !== null ? () => update({ subject: null, body: null }) : undefined}
        />
      </div>
    </Card>
  );
}

/* ---------- Reach ---------- */

type Group = 'all' | LocationId | 'news';

function InviteCard() {
  const { t, num } = useI18n();
  const { today, demo } = usePraktijk();
  const [group, setGroup] = useState<Group>('all');
  const [batch, setBatch] = useState(50);
  const [run, setRun] = useState<{ done: number; total: number; log: number[] } | null>(null);
  // Members already have an account through the app; of the others, about a third has made one by now.
  const without = useMemo(() => practiceClients(today).filter((c) => !c.member && rng(`account-${c.id}`)() < 0.68), [today]);
  const list = without.filter((c) => (group === 'all' ? true : group === 'news' ? c.flags.newsletter : c.locationId === group));
  const batches = Math.max(1, Math.ceil(list.length / batch));

  useEffect(() => {
    if (!run || run.done >= run.total) return;
    const id = window.setTimeout(() => {
      const sent = Math.min(batch, list.length - run.done * batch);
      setRun({ ...run, done: run.done + 1, log: [...run.log, sent] });
      if (run.done + 1 === run.total) demo(t('pk.portaal.invite.done', { n: list.length }));
    }, 650);
    return () => window.clearTimeout(id);
  }, [run]);

  const running = run !== null && run.done < run.total;
  return (
    <Card feature="c.invite" eyebrow={t('pk.portaal.invite.eyebrow')} title={t('pk.portaal.invite.title')} help={t('pk.portaal.invite.help')}>
      <div className="pk-form">
        <Field label={t('pk.portaal.invite.group')}>
          <select
            className="pk-input"
            value={group}
            disabled={running}
            onChange={(e) => {
              setGroup(e.target.value as Group);
              setRun(null);
            }}
          >
            <option value="all">{t('pk.portaal.invite.groupAll')}</option>
            {LOCATIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {t('pk.portaal.invite.groupCity', { city: l.city })}
              </option>
            ))}
            <option value="news">{t('pk.portaal.invite.groupNews')}</option>
          </select>
        </Field>
        <Field label={t('pk.portaal.invite.batch')}>
          <select
            className="pk-input"
            value={batch}
            disabled={running}
            onChange={(e) => {
              setBatch(Number(e.target.value));
              setRun(null);
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {t('pk.portaal.invite.batchN', { n })}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="pk-row pk-row--between pk-po-invite">
        <span className="pk-muted">{t('pk.portaal.invite.count', { n: num(list.length), batches })}</span>
        <button className="btn btn-primary" disabled={running || !list.length} onClick={() => setRun({ done: 0, total: batches, log: [] })}>
          <PkIcon name="send" size={15} />
          {t('pk.portaal.invite.send')}
        </button>
      </div>
      {run ? (
        <div className="pk-po-progress">
          <Bar value={run.done} max={run.total} tone="now" />
          <span className="pk-small pk-muted">
            {running ? t('pk.portaal.invite.sending', { n: run.done + 1, total: run.total }) : t('pk.portaal.invite.done', { n: list.length })}
          </span>
          <ul className="pk-po-log">
            {run.log.map((count, i) => (
              <li key={i}>
                <PkIcon name="check" size={13} />
                {t('pk.portaal.invite.logLine', { n: i + 1, count })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function EmbedCard({ primary }: { primary: string }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const [kind, setKind] = useState<'iframe' | 'script' | 'link'>('iframe');
  const label = t('pk.portaal.embed.button');
  const code =
    kind === 'iframe'
      ? `<iframe src="${PORTAL_URL}?embed=1" title="Pure Clinics" loading="lazy"\n  style="width:100%;min-height:720px;border:0"></iframe>`
      : kind === 'script'
        ? `<script src="${PORTAL_URL}widget.js" data-kleur="${primary}" async></script>\n<button data-pure-boeken>${label}</button>`
        : `<a href="${PORTAL_URL}">${label}</a>`;
  return (
    <Card
      feature="c.embed"
      eyebrow={t('pk.portaal.embed.eyebrow')}
      title={t('pk.portaal.embed.title')}
      help={t('pk.portaal.embed.help')}
      actions={
        <Seg
          value={kind}
          label={t('pk.portaal.embed.eyebrow')}
          onChange={setKind}
          options={[
            { value: 'iframe', label: t('pk.portaal.embed.iframe') },
            { value: 'script', label: t('pk.portaal.embed.script') },
            { value: 'link', label: t('pk.portaal.embed.link') },
          ]}
        />
      }
    >
      <div className="pk-po-embed">
        <div className="pk-po-code">
          <pre dir="ltr">
            <code>{code}</code>
          </pre>
          <button
            className="btn btn-ghost btn-small"
            onClick={async () => {
              await copyText(code);
              demo(t('pk.portaal.embed.copied'));
            }}
          >
            <PkIcon name="copy" size={14} />
            {t('pk.portaal.embed.copy')}
          </button>
        </div>
        <div className="pk-po-site" aria-label={t('pk.portaal.embed.preview')}>
          <span className="eyebrow">{t('pk.portaal.embed.preview')}</span>
          <div className="pk-po-site-frame">
            <div className="pk-po-site-bar">
              <i />
              <i />
              <i />
              <span dir="ltr">pureclinics.nl</span>
            </div>
            <div className="pk-po-site-page">
              <span className="pk-po-site-nav">
                <b>PURE</b>CLINICS
                <small>{t('pk.portaal.embed.sitePage')}</small>
              </span>
              <span className="pk-po-site-line" />
              <span className="pk-po-site-line short" />
              {kind === 'iframe' ? (
                <span className="pk-po-site-embed" style={{ borderColor: primary }}>
                  <span style={{ background: primary }} />
                  <span />
                  <span />
                </span>
              ) : kind === 'script' ? (
                <span className="pk-po-site-button" style={{ background: primary }}>
                  {label}
                </span>
              ) : (
                <span className="pk-po-site-link" style={{ color: primary }}>
                  {label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function DirectoryCard() {
  const { t, num } = useI18n();
  const decimal = useDecimal();
  const { demo } = usePraktijk();
  const [profile, setProfile] = useState(true);
  const [direct, setDirect] = useState(true);
  return (
    <Card feature="r.directory" className="span-6" eyebrow={t('pk.portaal.dir.eyebrow')} title={t('pk.portaal.dir.title')} help={t('pk.portaal.dir.help')}>
      <div className={`pk-po-dir ${profile ? '' : 'is-off'}`}>
        <span className="pk-po-dir-logo">
          <b>PURE</b>
        </span>
        <span className="pk-po-dir-text">
          <b>Pure Clinics</b>
          <small>Nijmegen · Uden</small>
          <span className="pk-po-stars" aria-label={`${decimal(DIRECTORY.rating)} / 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className={i < Math.round(DIRECTORY.rating) ? 'on' : ''}>
                <PkIcon name="star" size={14} />
              </i>
            ))}
            <b>{decimal(DIRECTORY.rating)}</b>
            <small>{t('pk.portaal.dir.reviews', { n: num(DIRECTORY.reviews) })}</small>
          </span>
        </span>
      </div>
      <Toggle checked={profile} onChange={setProfile} label={t('pk.portaal.dir.profile')} />
      <Toggle checked={direct} onChange={setDirect} label={t('pk.portaal.dir.direct')} />
      <div className="pk-row">
        <button className="btn btn-ghost btn-small" onClick={() => demo()}>
          <PkIcon name="eye" size={14} />
          {t('pk.portaal.dir.open')}
        </button>
        <button
          className="btn btn-ghost btn-small"
          onClick={async () => {
            await copyText(DIRECTORY.url);
            demo(t('pk.portaal.links.copied'));
          }}
        >
          <PkIcon name="copy" size={14} />
          {t('pk.portaal.dir.copy')}
        </button>
      </div>
    </Card>
  );
}

function AppCard({ bookings }: { bookings: number }) {
  const { t, num } = useI18n();
  return (
    <Card
      feature="more.app"
      className="span-6"
      eyebrow={t('pk.portaal.app.eyebrow')}
      title={t('pk.portaal.app.title')}
      help={t('pk.portaal.app.help')}
      actions={<Chip tone="now" icon="phone">{t('pk.portaal.app.chip')}</Chip>}
    >
      <ul className="pk-po-app">
        <li>
          <PkIcon name="check" size={15} />
          {t('pk.portaal.app.same')}
        </li>
        <li>
          <PkIcon name="calendar" size={15} />
          {t('pk.portaal.app.bookings')}: <b className="pk-num">{num(bookings)}</b>
        </li>
      </ul>
    </Card>
  );
}
