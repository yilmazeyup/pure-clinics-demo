import { PRODUCTS, type ShopCategory } from '@pure-clinics/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CartButton } from '@/components/CartButton';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { ProductCard } from '@/components/ProductCard';
import { Rail, Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useCampaigns } from '@/campaigns';
import { GiftThumb } from '@/components/CartLineRow';
import { PressableScale } from '@/components/Motion';
import { useI18n } from '@/i18n';
import { PAGE_WIDTH, useLayout } from '@/layout';
import { treatmentOf } from '@/requests';
import { useTheme } from '@/theme';

type Category = 'all' | ShopCategory;
const CATEGORIES: Category[] = ['all', 'face', 'aftercare', 'body', 'kits'];

export default function Shop() {
  const theme = useTheme();
  const { wide, inner } = useLayout();
  const { t } = useI18n();
  const params = useLocalSearchParams<{ category?: string; at?: string }>();
  const [category, setCategory] = useState<Category>('all');

  // Another screen can open the shop on one category; `at` makes a repeated tap count.
  useEffect(() => {
    const match = CATEGORIES.find((c) => c === params.category);
    if (match) setCategory(match);
  }, [params.category, params.at]);

  const products = PRODUCTS.filter((p) => category === 'all' || p.category === category);
  // Two products per row on a phone, four on a computer screen.
  const columns = wide ? 4 : 2;
  const columnGap = wide ? 20 : 12;
  const tile = Math.floor((inner(PAGE_WIDTH) - columnGap * (columns - 1)) / columns);

  return (
    <Screen gap={22} width="page" tabs>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <Txt variant="hero" style={{ flex: 1 }}>
          {t('shop.title')}
        </Txt>
        <CartButton />
      </View>
      <Txt variant="body" color={theme.c.muted} style={{ marginTop: -10 }}>
        {t('shop.intro')}
      </Txt>

      {category === 'all' ? <Offers /> : null}

      <Rail gap={8}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={t(`shop.cat.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </Rail>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap, rowGap: wide ? 32 : 20 }}>
        {products.map((p) => (
          <ProductCard key={p.id} product={p} width={tile} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8 }}>
        <Icon name="check" size={15} color={theme.c.muted} />
        <Txt variant="small" color={theme.c.muted} style={{ flexShrink: 1 }}>
          {t('shopPayNote')}
        </Txt>
      </View>
    </Screen>
  );
}

/**
 * The gift card offer and the campaign of the moment, at the top of the shop. The campaign's deals are treatments,
 * so they lead to the treatment page; the gift card goes into the cart like a product.
 */
function Offers() {
  const theme = useTheme();
  const { wide } = useLayout();
  const { t, text, euro, untilDay } = useI18n();
  const { campaigns, gift } = useCampaigns();
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
      <PressableScale
        onPress={() => router.push('/cadeaubon')}
        accessibilityLabel={t('navGift')}
        style={{ flex: wide ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 14, borderRadius: theme.r.card, backgroundColor: theme.c.surface, boxShadow: theme.shadow.card }}
      >
        <GiftThumb width={72} height={88} />
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="eyebrow" color={theme.c.muted}>
            {t('giftEyebrow')}
          </Txt>
          <Txt variant="heading">{t('giftTitle')}</Txt>
          {gift && gift.bonus > 0 ? (
            <Txt variant="small" color={theme.c.ink}>
              {t('giftOffer', { a: euro(gift.amount), b: euro(gift.bonus) })}
            </Txt>
          ) : null}
        </View>
        <Icon name="chevron" size={18} color={theme.c.muted} />
      </PressableScale>
      {campaigns.map((c) => (
        <View key={c.id} style={{ flex: wide ? 1 : undefined, padding: 16, gap: 10, borderRadius: theme.r.card, backgroundColor: theme.c.sand }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="ticket" size={16} color={theme.c.primary} />
            <Txt variant="eyebrow" color={theme.c.primary} style={{ flex: 1 }}>
              {c.until ? `${text(c.name)} · ${t('until', { d: untilDay(c.until) })}` : text(c.name)}
            </Txt>
          </View>
          {c.deals.map((deal, index) => {
            const treatment = treatmentOf(deal.treatment);
            return (
              <PressableScale
                key={`${deal.treatment}-${index}`}
                accessibilityRole="link"
                onPress={() => treatment && router.push({ pathname: '/behandeling/[id]', params: { id: treatment.id } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Txt variant="small" color={theme.c.ink} style={{ flex: 1 }}>
                  {text(deal.text)}
                </Txt>
                <Icon name="chevron" size={14} color={theme.c.muted} />
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
}
