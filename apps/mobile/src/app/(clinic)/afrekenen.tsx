import { LOCATIONS, productById, type LocationId } from '@pure-clinics/shared';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError, type Address } from '@/api';
import { cartTotals } from '@/cart';
import { Button, IconButton } from '@/components/Button';
import { CartLineRow } from '@/components/CartLineRow';
import { Chip } from '@/components/Chip';
import { Field } from '@/components/Field';
import { Icon, type IconName } from '@/components/Icon';
import { Notice, useErrorText } from '@/components/Notice';
import { Footer, Rail, Screen } from '@/components/Screen';
import { SignIn } from '@/components/SignIn';
import { Txt } from '@/components/Txt';
import { useI18n, INTL_LOCALE } from '@/i18n';
import { cityName } from '@/places';
import { useAccount } from '@/state/account';
import { useApp } from '@/state/app';
import { useCatalog, useStock } from '@/state/remote';
import { useTheme } from '@/theme';

type Where = { method: 'pickup'; location: LocationId } | { method: 'post' };

/**
 * Afrekenen: pick up in Nijmegen or Uden and pay in the clinic, or have it sent (Pure sends a payment request and
 * ships once it is paid). There is no online payment yet, so none is shown. The order lands in Pure's program
 * (Kliniek › Webshop & voorraad), marked "app".
 */
export default function Checkout() {
  const theme = useTheme();
  const { t, tp, euro, text, locale } = useI18n();
  const { cart, clearCart } = useApp();
  const { me, signOut } = useAccount();
  const stock = useStock();
  const catalog = useCatalog();
  const errorText = useErrorText();
  const delivery = catalog.data?.delivery;
  const [where, setWhere] = useState<Where | null>(null);
  const [address, setAddress] = useState<Address>({ name: '', street: '', postcode: '', city: '', country: 'NL' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (me?.name) setAddress((a) => (a.name ? a : { ...a, name: me.name }));
  }, [me?.name]);

  if (cart.length === 0 && !busy) return <Redirect href="/shop" />;

  const shipping = where?.method === 'post' && delivery ? delivery.fee : 0;
  const totals = cartTotals(cart, shipping, stock.prices);
  const addressOk = where?.method !== 'post' || (['name', 'street', 'postcode', 'city'] as const).every((k) => address[k].trim().length > 1);
  const ready = Boolean(me && where && addressOk && !busy);
  const countries = delivery?.countries?.length ? delivery.countries : ['NL', 'BE'];
  const countryName = (code: string) => {
    try {
      return new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  const place = async () => {
    if (!where || !me) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.placeOrder({
        items: cart.filter((l) => l.kind === 'product').map((l) => ({ product: l.id, qty: l.qty })),
        giftCards: cart
          .filter((l) => l.kind === 'giftcard')
          .map((l) => ({ id: l.id, qty: l.qty, ...(l.to ? { to: l.to } : {}), ...(l.message ? { message: l.message } : {}) })),
        delivery:
          where.method === 'post'
            ? { method: 'post', address: { ...address, name: address.name.trim(), street: address.street.trim(), postcode: address.postcode.trim(), city: address.city.trim() } }
            : { method: 'pickup', location: where.location },
        channel: 'app',
        ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const order = r?.order;
      router.replace({
        pathname: '/bestelling/[id]',
        params: {
          id: order?.id ?? 'new',
          number: order?.number ?? '',
          method: where.method,
          location: where.method === 'pickup' ? where.location : '',
          total: String(order?.total ?? totals.total),
        },
      });
      clearCart();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, { error: 'offline' }));
      setBusy(false);
    }
  };

  const stockNames =
    error?.code === 'out-of-stock' && error.body?.products?.length
      ? error.body.products.map((id) => (productById(id) ? text(productById(id)!.name) : id)).join(', ')
      : '';

  const footer = (
    <Footer>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="bodyStrong">{t('total')}</Txt>
        <Txt variant="bodyStrong">{euro(totals.total)}</Txt>
      </View>
      {error ? stockNames ? <Notice text={`${errorText(error)} ${stockNames}`} /> : <Notice error={error} /> : null}
      <Button label={t('placeOrder')} disabled={!ready} onPress={place} />
      <Txt variant="caption" color={theme.c.muted} align="center">
        {where?.method === 'post' ? t('payRequestLong') : t('payAtPickup')}
      </Txt>
    </Footer>
  );

  return (
    <Screen gap={22} footer={footer}>
      <View style={{ flexDirection: 'row' }}>
        <IconButton icon="back" label={t('common.back')} tone="surface" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/winkelmand'))} />
      </View>
      <Txt variant="display">{t('checkoutTitle')}</Txt>

      <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, paddingHorizontal: 14 }}>
        {cart.map((line, index) => (
          <CartLineRow key={`${line.kind}-${line.id}-${index}`} line={line} prices={stock.prices} first={index === 0} />
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: theme.c.line, paddingVertical: 14, gap: 8 }}>
          <Row label={`${t('shop.subtotal')} · ${tp('shop.items', totals.count)}`} value={euro(totals.subtotal)} />
          {where?.method === 'post' ? <Row label={t('shipping')} value={euro(totals.shipping)} /> : null}
        </View>
      </View>

      <Group label={t('shop.delivery')}>
        {LOCATIONS.map((l) => (
          <Option
            key={l.id}
            icon="pin"
            title={t('pickupIn', { c: cityName(l) })}
            note={`${l.address} · ${t('payInClinic')}`}
            selected={where?.method === 'pickup' && where.location === l.id}
            onPress={() => setWhere({ method: 'pickup', location: l.id })}
          />
        ))}
        {delivery ? (
          <Option
            icon="truck"
            title={t('sendHome')}
            note={`${euro(delivery.fee)} · ${t('shop.shipNote', { days: delivery.days })} · ${t('payRequest')}`}
            selected={where?.method === 'post'}
            onPress={() => setWhere({ method: 'post' })}
          />
        ) : null}
      </Group>

      {where?.method === 'post' ? (
        <Group label={t('shop.address')}>
          <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 16, gap: 12 }}>
            <Field label={t('name')} value={address.name} onChangeText={(v) => setAddress((a) => ({ ...a, name: v }))} autoComplete="name" />
            <Field label={t('street')} value={address.street} onChangeText={(v) => setAddress((a) => ({ ...a, street: v }))} autoComplete="street-address" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('postcode')} value={address.postcode} onChangeText={(v) => setAddress((a) => ({ ...a, postcode: v }))} autoComplete="postal-code" autoCapitalize="characters" ltr />
              </View>
              <View style={{ flex: 1.4 }}>
                <Field label={t('city')} value={address.city} onChangeText={(v) => setAddress((a) => ({ ...a, city: v }))} />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Txt variant="smallStrong">{t('country')}</Txt>
              <Rail gap={8}>
                {countries.map((code) => (
                  <Chip key={code} label={countryName(code)} selected={address.country === code} onPress={() => setAddress((a) => ({ ...a, country: code }))} />
                ))}
              </Rail>
            </View>
          </View>
        </Group>
      ) : null}

      <Field label={t('stepNote')} hint={t('optional')} value={note} onChangeText={setNote} multiline />

      <Group label={t('stepYou')}>
        {me ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: theme.r.card, backgroundColor: theme.c.surface }}>
            <Icon name="user" size={20} color={theme.c.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="bodyStrong">{me.name}</Txt>
              <Txt variant="small" color={theme.c.muted}>
                {me.email}
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
            <SignIn intro={t('signInToOrder')} />
          </View>
        )}
      </Group>
    </Screen>
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

function Option({ icon, title, note, selected, onPress }: { icon: IconName; title: string; note: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: theme.r.card,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? theme.c.ink : theme.c.line,
        backgroundColor: theme.c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} size={20} color={selected ? theme.c.ink : theme.c.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="small" color={theme.c.muted}>
          {note}
        </Txt>
      </View>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          borderWidth: selected ? 6 : 1.5,
          borderColor: selected ? theme.c.ink : theme.c.lineStrong,
        }}
      />
    </Pressable>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt variant={strong ? 'bodyStrong' : 'body'} color={strong ? theme.c.ink : theme.c.muted} style={{ flex: 1 }}>
        {label}
      </Txt>
      <Txt variant={strong ? 'bodyStrong' : 'body'}>{value}</Txt>
    </View>
  );
}
