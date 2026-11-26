import { addDays, DEALS, LASER_ZONES, LOCATIONS, packagePrice, startOfDay, type Deal, type LocationId, type Treatment } from '@pure-clinics/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError, isoDay, PART_KEY, type DayPart } from '@/api';
import { useCampaigns } from '@/campaigns';
import { Button, IconButton } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DayStrip } from '@/components/DayStrip';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Notice } from '@/components/Notice';
import { Photo } from '@/components/Photo';
import { Footer, Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { SignIn } from '@/components/SignIn';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { cityName } from '@/places';
import { treatmentOf, upcoming } from '@/requests';
import { useAccount } from '@/state/account';
import { useAvailability, useCatalog, useMyAppointments } from '@/state/remote';
import { useTheme } from '@/theme';

type Params = { treatmentId: string; location?: string; deal?: string };

const DAYS = 28;
const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];
const DEFAULT_TIMES: Record<DayPart, [string, string]> = { morning: ['09:00', '12:00'], afternoon: ['12:00', '17:00'], evening: ['17:00', '21:00'] };

export default function BookingScreen() {
  const params = useLocalSearchParams<Params>();
  const treatment = treatmentOf(params.treatmentId);
  if (!treatment) return <Redirect href="/boeken" />;
  return <Booking treatment={treatment} params={params} />;
}

/** When Huidly cannot be reached: the days the clinic is open, so the form still makes sense (sending will say why not). */
function byOpeningHours(locationId: LocationId, from: Date): Map<string, DayPart[]> {
  const location = LOCATIONS.find((l) => l.id === locationId);
  const out = new Map<string, DayPart[]>();
  for (let i = 0; i < DAYS; i++) {
    const day = addDays(from, i);
    const h = location?.hours[day.getDay()];
    if (!h) continue;
    const spans: [DayPart, number, number][] = [
      ['morning', 0, 12],
      ['afternoon', 12, 17],
      ['evening', 17, 24],
    ];
    out.set(
      isoDay(day),
      spans.filter(([, a, b]) => h.open < b && h.close > a + 0.5).map(([id]) => id),
    );
  }
  return out;
}

/**
 * Afspraak aanvragen: treatment, clinic, a day and part of the day from Huidly's availability, and a note. The request
 * lands in Pure's program (Kliniek › Agenda › Aanvragen), where the team confirms the exact time; the app never
 * promises a slot. Laser zones and a chosen deal travel along in the note.
 */
function Booking({ treatment, params }: { treatment: Treatment; params: Params }) {
  const theme = useTheme();
  const { t, text, euro, dateShort, untilDay } = useI18n();
  const { me, signOut } = useAccount();
  const catalog = useCatalog();
  const { dealsFor } = useCampaigns();
  const mine = useMyAppointments();

  // Where somebody gives this treatment, as Huidly knows it.
  const givenAt = catalog.data?.treatments.find((tr) => tr.id === treatment.id)?.locations;
  const places = LOCATIONS.filter((l) => !givenAt || givenAt.includes(l.id));
  const [locationId, setLocationId] = useState<LocationId>(() => places.find((l) => l.id === params.location)?.id ?? places[0]?.id ?? 'nijmegen');
  const place = places.find((l) => l.id === locationId) ?? places[0];

  const tomorrow = useMemo(() => addDays(startOfDay(new Date()), 1), []);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(tomorrow, i)), [tomorrow]);
  const availability = useAvailability(treatment.id, locationId, DAYS);
  const open = useMemo(
    () => (availability.data ? new Map(availability.data.map((d) => [d.date, d.parts])) : availability.error ? byOpeningHours(locationId, tomorrow) : null),
    [availability.data, availability.error, locationId, tomorrow],
  );
  const partsOn = (day: string | null) => (day && open?.get(day)) || [];

  const [day, setDay] = useState<string | null>(null);
  const [part, setPart] = useState<DayPart | null>(null);
  // Once the open days are known, start on the first one; a day that is no longer open is let go.
  useEffect(() => {
    if (!open) return;
    setDay((current) => (current && (open.get(current) ?? []).length ? current : (days.map(isoDay).find((d) => (open.get(d) ?? []).length > 0) ?? null)));
    setPart(null);
  }, [open, days]);

  const times = (p: DayPart) => {
    const found = catalog.data?.dayParts.find((d) => d.id === p);
    return found ? [found.from, found.to] : DEFAULT_TIMES[p];
  };

  // Laser is priced per zone. A deal from Home fixes the zones; otherwise the client picks them.
  const laser = treatment.id === 'laser';
  const [deal, setDeal] = useState<Deal | null>(() => DEALS.find((d) => d.id === params.deal) ?? null);
  const [zones, setZones] = useState<string[]>([]);
  const [pack, setPack] = useState(false);
  const zoneTotal = zones.reduce((sum, id) => sum + (LASER_ZONES.find((z) => z.id === id)?.price ?? 0), 0);
  const perTime = deal ? deal.price : pack ? packagePrice(zoneTotal) : zoneTotal;
  const needsZone = laser && !deal && zones.length === 0;

  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const campaignDeals = dealsFor(treatment.id);
  const booked = upcoming(mine.data);

  const ready = Boolean(me && day && part && !needsZone && !busy);

  const send = async () => {
    if (!day || !part || !me) return;
    // The team reads Dutch, so the zones go along in Dutch whatever the app's language.
    const extras = [
      laser && deal ? `Deal: ${deal.zones.nl} (€ ${deal.price})` : null,
      laser && !deal && zones.length
        ? `Zones: ${zones.map((id) => LASER_ZONES.find((z) => z.id === id)?.name.nl ?? id).join(', ')}${pack ? ' · pakket 5+1' : ''}`
        : null,
    ].filter(Boolean);
    const fullNote = [...extras, note.trim()].filter(Boolean).join('\n').slice(0, 500);
    setBusy(true);
    setError(null);
    try {
      const r = await api.requestAppointment({ treatment: treatment.id, location: locationId, date: day, part, ...(fullNote ? { note: fullNote } : {}) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/bevestiging/[id]',
        params: { id: r?.appointment?.id ?? 'new', treatment: treatment.id, location: locationId, date: day, part },
      });
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, { error: 'offline' });
      setError(err);
      if (err.code === 'date-invalid') availability.reload();
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <Footer>
      {day && part ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Txt variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {`${dateShort(day)} · ${t(PART_KEY[part])} · ${place ? cityName(place) : ''}`}
          </Txt>
          <Txt variant="small" color={theme.c.muted}>
            {laser && (deal || zones.length) ? euro(perTime) : treatment.priceFrom ? t('clinic.price.from', { price: euro(treatment.priceFrom) }) : t('clinic.price.free')}
          </Txt>
        </View>
      ) : null}
      {error ? <Notice error={error} /> : null}
      <Button label={t('requestBooking')} disabled={!ready} onPress={send} />
      <Txt variant="caption" color={theme.c.muted} align="center">
        {ready ? t('confirmLater') : t('fillAll')}
      </Txt>
    </Footer>
  );

  return (
    <Screen gap={22} footer={footer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label={t('common.back')} tone="surface" onPress={() => (router.canGoBack() ? router.back() : router.replace('/boeken'))} />
      </View>

      <Txt variant="display">{t('bookTitle')}</Txt>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 10 }}>
        <Photo photo={treatment.photo} style={{ width: 56, height: 68, borderRadius: theme.r.small }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{text(treatment.name)}</Txt>
          <Txt variant="small" color={theme.c.muted}>
            {`${t('common.minutes', { n: treatment.minutes })} · ${treatment.priceFrom ? t('clinic.price.from', { price: euro(treatment.priceFrom) }) : t('clinic.price.free')}`}
          </Txt>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/boeken')} hitSlop={10} style={{ paddingHorizontal: 8 }}>
          <Txt variant="smallStrong" color={theme.c.primary}>
            {t('common.change')}
          </Txt>
        </Pressable>
      </View>

      <Hint icon="leaf">{treatment.id === 'consult' ? t('intakeNote') : t('notSureNote')}</Hint>

      {campaignDeals.map(({ campaign, deal: d }, index) => (
        <View key={`${campaign.id}-${index}`} style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: theme.r.control, backgroundColor: theme.c.sand }}>
          <Icon name="ticket" size={18} color={theme.c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="smallStrong" color={theme.c.primary}>
              {campaign.until ? `${text(campaign.name)} · ${t('until', { d: untilDay(campaign.until) })}` : text(campaign.name)}
            </Txt>
            <Txt variant="small" color={theme.c.ink}>
              {text(d.text)}
            </Txt>
          </View>
        </View>
      ))}

      {treatment.insurable ? <Hint icon="wallet">{t('clinic.book.insurance')}</Hint> : null}

      {laser && deal ? <DealCard deal={deal} onChange={() => setDeal(null)} /> : null}
      {laser && !deal ? (
        <Group label={t('clinic.zones.title')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LASER_ZONES.map((z) => {
              const on = zones.includes(z.id);
              return (
                <Chip
                  key={z.id}
                  label={`${text(z.name)} · ${euro(z.price)}`}
                  icon={on ? 'check' : undefined}
                  selected={on}
                  onPress={() => setZones((list) => (on ? list.filter((x) => x !== z.id) : [...list, z.id]))}
                />
              );
            })}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: pack }}
            onPress={() => {
              Haptics.selectionAsync();
              setPack((on) => !on);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: theme.r.control,
              backgroundColor: theme.c.surface,
              borderWidth: pack ? 1.5 : 1,
              borderColor: pack ? theme.c.ink : theme.c.line,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                borderWidth: pack ? 0 : 1.5,
                borderColor: theme.c.lineStrong,
                backgroundColor: pack ? theme.c.ink : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {pack ? <Icon name="check" size={14} color={theme.c.onPrimary} strokeWidth={2.4} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="bodyStrong">{t('clinic.zones.package')}</Txt>
              <Txt variant="small" color={theme.c.muted}>
                {t('clinic.zones.hint')}
              </Txt>
            </View>
          </Pressable>
          <Txt variant="bodyStrong" color={zones.length ? theme.c.ink : theme.c.muted}>
            {zones.length ? t('clinic.zones.total', { price: euro(perTime) }) : t('clinic.zones.none')}
          </Txt>
        </Group>
      ) : null}

      {places.length > 1 ? (
        <Group label={t('stepPlace')}>
          <Segmented
            label={t('stepPlace')}
            value={locationId}
            onChange={(id) => {
              setLocationId(id);
              setDay(null);
              setPart(null);
            }}
            options={places.map((l) => ({ value: l.id, label: cityName(l), icon: 'pin' as const }))}
          />
          {place ? (
            <Txt variant="small" color={theme.c.muted}>
              {place.address}
            </Txt>
          ) : null}
        </Group>
      ) : null}

      <Group label={t('stepDay')}>
        {!open ? (
          <Txt variant="body" color={theme.c.muted}>
            {t('loading')}
          </Txt>
        ) : days.some((d) => partsOn(isoDay(d)).length) ? (
          <DayStrip
            days={days}
            selected={day ? new Date(`${day}T12:00:00`) : days[0]}
            onSelect={(d) => {
              setDay(isoDay(d));
              setPart(null);
            }}
            isDisabled={(d) => partsOn(isoDay(d)).length === 0}
            isMarked={(d) => booked.some((a) => a.date === isoDay(d))}
          />
        ) : (
          <Notice text={t('bookNoDays')} />
        )}
      </Group>

      {open && day ? (
        <Group label={t('bookPart')}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PARTS.map((p) => {
              const possible = partsOn(day).includes(p);
              const active = part === p;
              const [from, to] = times(p);
              return (
                <Pressable
                  key={p}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active, disabled: !possible }}
                  disabled={!possible}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPart(p);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 64,
                    borderRadius: theme.r.control,
                    backgroundColor: active ? theme.c.ink : theme.c.surface,
                    borderWidth: active ? 0 : 1,
                    borderColor: theme.c.line,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    opacity: !possible ? 0.35 : pressed ? 0.8 : 1,
                  })}
                >
                  <Txt variant="bodyStrong" color={active ? theme.c.onPrimary : theme.c.ink}>
                    {t(PART_KEY[p])}
                  </Txt>
                  <Txt variant="caption" color={active ? theme.c.onPrimary : theme.c.muted}>
                    {`‎${from}–${to}`}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Group>
      ) : null}

      <Field label={t('stepNote')} hint={t('optional')} value={note} onChangeText={(v) => setNote(v.slice(0, 450))} multiline placeholder={t('bookNoteHint')} />

      <Group label={t('stepYou')}>
        {me ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: theme.r.card, backgroundColor: theme.c.surface }}>
            <Icon name="user" size={20} color={theme.c.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="bodyStrong">{me.name}</Txt>
              <Txt variant="small" color={theme.c.muted}>
                {[me.email, me.phone].filter(Boolean).join(' · ')}
              </Txt>
            </View>
            <Pressable accessibilityRole="button" onPress={() => signOut()} hitSlop={8}>
              <Txt variant="smallStrong" color={theme.c.primary}>
                {t('notYou')}
              </Txt>
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: 16, borderRadius: theme.r.card, backgroundColor: theme.c.surface }}>
            <SignIn intro={t('signInToBook')} />
          </View>
        )}
      </Group>
    </Screen>
  );
}

function Hint({ icon, children }: { icon: 'leaf' | 'wallet'; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: theme.r.control, borderWidth: 1, borderColor: theme.c.line }}>
      <Icon name={icon} size={18} color={theme.c.primary} />
      <Txt variant="small" color={theme.c.ink} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** A laser deal chosen on Home: its zones and price, with a way back to choosing zones yourself. */
function DealCard({ deal, onChange }: { deal: Deal; onChange: () => void }) {
  const theme = useTheme();
  const { t, text, euro } = useI18n();
  return (
    <Group label={`${t('clinic.deals.eyebrow')} · ${t(`clinic.deals.${deal.group}`)}`}>
      <View style={{ backgroundColor: theme.c.sand, borderRadius: theme.r.card, padding: 16, gap: 6 }}>
        <Txt variant="heading">{text(deal.zones)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Txt variant="title">{euro(deal.price)}</Txt>
          {deal.was ? (
            <Txt variant="small" color={theme.c.muted} style={{ textDecorationLine: 'line-through' }}>
              {t('clinic.deals.was', { price: euro(deal.was) })}
            </Txt>
          ) : null}
        </View>
        <Txt variant="caption" color={theme.c.muted}>
          {t('clinic.deals.note')}
        </Txt>
        <Pressable accessibilityRole="button" onPress={onChange} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <Txt variant="smallStrong" color={theme.c.primary}>
            {t('clinic.zones.title')}
          </Txt>
        </Pressable>
      </View>
    </Group>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Txt variant="eyebrow" color={theme.c.muted}>
        {label}
      </Txt>
      {children}
    </View>
  );
}
