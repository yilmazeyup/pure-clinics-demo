import { LOCATIONS, PURE_CLINICS, openingHours, productById } from '@pure-clinics/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { api, ApiError, ORDER_STATUS_KEY, PART_KEY, STATUS_KEY, type Me, type RemoteAppointment, type RemoteOrder } from '@/api';
import { ask } from '@/ask';
import { Badge } from '@/components/Badge';
import { Button, IconButton } from '@/components/Button';
import { Field } from '@/components/Field';
import { Glass } from '@/components/Glass';
import { Icon, type IconName } from '@/components/Icon';
import { Notice } from '@/components/Notice';
import { Photo } from '@/components/Photo';
import { Screen } from '@/components/Screen';
import { SignIn } from '@/components/SignIn';
import { useToast } from '@/components/Toast';
import { Txt } from '@/components/Txt';
import { useI18n } from '@/i18n';
import { startEdge } from '@/layout';
import { cityName, cityOf } from '@/places';
import { cancellable, treatmentOf } from '@/requests';
import { useAccount } from '@/state/account';
import { useApp } from '@/state/app';
import { useMyAppointments, useMyOrders } from '@/state/remote';
import { useTheme } from '@/theme';

/** Pure's questions page on the website, next to the app. */
const FAQ_URL = Platform.OS === 'web' ? '/website/vragen/' : 'https://pureclinics.savastana.com/website/vragen/';

/**
 * Mijn Pure: sign in or sign up with a code by e-mail; then your appointment requests, your orders and your details,
 * all from Huidly, and how to reach both clinics.
 */
export default function MyPure() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { me } = useAccount();

  return (
    <Screen gap={26} tabs>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt variant="display">{t('clinic.mine.title')}</Txt>
        <IconButton icon="globe" label={t('settings.language')} tone="surface" onPress={() => router.push('/settings')} />
      </View>

      {me ? (
        <SignedIn me={me} />
      ) : (
        <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 18, boxShadow: theme.shadow.card }}>
          <SignIn intro={t('signInNote')} />
        </View>
      )}

      <Contact />

      <Section title={t('clinic.mine.more')}>
        <List>
          <LinkRow icon="globe" label={t('settings.language')} onPress={() => router.push('/settings')} first />
          <LinkRow icon="list" label={t('mineFaq')} onPress={() => Linking.openURL(`${FAQ_URL}?lang=${locale}`)} />
        </List>
      </Section>

      {me ? <AccountActions /> : null}
    </Screen>
  );
}

function SignedIn({ me }: { me: Me }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 4, marginTop: -12 }}>
        <Txt variant="title">{t('hello', { n: me.name?.trim().split(/\s+/)[0] ?? '' })}</Txt>
        <Txt variant="small" color={theme.c.muted}>
          {me.email}
        </Txt>
      </View>
      <Requests />
      <Orders />
      <Details me={me} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <Txt variant="title">{title}</Txt>
      {children}
    </View>
  );
}

function List({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, paddingHorizontal: 16, boxShadow: theme.shadow.card }}>{children}</View>;
}

function Empty({ text, action }: { text: string; action: { label: string; onPress: () => void } }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 20, gap: 14 }}>
      <Txt variant="body" color={theme.c.muted}>
        {text}
      </Txt>
      <Button size="sm" label={action.label} onPress={action.onPress} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/** Appointment requests with their status: open ones as cards with a cancel button, the rest as a short list. */
function Requests() {
  const { t } = useI18n();
  const theme = useTheme();
  const list = useMyAppointments();
  const open = (list.data ?? []).filter((a) => cancellable(a));
  const rest = (list.data ?? []).filter((a) => !cancellable(a));
  return (
    <Section title={t('tab_afspraken')}>
      {list.loading && !list.data ? (
        <Txt variant="body" color={theme.c.muted}>
          {t('loading')}
        </Txt>
      ) : list.error ? (
        <Notice error={list.error} />
      ) : !list.data?.length ? (
        <Empty text={t('noBookings')} action={{ label: t('clinic.home.consultCta'), onPress: () => router.push('/afspraak/consult') }} />
      ) : (
        <>
          {open.map((a) => (
            <RequestCard key={a.id} appointment={a} onChanged={list.reload} />
          ))}
          {rest.length ? (
            <List>
              {rest.map((a, index) => (
                <PastRow key={a.id} appointment={a} first={index === 0} />
              ))}
            </List>
          ) : null}
          <Button kind="secondary" size="sm" label={t('clinic.home.consultCta')} onPress={() => router.push('/afspraak/consult')} style={{ alignSelf: 'flex-start' }} />
        </>
      )}
    </Section>
  );
}

function useWhen() {
  const { t, dateLong, dateTime } = useI18n();
  return (a: RemoteAppointment) => (a.start ? dateTime(a.start) : `${dateLong(a.date)}, ${t(PART_KEY[a.part] ?? 'part_middag').toLocaleLowerCase()}`);
}

function RequestCard({ appointment: a, onChanged }: { appointment: RemoteAppointment; onChanged: () => void }) {
  const theme = useTheme();
  const { t, text, textOf, dateShort, clockTime } = useI18n();
  const toast = useToast();
  const when = useWhen();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const treatment = treatmentOf(a.treatment);
  const name = textOf(a.treatmentName, treatment ? text(treatment.name) : a.treatment);
  const confirmed = a.status === 'confirmed';

  const cancel = async () => {
    if (!(await ask(t('cancelSure'), t('common.cancel'), t('common.back')))) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelAppointment(a.id);
      toast(t('clinic.appts.cancelled'));
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, { error: 'offline' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, overflow: 'hidden', boxShadow: theme.shadow.card }}>
      <Photo photo={treatment?.photo ?? 'pc-consult'} style={{ height: 160 }}>
        <Glass style={{ position: 'absolute', top: 14, ...startEdge(theme.rtl, 14), borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Txt variant="eyebrow" style={{ fontSize: 10 }}>
            {dateShort(a.start ?? a.date)}
          </Txt>
          <Txt variant="title" style={{ fontSize: 22, lineHeight: 26 }}>
            {a.start ? clockTime(a.start) : t(PART_KEY[a.part] ?? 'part_middag')}
          </Txt>
        </Glass>
      </Photo>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt variant="title">{name}</Txt>
            <Txt variant="small" color={theme.c.muted}>
              {when(a)}
            </Txt>
          </View>
          <Badge label={t(STATUS_KEY[a.status])} tone={confirmed ? 'ink' : 'outline'} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="pin" size={16} color={theme.c.muted} />
          <Txt variant="small" style={{ flex: 1 }}>
            {LOCATIONS.find((l) => l.id === a.location) ? `${cityOf(a.location)} · ${LOCATIONS.find((l) => l.id === a.location)?.address}` : cityOf(a.location)}
          </Txt>
        </View>
        {a.message ? (
          <View style={{ padding: 12, borderRadius: theme.r.control, backgroundColor: theme.c.bg, gap: 2 }}>
            <Txt variant="caption" color={theme.c.muted}>
              {t('mineFromClinic')}
            </Txt>
            <Txt variant="body">{`“${a.message}”`}</Txt>
          </View>
        ) : null}
        {!confirmed ? (
          <Txt variant="small" color={theme.c.muted}>
            {t('confirmLater')}
          </Txt>
        ) : null}
        {error ? <Notice error={error} /> : null}
        <Button kind="quiet" size="sm" label={t('common.cancel')} disabled={busy} onPress={cancel} style={{ alignSelf: 'flex-start' }} />
      </View>
    </View>
  );
}

function PastRow({ appointment: a, first }: { appointment: RemoteAppointment; first: boolean }) {
  const theme = useTheme();
  const { t, text, textOf, dateShort } = useI18n();
  const treatment = treatmentOf(a.treatment);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: theme.c.line }}>
      <Photo photo={treatment?.photo ?? 'pc-consult'} style={{ width: 48, height: 58, borderRadius: theme.r.small }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="bodyStrong">{textOf(a.treatmentName, treatment ? text(treatment.name) : a.treatment)}</Txt>
        <Txt variant="small" color={theme.c.muted}>{`${dateShort(a.start ?? a.date)} · ${cityOf(a.location)}`}</Txt>
      </View>
      {a.status === 'cancelled' ? (
        <Badge label={t(STATUS_KEY.cancelled)} tone="muted" />
      ) : treatment ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push({ pathname: '/afspraak/[treatmentId]', params: { treatmentId: treatment.id, location: a.location } })}
        >
          <Txt variant="smallStrong" color={theme.c.primary}>
            {t('clinic.appts.bookAgain')}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Orders from the app and the website, with their status; a new one can still be cancelled. */
function Orders() {
  const { t } = useI18n();
  const theme = useTheme();
  const list = useMyOrders();
  return (
    <Section title={t('tab_bestellingen')}>
      {list.loading && !list.data ? (
        <Txt variant="body" color={theme.c.muted}>
          {t('loading')}
        </Txt>
      ) : list.error ? (
        <Notice error={list.error} />
      ) : !list.data?.length ? (
        <Empty text={t('noOrders')} action={{ label: t('toShop'), onPress: () => router.navigate('/shop') }} />
      ) : (
        <List>
          {list.data.map((order, index) => (
            <OrderRow key={order.id} order={order} first={index === 0} onChanged={list.reload} />
          ))}
        </List>
      )}
    </Section>
  );
}

function OrderRow({ order: o, first, onChanged }: { order: RemoteOrder; first: boolean; onChanged: () => void }) {
  const theme = useTheme();
  const { t, text, textOf, euro, dateShort } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const what = [
    ...(o.items ?? []).map((i) => {
      const product = productById(i.product);
      return `${i.qty}× ${textOf(i.name, product ? text(product.name) : i.product)}`;
    }),
    ...(o.giftCards ?? []).map((g) => `${g.qty}× ${t('giftLine', { a: euro(g.price) })}`),
  ].join(', ');
  const where = o.delivery?.method === 'post' ? t('sendHome') : t('pickupIn', { c: cityOf(o.delivery?.location) });

  const cancel = async () => {
    if (!(await ask(t('cancelOrderSure'), t('common.cancel'), t('common.back')))) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelOrder(o.id);
      toast(t('ostatus_geannuleerd'));
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, { error: 'offline' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingVertical: 14, gap: 8, borderTopWidth: first ? 0 : 1, borderTopColor: theme.c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: theme.r.small, backgroundColor: theme.c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bag" size={20} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{t('orderNo', { n: o.number ?? o.id })}</Txt>
          <Txt variant="small" color={theme.c.muted}>
            {[o.createdAt ? dateShort(o.createdAt) : null, where].filter(Boolean).join(' · ')}
          </Txt>
          {what ? (
            <Txt variant="small" color={theme.c.ink} numberOfLines={3}>
              {what}
            </Txt>
          ) : null}
          {o.track ? (
            <Txt variant="small" color={theme.c.muted}>
              {`Track & trace: ${o.track}`}
            </Txt>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Badge label={t(ORDER_STATUS_KEY[o.status] ?? 'ostatus_nieuw')} tone={o.status === 'ready' ? 'ink' : o.status === 'cancelled' ? 'muted' : 'outline'} />
          <Txt variant="bodyStrong">{euro(o.total ?? 0)}</Txt>
        </View>
      </View>
      {error ? <Notice error={error} /> : null}
      {o.status === 'new' ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={cancel} hitSlop={8} style={{ alignSelf: 'flex-start', marginStart: 56, opacity: busy ? 0.5 : 1 }}>
          <Txt variant="smallStrong" color={theme.c.primary}>
            {t('common.cancel')}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Name and phone number, editable; the e-mail address is how you sign in, so it stays as it is. */
function Details({ me }: { me: Me }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { update } = useAccount();
  const [name, setName] = useState(me.name ?? '');
  const [phone, setPhone] = useState(me.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | { code: string } | null>(null);
  useEffect(() => {
    setName(me.name ?? '');
    setPhone(me.phone ?? '');
  }, [me.name, me.phone]);

  const save = async () => {
    if (name.trim().length < 2) return setError({ code: 'name-invalid' });
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api.updateMe({ name: name.trim(), phone: phone.trim(), locale });
      update(r?.me ?? { name: name.trim(), phone: phone.trim() });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e : { code: 'offline' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={t('tab_gegevens')}>
      <View style={{ backgroundColor: theme.c.surface, borderRadius: theme.r.card, padding: 18, gap: 14, boxShadow: theme.shadow.card }}>
        <Field label={t('name')} value={name} onChangeText={(v) => (setName(v), setSaved(false))} autoComplete="name" />
        <Field label={t('email')} value={me.email} editable={false} ltr />
        <Field label={t('phone')} hint={t('optional')} value={phone} onChangeText={(v) => (setPhone(v), setSaved(false))} autoComplete="tel" inputMode="tel" keyboardType="phone-pad" ltr />
        {error ? <Notice error={error} tone={error.code === 'offline' ? 'box' : 'inline'} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Button size="sm" label={t('save')} disabled={busy} onPress={save} />
          {saved ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="check" size={16} color={theme.c.primary} strokeWidth={2.2} />
              <Txt variant="small" color={theme.c.primary}>
                {t('mineSaved')}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
    </Section>
  );
}

function AccountActions() {
  const theme = useTheme();
  const { t } = useI18n();
  const { signOut, deleteAccount } = useAccount();
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <Button kind="secondary" label={t('signOut')} onPress={() => signOut()} />
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          if (!(await ask(t('mineDeleteSure'), t('mineDelete'), t('common.back')))) return;
          try {
            await deleteAccount();
          } catch (e) {
            setError(e instanceof ApiError ? e : new ApiError(0, { error: 'offline' }));
          }
        }}
        hitSlop={8}
        style={{ alignSelf: 'center', paddingVertical: 6 }}
      >
        <Txt variant="small" color={theme.c.muted}>
          {t('mineDelete')}
        </Txt>
      </Pressable>
      {error ? <Notice error={error} /> : null}
    </View>
  );
}

/** Both clinics with today's opening hours; a tap calls the clinic. */
function Contact() {
  const theme = useTheme();
  const { t } = useI18n();
  const { now } = useApp();
  // The left-to-right mark keeps "09:00–17:00" in order inside Arabic text.
  const hours = (h: { open: number; close: number }) => `‎${String(h.open).padStart(2, '0')}:00–${String(h.close).padStart(2, '0')}:00`;
  return (
    <Section title={t('clinic.contact.title')}>
      <List>
        {LOCATIONS.map((location, index) => {
          const today = openingHours(now, location.id);
          return (
            <Pressable
              key={location.id}
              accessibilityRole="link"
              onPress={() => Linking.openURL(`tel:${location.phone.replace(/\s/g, '')}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 14,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: theme.c.line,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Icon name="pin" size={20} color={theme.c.muted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{cityName(location)}</Txt>
                <Txt variant="small" color={theme.c.muted}>
                  {location.address}
                </Txt>
                <Txt variant="small" color={theme.c.muted}>
                  {today ? t('clinic.contact.today', { hours: hours(today) }) : t('clinic.contact.closed')}
                </Txt>
              </View>
              <Txt variant="smallStrong" color={theme.c.primary}>
                {t('clinic.contact.call', { phone: location.phone })}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(`mailto:${PURE_CLINICS.email}`)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            minHeight: 52,
            borderTopWidth: 1,
            borderTopColor: theme.c.line,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="mail" size={20} color={theme.c.muted} />
          <Txt variant="body" style={{ flex: 1 }}>
            {PURE_CLINICS.email}
          </Txt>
        </Pressable>
      </List>
    </Section>
  );
}

function LinkRow({ icon, label, onPress, first }: { icon: IconName; label: string; onPress: () => void; first?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 56,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: theme.c.line,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={20} color={theme.c.muted} />
      <Txt variant="body" style={{ flex: 1 }}>
        {label}
      </Txt>
      <Icon name="chevron" size={18} color={theme.c.muted} />
    </Pressable>
  );
}
