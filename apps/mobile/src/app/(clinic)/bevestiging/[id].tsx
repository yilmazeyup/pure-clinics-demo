import { CLINIC_COLORS } from '@pure-clinics/shared';
import * as Linking from 'expo-linking';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PART_KEY, STATUS_KEY, type DayPart } from '@/api';
import { Button, IconButton } from '@/components/Button';
import { Glass } from '@/components/Glass';
import { Icon, type IconName } from '@/components/Icon';
import { EASE_OUT, nativeDriver, prefersReducedMotion, useCountUp } from '@/components/Motion';
import { Photo } from '@/components/Photo';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { cityName, locationOf, routeUrl } from '@/places';
import { treatmentOf } from '@/requests';
import { useAccount } from '@/state/account';
import { useTheme } from '@/theme';

// Back to the tabs underneath, then to a tab.
function leaveTo(href: '/' | '/mijn') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}

type Params = { id: string; treatment?: string; location?: string; date?: string; part?: string };

/** After a request: what was asked for, and that the clinic confirms the exact time by phone or e-mail. */
export default function RequestSent() {
  const theme = useTheme();
  const params = useLocalSearchParams<Params>();
  const { t, text } = useI18n();
  const { me } = useAccount();
  const treatment = treatmentOf(params.treatment ?? '');
  const location = locationOf(params.location);
  const part = (['morning', 'afternoon', 'evening'] as const).find((p) => p === params.part);
  if (!treatment || !location || !params.date || !part) return <Redirect href="/" />;
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? '';

  return (
    <Screen gap={24} enter={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <IconButton icon="close" label={t('common.close')} tone="surface" onPress={() => leaveTo('/')} />
      </View>

      <View style={{ gap: 14 }}>
        <Seal />
        <Rise delay={420}>
          <Txt variant="eyebrow" color={theme.c.muted}>
            {t('requestSent')}
          </Txt>
        </Rise>
        <Rise delay={500}>
          <Txt variant="hero">{firstName ? t('thanksBooking', { n: firstName }) : t('orderThanks')}</Txt>
        </Rise>
        <Rise delay={620}>
          <Txt variant="body" color={CLINIC_COLORS.body}>
            {t('bookingDoneText', { t: text(treatment.name), c: cityName(location) })}
          </Txt>
        </Rise>
      </View>

      <Pass photo={treatment.photo} name={text(treatment.name)} date={params.date} part={part} place={`${cityName(location)} · ${location.address}`} />

      <Rise delay={1100}>
        <View style={{ gap: 10 }}>
          <Button kind="light" icon="pin" label={t('route')} onPress={() => Linking.openURL(routeUrl(location))} />
          <Button label={t('myPure')} onPress={() => leaveTo('/mijn')} />
          <Button kind="secondary" label={t('clinic.confirm.home')} onPress={() => leaveTo('/')} />
        </View>
      </Rise>
    </Screen>
  );
}

/** Rises into place after a moment, so the page builds up in order. */
function Rise({ delay, children }: { delay: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 650, delay, easing: EASE_OUT, useNativeDriver: nativeDriver }).start();
  }, [v, delay]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

/** A dark tile that springs in, and a check mark that draws itself inside it. */
function Seal() {
  const theme = useTheme();
  const pop = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  const drawn = useCountUp(1, { duration: 520, delay: 280 });
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: nativeDriver }).start();
  }, [pop]);
  // The check is a path about 22 units long; the dash offset uncovers it from the start.
  const length = 22;
  return (
    <Animated.View
      style={{
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: theme.c.ink,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: theme.shadow.lift,
        opacity: pop,
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '0deg'] }) }],
      }}
    >
      <Svg width={30} height={30} viewBox="0 0 24 24">
        <Path
          d="m5 12.5 4.5 4.5L19 7.5"
          stroke={theme.c.gold}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - drawn)}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * The request as a pass, like a ticket in a wallet: the treatment photo with the day on glass, a torn-off line, then
 * where it is and its status. The exact time follows from the clinic. It lifts up from below as it arrives.
 */
function Pass({ photo, name, date, part, place }: { photo: Parameters<typeof Photo>[0]['photo']; name: string; date: string; part: DayPart; place: string }) {
  const theme = useTheme();
  const { t, dateLong } = useI18n();
  const arrive = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(arrive, { toValue: 1, duration: 1000, delay: 700, easing: EASE_OUT, useNativeDriver: nativeDriver }).start();
  }, [arrive]);
  return (
    <Animated.View
      style={{
        opacity: arrive.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [
          { perspective: 900 },
          { translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) },
          { rotateX: arrive.interpolate({ inputRange: [0, 1], outputRange: ['28deg', '0deg'] }) },
          { scale: arrive.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      <View style={{ borderRadius: 28, backgroundColor: theme.c.surface, overflow: 'hidden', boxShadow: theme.shadow.lift }}>
        <Photo photo={photo} style={{ height: 190 }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(50, 38, 30, 0.18)' }]} />
          <View style={{ position: 'absolute', top: 14, start: 14, end: 14, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Glass style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Txt variant="eyebrow" style={{ fontSize: 10 }}>
                {dateLong(date)}
              </Txt>
              <Txt variant="title" style={{ fontSize: 22, lineHeight: 26 }}>
                {t(PART_KEY[part])}
              </Txt>
            </Glass>
          </View>
        </Photo>
        <View style={{ padding: 20, gap: 14 }}>
          <Txt variant="title">{name}</Txt>
          <Row icon="pin" value={place} />
        </View>
        {/* The tear-off line. */}
        <View style={{ marginHorizontal: 20, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: theme.c.lineStrong }} />
        <View style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: theme.c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={20} color={theme.c.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="eyebrow" color={theme.c.muted}>
              {t(STATUS_KEY.requested)}
            </Txt>
            <Txt variant="small" color={CLINIC_COLORS.body}>
              {t('confirmLater')}
            </Txt>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function Row({ icon, value }: { icon: IconName; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Icon name={icon} size={18} color={theme.c.muted} />
      <Txt variant="body" style={{ flex: 1 }}>
        {value}
      </Txt>
    </View>
  );
}
