import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCampaigns } from '@/campaigns';
import { Button, IconButton } from '@/components/Button';
import { CartButton } from '@/components/CartButton';
import { GiftThumb } from '@/components/CartLineRow';
import { Field } from '@/components/Field';
import { Footer, Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { useApp } from '@/state/app';
import { useGiftCards } from '@/state/remote';
import { useTheme } from '@/theme';

/**
 * Cadeaubon: Pure's gift cards as Huidly sells them (what you pay, and what it is worth in the clinic), for whom and a
 * short message, then into the cart. Without Huidly the app falls back on Pure's own offer from the website.
 */
export default function GiftCardScreen() {
  const theme = useTheme();
  const { t, euro } = useI18n();
  const { addToCart } = useApp();
  const toast = useToast();
  const { gift } = useCampaigns();
  const remote = useGiftCards();
  const cards = remote.data?.giftCards?.length ? remote.data.giftCards : (gift?.cards ?? []);
  const [pick, setPick] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!cards.some((c) => c.id === pick)) setPick(cards[0]?.id ?? null);
  }, [cards, pick]);
  const card = cards.find((c) => c.id === pick);
  const best = cards.find((c) => c.value > c.price);

  const footer = (
    <Footer>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Stepper value={qty} onChange={setQty} max={10} />
        <Button
          label={card ? `${t('addToCart')} · ${euro(card.price * qty)}` : t('addToCart')}
          disabled={!card}
          style={{ flex: 1 }}
          onPress={() => {
            if (!card) return;
            addToCart({ kind: 'giftcard', id: card.id, amount: card.price, value: card.value, qty, ...(to.trim() ? { to: to.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) });
            toast(t('shop.added', { name: t('giftLine', { a: euro(card.price) }) }));
            router.push('/winkelmand');
          }}
        />
      </View>
    </Footer>
  );

  return (
    <Screen gap={22} footer={footer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton icon="back" label={t('common.back')} tone="surface" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/shop'))} />
        <CartButton />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Txt variant="eyebrow" color={theme.c.muted}>
            {t('giftEyebrow')}
          </Txt>
          <Txt variant="display">{t('giftTitle')}</Txt>
        </View>
        <View style={{ transform: [{ rotate: theme.rtl ? '-4deg' : '4deg' }], boxShadow: theme.shadow.lift, borderRadius: theme.r.small }}>
          <GiftThumb width={104} height={128} />
        </View>
      </View>

      {best ? (
        <View style={{ padding: 16, borderRadius: theme.r.card, backgroundColor: theme.c.sand }}>
          <Txt variant="bodyStrong">{t('giftOffer', { a: euro(best.price), b: euro(best.value - best.price) })}</Txt>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Txt variant="eyebrow" color={theme.c.muted}>
          {t('giftPick')}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {cards.map((c) => {
            const on = c.id === pick;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPick(c.id);
                }}
                style={({ pressed }) => ({
                  minWidth: 132,
                  paddingHorizontal: 18,
                  paddingVertical: 14,
                  borderRadius: theme.r.card,
                  backgroundColor: on ? theme.c.ink : theme.c.surface,
                  borderWidth: on ? 0 : 1,
                  borderColor: theme.c.line,
                  gap: 2,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Txt variant="title" color={on ? theme.c.onPrimary : theme.c.ink}>
                  {euro(c.price)}
                </Txt>
                {c.value > c.price ? (
                  <Txt variant="small" color={on ? theme.c.onPrimary : theme.c.primary}>
                    {`+ ${euro(c.value - c.price)}`}
                  </Txt>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {card && card.value > card.price ? (
          <Txt variant="small" color={theme.c.muted}>
            {t('giftWorth', { v: euro(card.value) })}
          </Txt>
        ) : null}
      </View>

      <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 16, gap: 12 }}>
        <Field label={t('giftTo')} hint={t('optional')} value={to} onChangeText={(v) => setTo(v.slice(0, 60))} />
        <Field label={t('giftMessage')} hint={t('optional')} value={message} onChangeText={(v) => setMessage(v.slice(0, 200))} multiline />
      </View>

      <Txt variant="small" color={theme.c.muted}>
        {t('giftPickup')}
      </Txt>
    </Screen>
  );
}
