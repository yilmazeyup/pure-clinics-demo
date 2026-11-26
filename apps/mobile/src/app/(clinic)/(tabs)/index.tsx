import {
  CONCERNS,
  DEALS,
  PURE_CLINICS,
  timeOfDay,
  treatmentById,
  type Concern,
  type Deal,
  type PhotoKey,
  type TreatmentId,
} from '@pure-clinics/shared';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DepthCarousel } from '@/components/Carousel';
import { Deck } from '@/components/Deck';
import { Glass } from '@/components/Glass';
import { ParallaxPhoto, SkyShade, skyPhase, useLightStatusBar } from '@/components/Hero';
import { Icon, type IconName } from '@/components/Icon';
import { PressableScale, useCountUp } from '@/components/Motion';
import { Photo } from '@/components/Photo';
import { PureLogo } from '@/components/PureLogo';
import { Screen } from '@/components/Screen';
import { SkinScan } from '@/components/SkinScan';
import { TreatmentCard } from '@/components/TreatmentCard';
import { Txt } from '@/components/Txt';
import { PART_KEY, STATUS_KEY, type RemoteAppointment } from '@/api';
import { campaignPhoto, useCampaigns, type Campaign } from '@/campaigns';
import { GiftThumb } from '@/components/CartLineRow';
import { useI18n } from '@/i18n';
import { cityOf } from '@/places';
import { treatmentOf, upcoming } from '@/requests';
import { useAccount } from '@/state/account';
import { useApp } from '@/state/app';
import { useMyAppointments } from '@/state/remote';
import { PAGE_WIDTH, useLayout } from '@/layout';
import { useTheme } from '@/theme';

const POPULAR: TreatmentId[] = ['laser', 'acne', 'couperose', 'pigment', 'skinpen', 'prx', 'facial'];
const RESULTS: { photo: PhotoKey; treatment: TreatmentId }[] = [
  { photo: 'ba-acne-1', treatment: 'acne' },
  { photo: 'ba-couperose-1', treatment: 'couperose' },
  { photo: 'ba-pigment-1', treatment: 'pigment' },
  { photo: 'ba-ipl-1', treatment: 'ipl' },
  { photo: 'ba-xlhair-1', treatment: 'xlhair' },
];

export default function HomeScreen() {
  const { wide } = useLayout();
  return wide ? <WideHome /> : <PhoneHome />;
}

/** The photo at the top takes most of the first screen on a phone, never less than 560 points. */
const phoneHeroHeight = (screen: number) => Math.round(Math.min(Math.max(screen * 0.74, 560), 680));

function PhoneHome() {
  const { height } = useWindowDimensions();
  const hero = phoneHeroHeight(height);
  return (
    <Screen padded={false} gap={36} tabs contentStyle={{ paddingTop: 0 }} photoTop={hero}>
      <Hero height={hero} />
      <Block>
        <QuickActions />
      </Block>
      <Block>
        <Campaigns />
      </Block>
      <Block>
        <ScanBanner />
      </Block>
      <Block>
        <Popular />
      </Block>
      <Block>
        <Concerns />
      </Block>
      <Block>
        <Deals />
      </Block>
      <Block>
        <Results />
      </Block>
      <Block>
        <GiftCard />
      </Block>
      <Block>
        <Consult />
      </Block>
      <Block>
        <Facts />
      </Block>
    </Screen>
  );
}

/** A computer screen: the same parts as on the phone, laid out side by side like a website. */
function WideHome() {
  const { campaigns } = useCampaigns();
  return (
    <Screen gap={48} width="page" tabs>
      <Hero height={540} />
      <QuickActions />
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
        {campaigns.length ? (
          <View style={{ flex: 1.2 }}>
            <Campaigns />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 24 }}>
          <ScanBanner />
          <GiftCard />
        </View>
      </View>
      <Popular />
      <Concerns />
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Deals />
        </View>
        <View style={{ flex: 1 }}>
          <Results />
        </View>
      </View>
      <Consult />
      <Facts />
    </Screen>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <View style={{ paddingHorizontal: 20 }}>{children}</View>;
}

function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
      <View style={{ flex: 1, gap: 6 }}>
        {eyebrow ? (
          <Txt variant="eyebrow" color={theme.c.muted}>
            {eyebrow}
          </Txt>
        ) : null}
        <Txt variant="title">{title}</Txt>
      </View>
      {action ? (
        <PressableScale onPress={action.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}>
          <Txt variant="smallStrong">{action.label}</Txt>
          <Icon name="chevron" size={15} />
        </PressableScale>
      ) : null}
    </View>
  );
}

/**
 * The opening view: the clinic's photo from the intro, tinted like the sky outside right now, with the greeting
 * and the next appointment on a pane of glass. The photo drifts slower than the page when you scroll.
 */
function Hero({ height }: { height: number }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const { t, dayLong, time } = useI18n();
  const { now } = useApp();
  const { me } = useAccount();
  const appointments = useMyAppointments();
  const next = upcoming(appointments.data)[0];
  const phase = skyPhase(now);
  useLightStatusBar(wide ? 0 : height);
  const part = timeOfDay(now);
  const firstName = me?.name?.trim().split(/\s+/)[0];
  const greeting = firstName
    ? t(`clinic.greeting.${part}`, { name: firstName })
    : t(part === 'morning' ? 'greetMorning' : part === 'afternoon' ? 'greetAfternoon' : 'greetEvening');

  return (
    <ParallaxPhoto photo="pc-intro" height={height} position={{ left: '54%', top: '50%' }} radius={wide ? 28 : 0}>
      <SkyShade phase={phase} />
      {wide ? null : (
        <View style={{ position: 'absolute', top: insets.top + 14, start: 20, end: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <PureLogo width={150} color="#FFFFFF" />
          <GlassIcon icon="globe" label={t('settings.language')} onPress={() => router.push('/settings')} />
        </View>
      )}
      <View
        style={[
          { position: 'absolute', start: 20, end: 20, bottom: 20, gap: 18 },
          wide ? { start: 44, end: 44, bottom: 40, flexDirection: 'row', alignItems: 'flex-end', gap: 40 } : null,
        ]}
      >
        <View style={{ gap: 10, flex: wide ? 1 : undefined }}>
          <Txt variant="eyebrow" color="rgba(255, 255, 255, 0.82)">
            {`${dayLong(now)} · ${time(now)} · ${t(`clinic.sky.${phase}`)}`}
          </Txt>
          <Txt variant="hero" color="#FFFFFF" accentColor="#FFFFFF" style={wide ? { fontSize: 64, lineHeight: 66 } : { fontSize: 50, lineHeight: 52 }}>
            {greeting}
          </Txt>
        </View>
        <View style={wide ? { width: 420 } : undefined}>
          {next ? <NextCard appointment={next} /> : <NoNextCard />}
        </View>
      </View>
    </ParallaxPhoto>
  );
}

function GlassIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  return (
    <PressableScale accessibilityLabel={label} onPress={onPress} style={{ borderRadius: 14 }}>
      <Glass style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }} interactive>
        <Icon name={icon} size={20} />
      </Glass>
    </PressableScale>
  );
}

/** The next request or appointment, live from Huidly: what, when, where, and whether the clinic confirmed it. */
function NextCard({ appointment: a }: { appointment: RemoteAppointment }) {
  const theme = useTheme();
  const { t, text, textOf, dateShort, clockTime, fromNow } = useI18n();
  const treatment = treatmentOf(a.treatment);
  const name = textOf(a.treatmentName, treatment ? text(treatment.name) : a.treatment);
  const when = a.start ? `${dateShort(a.start)} · ${clockTime(a.start)}` : `${dateShort(a.date)} · ${t(PART_KEY[a.part] ?? 'part_middag')}`;
  return (
    <PressableScale onPress={() => router.navigate('/mijn')} accessibilityLabel={name} style={{ borderRadius: 22 }}>
      <Glass style={{ borderRadius: 22, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }} interactive>
        <Photo photo={treatment?.photo ?? 'pc-consult'} style={{ width: 60, height: 68, borderRadius: 14 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="eyebrow" color={theme.c.muted} style={{ fontSize: 10 }}>
            {a.status === 'confirmed' ? t('clinic.home.next') : t('yourRequest')}
          </Txt>
          <Txt variant="heading" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="small" color={theme.c.muted} numberOfLines={1}>
            {`${when} · ${cityOf(a.location)}`}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: a.status === 'confirmed' ? theme.c.ink : theme.c.sand, marginEnd: 4 }}>
          <Txt variant="caption" color={a.status === 'confirmed' ? '#FFFFFF' : theme.c.ink} style={{ fontFamily: theme.f.medium }} numberOfLines={1}>
            {a.status === 'confirmed' && a.start ? fromNow(new Date(a.start)) : t(STATUS_KEY[a.status])}
          </Txt>
        </View>
      </Glass>
    </PressableScale>
  );
}

function NoNextCard() {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <PressableScale onPress={() => router.push('/afspraak/consult')} style={{ borderRadius: 22 }}>
      <Glass style={{ borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} interactive>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="heading">{t('clinic.home.noNext')}</Txt>
          <Txt variant="small" color={theme.c.muted}>
            {t('clinic.home.consultCta')}
          </Txt>
        </View>
        <Icon name="arrow" size={18} />
      </Glass>
    </PressableScale>
  );
}

/** Four shortcuts to what clients do most. */
function QuickActions() {
  const theme = useTheme();
  const { t } = useI18n();
  const { wide } = useLayout();
  const actions: { icon: IconName; label: string; go: () => void }[] = [
    { icon: 'sparkle', label: t('clinic.quick.scan'), go: () => router.push('/advies') },
    { icon: 'calendarPlus', label: t('clinic.quick.intake'), go: () => router.push('/afspraak/consult') },
    { icon: 'gift', label: t('navGift'), go: () => router.push('/cadeaubon') },
    { icon: 'bag', label: t('navShop'), go: () => router.navigate('/shop') },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {actions.map((a) => (
        <PressableScale
          key={a.label}
          onPress={a.go}
          accessibilityLabel={a.label}
          style={[
            { flex: 1, minHeight: 96, borderRadius: 20, backgroundColor: theme.c.surface, boxShadow: theme.shadow.card, padding: 12, paddingHorizontal: 10, justifyContent: 'space-between', gap: 10 },
            // A computer screen has room to set the icon beside its label.
            wide ? { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, paddingHorizontal: 16 } : null,
          ]}
        >
          <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={a.icon} size={19} />
          </View>
          <Txt variant="smallStrong" numberOfLines={2} style={wide ? { fontSize: 15 } : { fontSize: 12, lineHeight: 16, letterSpacing: -0.1 }}>
            {a.label}
          </Txt>
        </PressableScale>
      ))}
    </View>
  );
}

/**
 * Pure's offers of the moment (Black Friday until 1 December), word for word from the website's acties.json, on the
 * campaign's own photo. Each deal opens its treatment; the whole block disappears by itself after the last day.
 */
function Campaigns() {
  const { campaigns } = useCampaigns();
  if (!campaigns.length) return null;
  return (
    <View style={{ gap: 16 }}>
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </View>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const theme = useTheme();
  const { t, text, untilDay } = useI18n();
  return (
    <View style={{ borderRadius: theme.r.card, overflow: 'hidden', backgroundColor: theme.c.surface, boxShadow: theme.shadow.card }}>
      <Photo photo={campaignPhoto(campaign)} scrim style={{ height: 190 }}>
        <View style={{ position: 'absolute', start: 18, end: 18, bottom: 16, gap: 4 }}>
          {campaign.until ? (
            <Txt variant="eyebrow" color="rgba(255, 255, 255, 0.86)">
              {t('until', { d: untilDay(campaign.until) })}
            </Txt>
          ) : null}
          <Txt variant="hero" color="#FFFFFF" style={{ fontSize: 40, lineHeight: 42 }}>
            {text(campaign.name)}
          </Txt>
        </View>
      </Photo>
      <View style={{ paddingHorizontal: 16 }}>
        {campaign.deals.map((deal, index) => {
          const treatment = treatmentOf(deal.treatment);
          return (
            <PressableScale
              key={`${deal.treatment}-${index}`}
              accessibilityRole="link"
              onPress={() => treatment && router.push({ pathname: '/behandeling/[id]', params: { id: treatment.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.c.line }}
            >
              {treatment ? <Photo photo={treatment.photo} style={{ width: 44, height: 52, borderRadius: theme.r.small }} /> : null}
              <Txt variant="body" style={{ flex: 1 }}>
                {text(deal.text)}
              </Txt>
              <Icon name="chevron" size={16} color={theme.c.muted} />
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

/** The gift card offer (€ 100, € 15 extra from Pure), as long as Pure runs it. */
function GiftCard() {
  const theme = useTheme();
  const { t, euro } = useI18n();
  const { gift } = useCampaigns();
  return (
    <PressableScale
      onPress={() => router.push('/cadeaubon')}
      accessibilityLabel={t('navGift')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: theme.r.card, backgroundColor: theme.c.surface, boxShadow: theme.shadow.card }}
    >
      <GiftThumb width={86} height={104} />
      <View style={{ flex: 1, gap: 6 }}>
        <Txt variant="eyebrow" color={theme.c.muted}>
          {t('giftEyebrow')}
        </Txt>
        <Txt variant="title">{t('giftTitle')}</Txt>
        {gift && gift.bonus > 0 ? (
          <Txt variant="small" color={theme.c.ink}>
            {t('giftOffer', { a: euro(gift.amount), b: euro(gift.bonus) })}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevron" size={18} color={theme.c.muted} />
    </PressableScale>
  );
}

/** The skin scan, previewed: the light keeps sweeping over a face. */
function ScanBanner() {
  const theme = useTheme();
  const { t } = useI18n();
  const { wide } = useLayout();
  return (
    <PressableScale
      onPress={() => router.push('/advies')}
      accessibilityLabel={t('clinic.home.aiTitle').replace(/\*/g, '')}
      style={{ borderRadius: theme.r.card, backgroundColor: theme.c.ink, padding: 12, flexDirection: 'row', gap: 16, alignItems: 'center', boxShadow: theme.shadow.lift, flex: wide ? 1 : undefined }}
    >
      <SkinScan width={wide ? 150 : 118} height={wide ? 190 : 150} preview />
      <View style={{ flex: 1, gap: 8, paddingEnd: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="sparkle" size={14} color={theme.c.gold} />
          <Txt variant="eyebrow" color={theme.c.gold}>
            {t('clinic.quick.scan')}
          </Txt>
        </View>
        <Txt variant="title" color="#FFFFFF" accentColor="#FFFFFF">
          {t('clinic.home.aiTitle')}
        </Txt>
        <Txt variant="small" color="rgba(255, 255, 255, 0.7)">
          {t('clinic.home.aiBody')}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Txt variant="smallStrong" color="#FFFFFF">
            {t('clinic.scan.cta')}
          </Txt>
          <Icon name="arrow" size={15} color="#FFFFFF" />
        </View>
      </View>
    </PressableScale>
  );
}

function Popular() {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const { wide } = useLayout();
  const treatments = POPULAR.map(treatmentById);
  const cardWidth = Math.min(width * 0.68, 290);
  return (
    <View>
      <SectionTitle eyebrow={t('clinic.popular.eyebrow')} title={t('clinic.popular.title')} action={{ label: t('clinic.popular.all'), onPress: () => router.navigate('/boeken') }} />
      <DepthCarousel
        items={wide ? treatments.slice(0, 4) : treatments}
        itemWidth={cardWidth}
        keyOf={(tr) => tr.id}
        render={(tr) => <TreatmentCard treatment={tr} height={wide ? 380 : Math.round(cardWidth * 1.3)} />}
      />
    </View>
  );
}

/** The eight skin concerns as a bento of photos: big and small tiles in a rhythm, like a magazine page. */
function Concerns() {
  const { t } = useI18n();
  const { wide } = useLayout();
  const [a, b, c, d, e, f, g, h] = CONCERNS;
  const tile = (concern: Concern, style: ViewStyle) => <ConcernTile key={concern.id} concern={concern} style={style} large={(style.flex ?? 1) > 1.2} />;
  if (wide) {
    return (
      <View>
        <SectionTitle title={t('clinic.home.concerns')} />
        <View style={{ flexDirection: 'row', gap: 14, height: 460 }}>
          {tile(a, { flex: 2 })}
          <View style={{ flex: 1, gap: 14 }}>
            {tile(b, { flex: 1 })}
            {tile(c, { flex: 1 })}
          </View>
          <View style={{ flex: 1, gap: 14 }}>
            {tile(d, { flex: 1 })}
            {tile(e, { flex: 1 })}
          </View>
          <View style={{ flex: 1, gap: 14 }}>
            {tile(f, { flex: 1 })}
            {tile(g, { flex: 1 })}
            {tile(h, { flex: 1 })}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View>
      <SectionTitle title={t('clinic.home.concerns')} />
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, height: 250 }}>
          {tile(a, { flex: 1.35 })}
          <View style={{ flex: 1, gap: 10 }}>
            {tile(b, { flex: 1 })}
            {tile(c, { flex: 1 })}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, height: 150 }}>
          {tile(d, { flex: 1 })}
          {tile(e, { flex: 1 })}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, height: 250 }}>
          <View style={{ flex: 1, gap: 10 }}>
            {tile(f, { flex: 1 })}
            {tile(g, { flex: 1 })}
          </View>
          {tile(h, { flex: 1.35 })}
        </View>
      </View>
    </View>
  );
}

function ConcernTile({ concern, style, large }: { concern: Concern; style: ViewStyle; large?: boolean }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <PressableScale
      accessibilityLabel={t(`clinic.concern.${concern.id}`)}
      onPress={() => router.navigate({ pathname: '/boeken', params: { concern: concern.id, at: String(Date.now()) } })}
      style={[{ borderRadius: theme.r.photo, overflow: 'hidden' }, style]}
    >
      <Photo photo={concern.photo} scrim style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', start: 14, end: 14, bottom: 12 }}>
        <Txt variant={large ? 'title' : 'heading'} color="#FFFFFF" numberOfLines={3} style={large ? undefined : { fontSize: 15, lineHeight: 19 }}>
          {t(`clinic.concern.${concern.id}`)}
        </Txt>
      </View>
    </PressableScale>
  );
}

/** The laser deals from pureclinics.nl/deals as cards to swipe, the price set large like a shop window. */
function Deals() {
  const theme = useTheme();
  const { t, text, euro } = useI18n();
  const { wide } = useLayout();
  const shown = (['women', 'men', 'students'] as const)
    .map((group) => DEALS.filter((d) => d.group === group).slice(0, group === 'women' ? 2 : 1))
    .flat()
    .filter((d): d is Deal => Boolean(d));
  const cards = shown.map((deal) => (
    <PressableScale
      key={deal.id}
      onPress={() => router.push({ pathname: '/afspraak/[treatmentId]', params: { treatmentId: 'laser', deal: deal.id } })}
      style={{ width: wide ? undefined : 250, height: 196, borderRadius: theme.r.card, overflow: 'hidden', boxShadow: theme.shadow.card }}
    >
      <Photo photo={deal.group === 'men' ? 'pc-laser' : deal.group === 'students' ? 'pc-epilation' : 'pc-smooth'} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(54, 42, 34, 0.5)' }]} />
      <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
        <Glass tone="dark" style={{ alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Txt variant="caption" color="#FFFFFF" style={{ fontFamily: theme.f.medium }}>
            {t(`clinic.deals.${deal.group}`)}
          </Txt>
        </Glass>
        <View style={{ gap: 4 }}>
          <Txt variant="small" color="rgba(255, 255, 255, 0.86)" numberOfLines={2}>
            {text(deal.zones)}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Txt variant="hero" color="#FFFFFF" style={{ fontSize: 40, lineHeight: 44 }}>
              {euro(deal.price)}
            </Txt>
            {deal.was ? (
              <Txt variant="small" color="rgba(255, 255, 255, 0.7)" style={{ textDecorationLine: 'line-through' }}>
                {euro(deal.was)}
              </Txt>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  ));
  return (
    <View>
      <SectionTitle eyebrow={t('clinic.deals.eyebrow')} title={t('clinic.deals.title')} />
      {wide ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {cards.map((card, i) => (
            <View key={i} style={{ flexBasis: '45%', flexGrow: 1 }}>
              {card}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingVertical: 6 }}>
          {cards}
        </ScrollView>
      )}
      <Txt variant="caption" color={theme.c.muted} style={{ marginTop: 10 }}>
        {t('clinic.deals.note')}
      </Txt>
    </View>
  );
}

/** Real results: the clinic's own before-and-after photos as a deck to flick through. */
function Results() {
  const { t, text } = useI18n();
  const { width } = useWindowDimensions();
  const { wide } = useLayout();
  const deckWidth = wide ? Math.min((PAGE_WIDTH - 24) / 2, 560) : width - 40;
  return (
    <View>
      <SectionTitle eyebrow={t('clinic.results.eyebrow')} title={t('clinic.results.title')} />
      <Deck
        photos={RESULTS.map((r) => r.photo)}
        width={deckWidth}
        label={(photo) => {
          const match = RESULTS.find((r) => r.photo === photo);
          return match ? text(treatmentById(match.treatment).name) : undefined;
        }}
        nextLabel={t('clinic.results.next')}
      />
    </View>
  );
}

function Consult() {
  const theme = useTheme();
  const { t } = useI18n();
  const { wide } = useLayout();
  return (
    <View style={{ height: wide ? 380 : 420, borderRadius: theme.r.card, overflow: 'hidden', boxShadow: theme.shadow.card }}>
      <Photo photo="pc-room" scrim position={{ top: '30%', left: '50%' }} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', start: 20, end: 20, bottom: 20, gap: 10, maxWidth: 520 }}>
        <Txt variant="eyebrow" color="rgba(255, 255, 255, 0.82)">
          {t('clinic.home.consultEyebrow')}
        </Txt>
        <Txt variant="hero" color="#FFFFFF" accentColor="#FFFFFF" style={{ fontSize: 40, lineHeight: 42 }}>
          {t('clinic.home.consultTitle')}
        </Txt>
        <Txt variant="body" color="rgba(255, 255, 255, 0.86)">
          {t('clinic.home.consultBody')}
        </Txt>
        <Button kind="light" label={t('clinic.home.consultCta')} iconAfter="arrow" onPress={() => router.push('/afspraak/consult')} style={{ marginTop: 6, alignSelf: wide ? 'flex-start' : 'stretch' }} />
      </View>
    </View>
  );
}

/** The clinic's own numbers from pureclinics.nl, counting up, plus opening hours. */
function Facts() {
  const theme = useTheme();
  const { t, num } = useI18n();
  const clients = useCountUp(PURE_CLINICS.clients, { duration: 1800 });
  const years = useCountUp(PURE_CLINICS.years, { duration: 1400 });
  const facts = [
    { value: `${num(Math.round(clients))}+`, label: t('clinic.home.clients') },
    { value: String(Math.round(years)), label: t('clinic.home.years') },
    { value: '2', label: t('clinic.home.locations') },
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', backgroundColor: theme.c.surface, borderRadius: theme.r.card, paddingVertical: 22, boxShadow: theme.shadow.card }}>
        {facts.map((fact, index) => (
          <View key={fact.label} style={{ flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 6, borderStartWidth: index === 0 ? 0 : 1, borderColor: theme.c.line }}>
            <Txt variant="display" style={{ fontSize: 34, lineHeight: 38 }}>
              {fact.value}
            </Txt>
            <Txt variant="caption" color={theme.c.muted} align="center">
              {fact.label}
            </Txt>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="clock" size={15} color={theme.c.muted} />
        <Txt variant="small" color={theme.c.muted}>
          {t('clinic.hours')}
        </Txt>
      </View>
    </View>
  );
}
