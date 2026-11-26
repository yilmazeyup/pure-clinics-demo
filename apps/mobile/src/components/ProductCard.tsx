import type { Product } from '@pure-clinics/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { endEdge, startEdge } from '@/layout';
import { useApp } from '@/state/app';
import { useStock } from '@/state/remote';
import { useTheme } from '@/theme';

import { Badge } from './Badge';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { PressableScale } from './Motion';
import { TexturePhoto } from './Photo';
import { useToast } from './Toast';
import { Txt } from './Txt';

/**
 * A shop product as a texture close-up, with a quick add button that turns into a check for a moment. Price and stock
 * come from Huidly's shop; a sold-out product is marked and cannot be added.
 */
export function ProductCard({ product, width }: { product: Product; width: number }) {
  const theme = useTheme();
  const { t, text, euro } = useI18n();
  const { addToCart } = useApp();
  const stock = useStock();
  const soldOut = stock.soldOut(product.id);
  const price = stock.prices[product.id] ?? product.price;
  const toast = useToast();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  return (
    <PressableScale accessibilityRole="link" onPress={() => router.push(`/product/${product.id}`)} accessibilityLabel={text(product.name)} style={{ width, gap: 10 }}>
      <TexturePhoto texture={product.texture} style={{ height: Math.round(width * 1.15), borderRadius: theme.r.photo, boxShadow: theme.shadow.card }}>
        {soldOut ? (
          <View style={{ position: 'absolute', top: 10, ...startEdge(theme.rtl, 10) }}>
            <Badge label={t('shop.soldOut')} tone="surface" />
          </View>
        ) : (
          <PressableScale
            accessibilityLabel={t('shop.add')}
            scaleTo={0.85}
            onPress={() => {
              addToCart({ kind: 'product', id: product.id, qty: 1 });
              toast(t('shop.added', { name: text(product.name) }));
              setAdded(true);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setAdded(false), 1400);
            }}
            style={{ position: 'absolute', bottom: 10, ...endEdge(theme.rtl, 10), borderRadius: 13 }}
          >
            {added ? (
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: theme.c.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </View>
            ) : (
              <Glass style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }} interactive>
                <Icon name="plus" size={18} />
              </Glass>
            )}
          </PressableScale>
        )}
      </TexturePhoto>
      <View style={{ gap: 2 }}>
        {product.brand ? (
          <Txt variant="eyebrow" color={theme.c.muted} style={{ fontSize: 10 }}>
            {product.brand}
          </Txt>
        ) : null}
        <Txt variant="bodyStrong" numberOfLines={2}>
          {text(product.name)}
        </Txt>
        <Txt variant="small" color={theme.c.muted}>
          {soldOut ? `${euro(price)} · ${t('soldOut')}` : euro(price)}
        </Txt>
      </View>
    </PressableScale>
  );
}
