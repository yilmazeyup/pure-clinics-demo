import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { CLINIC_PHONE, ERROR_KEY, type ApiError } from '@/api';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Icon } from './Icon';
import { PressableScale } from './Motion';
import { Txt } from './Txt';

/** The sentence for an error from Huidly, as on the website. */
export function useErrorText() {
  const { t } = useI18n();
  return (e: ApiError | { code: string } | null | undefined) => (e ? t(ERROR_KEY[e.code] ?? 'errGeneric') : '');
}

/**
 * A calm message when something did not work, on sand rather than in alarm red, with the clinic's number to call.
 * `tone="inline"` is a single line for under a form.
 */
export function Notice({ error, text, tone = 'box' }: { error?: ApiError | { code: string } | null; text?: string; tone?: 'box' | 'inline' }) {
  const theme = useTheme();
  const { t } = useI18n();
  const errorText = useErrorText();
  const message = text ?? errorText(error);
  if (!message) return null;
  const showCall = !text && (error?.code === 'offline' || !ERROR_KEY[error?.code ?? '']);
  if (tone === 'inline') {
    return (
      <Txt variant="small" color={theme.c.primary} accessibilityRole="alert">
        {message}
      </Txt>
    );
  }
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: theme.r.control, backgroundColor: theme.c.sand, alignItems: 'flex-start' }}>
      <Icon name="leaf" size={18} color={theme.c.primary} />
      <View style={{ flex: 1, gap: 8 }}>
        <Txt variant="small" color={theme.c.ink}>
          {message}
        </Txt>
        {showCall ? (
          <PressableScale accessibilityRole="link" onPress={() => Linking.openURL(`tel:${CLINIC_PHONE.replace(/\s/g, '')}`)} style={{ alignSelf: 'flex-start' }}>
            <Txt variant="smallStrong" color={theme.c.primary}>
              {t('clinic.contact.call', { phone: CLINIC_PHONE })}
            </Txt>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}
