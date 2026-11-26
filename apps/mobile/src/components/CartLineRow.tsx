import type { ReactNode } from 'react';
import { View } from 'react-native';

import { lineBonus, linePrice, lineProduct, type CartLine, type PriceList } from '@/cart';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { TexturePhoto } from './Photo';
import { PureLogo } from './PureLogo';
import { Txt } from './Txt';

/** One line of the cart or an order: picture, name and price, with room for controls on the end side. */
export function CartLineRow({ line, prices, first, children }: { line: CartLine; prices?: PriceList; first?: boolean; children?: ReactNode }) {
  const theme = useTheme();
  const { t, text, euro } = useI18n();
  const product = lineProduct(line);
  if (line.kind === 'product' && !product) return null;
  const name = product ? text(product.name) : t('giftLine', { a: euro(line.amount ?? 0) });
  const bonus = lineBonus(line);
  const frame = { width: 56, height: 66, borderRadius: theme.r.small };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.c.line,
      }}
    >
      {product ? <TexturePhoto texture={product.texture} style={frame} /> : <GiftThumb />}
      <View style={{ flex: 1, gap: 2 }}>
        {product?.brand ? (
          <Txt variant="caption" color={theme.c.muted}>
            {product.brand}
          </Txt>
        ) : null}
        <Txt variant="bodyStrong" numberOfLines={2}>
          {line.qty > 1 ? `${name} × ${line.qty}` : name}
        </Txt>
        {bonus ? (
          <Txt variant="small" color={theme.c.primary}>
            {t('giftBonusLine', { b: euro(bonus * line.qty) })}
          </Txt>
        ) : null}
        {line.to ? (
          <Txt variant="small" color={theme.c.muted} numberOfLines={1}>
            {`${t('giftTo')} ${line.to}`}
          </Txt>
        ) : null}
        <Txt variant="small" color={theme.c.muted}>
          {euro(Math.round(linePrice(line, prices) * line.qty * 100) / 100)}
        </Txt>
      </View>
      {children}
    </View>
  );
}

/** A gift card as a small walnut card with Pure's wordmark, like the real card at the desk. */
export function GiftThumb({ width = 56, height = 66 }: { width?: number; height?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, height, borderRadius: theme.r.small, backgroundColor: theme.c.primary, alignItems: 'center', justifyContent: 'center' }}>
      <PureLogo width={width * 0.72} color="#F7F3EC" />
    </View>
  );
}
