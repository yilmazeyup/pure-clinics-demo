import { CLINIC_COLORS } from '@pure-clinics/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { cityOf, locationOf } from '@/places';
import { useTheme } from '@/theme';

// Close the checkout screens underneath, then show a tab.
function leaveTo(href: '/shop' | '/' | '/mijn') {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}

type Params = { id: string; number?: string; method?: string; location?: string; total?: string };

/** After an order: its number, and how it goes from here (pick up and pay, or a payment request and then the post). */
export default function OrderPlaced() {
  const theme = useTheme();
  const params = useLocalSearchParams<Params>();
  const { t, euro } = useI18n();
  const post = params.method === 'post';
  const number = params.number || params.id;
  const location = locationOf(params.location);
  const total = Number(params.total);

  return (
    <Screen gap={24}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <IconButton icon="close" label={t('common.close')} tone="surface" onPress={() => leaveTo('/shop')} />
      </View>

      <View style={{ gap: 10 }}>
        <Txt variant="eyebrow" color={theme.c.muted}>
          {t('orderPlaced')}
        </Txt>
        <Txt variant="hero">{t('orderThanks')}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="check" size={18} color={theme.c.primary} strokeWidth={2} />
          <Txt variant="body" color={CLINIC_COLORS.body} style={{ flex: 1 }}>
            {post ? t('orderDonePost', { n: number }) : t('orderDoneText', { n: number, c: cityOf(params.location) })}
          </Txt>
        </View>
      </View>

      <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 16, gap: 10 }}>
        <Txt variant="eyebrow" color={theme.c.muted}>
          {t('orderNo', { n: number })}
        </Txt>
        {!post && location ? <Txt variant="body">{`${cityOf(location.id)} · ${location.address}`}</Txt> : null}
        {Number.isFinite(total) && total > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="bodyStrong">{t('total')}</Txt>
            <Txt variant="bodyStrong">{euro(total)}</Txt>
          </View>
        ) : null}
        <Txt variant="small" color={theme.c.muted}>
          {post ? t('payRequestLong') : t('payAtPickup')}
        </Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Button label={t('myPure')} onPress={() => leaveTo('/mijn')} />
        <Button kind="secondary" label={t('shop.continue')} onPress={() => leaveTo('/shop')} />
      </View>
    </Screen>
  );
}
