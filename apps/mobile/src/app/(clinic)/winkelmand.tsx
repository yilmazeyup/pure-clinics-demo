import { productById } from '@pure-clinics/shared';
import { router } from 'expo-router';
import { View } from 'react-native';

import { cartTotals } from '@/cart';
import { Button, IconButton } from '@/components/Button';
import { CartLineRow } from '@/components/CartLineRow';
import { Footer, Screen } from '@/components/Screen';
import { Stepper } from '@/components/Stepper';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { useApp } from '@/state/app';
import { useStock } from '@/state/remote';
import { useTheme } from '@/theme';

/** The cart: products and gift cards, shared with Pure's website in the same browser. */
export default function Cart() {
  const theme = useTheme();
  const { t, tp, euro, text } = useI18n();
  const { cart, setLineQty } = useApp();
  const stock = useStock();
  const totals = cartTotals(cart, 0, stock.prices);
  const soldOut = cart.filter((l) => l.kind === 'product' && stock.soldOut(l.id));

  const footer =
    cart.length > 0 ? (
      <Footer>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt variant="body" color={theme.c.muted}>
            {t('shop.subtotal')}
          </Txt>
          <Txt variant="bodyStrong">{euro(totals.subtotal)}</Txt>
        </View>
        <Button label={t('shop.checkout')} iconAfter="arrow" disabled={soldOut.length > 0} onPress={() => router.push('/afrekenen')} />
      </Footer>
    ) : undefined;

  return (
    <Screen gap={20} footer={footer}>
      <View style={{ flexDirection: 'row' }}>
        <IconButton icon="back" label={t('common.back')} tone="surface" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/shop'))} />
      </View>
      <View style={{ gap: 4 }}>
        <Txt variant="display">{t('shop.cart')}</Txt>
        <Txt variant="body" color={theme.c.muted}>
          {cart.length > 0 ? tp('shop.items', totals.count) : t('shop.cartEmpty')}
        </Txt>
      </View>

      {cart.length > 0 ? (
        <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, paddingHorizontal: 14 }}>
          {cart.map((line, index) => (
            <CartLineRow key={`${line.kind}-${line.id}-${index}`} line={line} prices={stock.prices} first={index === 0}>
              <Stepper value={line.qty} min={0} max={10} onChange={(qty) => setLineQty(index, qty)} />
            </CartLineRow>
          ))}
        </View>
      ) : (
        <Button kind="secondary" label={t('shop.continue')} onPress={() => router.navigate('/shop')} />
      )}

      {soldOut.length > 0 ? (
        <Txt variant="small" color={theme.c.primary}>
          {`${t('errStock')} ${soldOut.map((l) => { const p = productById(l.id); return p ? text(p.name) : l.id; }).join(', ')}`}
        </Txt>
      ) : null}

      {cart.length > 0 ? (
        <Txt variant="small" color={theme.c.muted}>
          {t('shopPayNote')}
        </Txt>
      ) : null}
    </Screen>
  );
}
