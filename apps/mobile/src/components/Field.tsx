import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Txt } from './Txt';

type Props = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  /** Small grey text after the label, e.g. "(niet verplicht)". */
  hint?: string;
  /** Taller box for a note. */
  multiline?: boolean;
  /** Left-to-right content (e-mail, code, phone, postcode) also in Arabic. */
  ltr?: boolean;
};

/** A labelled text box in the clinic's style: white on cream, a fine line that turns ink while you type. */
export function Field({ label, hint, multiline, ltr, ...input }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="smallStrong">
        {label}
        {hint ? <Txt variant="small" color={theme.c.muted}>{` ${hint}`}</Txt> : null}
      </Txt>
      <TextInput
        {...input}
        multiline={multiline}
        accessibilityLabel={input.accessibilityLabel ?? label}
        placeholderTextColor={theme.c.muted}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={{
          minHeight: multiline ? 96 : 50,
          paddingHorizontal: 16,
          paddingVertical: multiline ? 12 : 0,
          borderRadius: theme.r.control,
          borderWidth: 1,
          borderColor: focused ? theme.c.ink : theme.c.lineStrong,
          backgroundColor: input.editable === false ? theme.c.bg : theme.c.surface,
          fontFamily: theme.f.body,
          fontSize: 16,
          color: input.editable === false ? theme.c.muted : theme.c.ink,
          textAlign: ltr ? 'left' : theme.rtl ? 'right' : 'left',
          writingDirection: ltr ? 'ltr' : theme.rtl ? 'rtl' : 'ltr',
          textAlignVertical: multiline ? 'top' : 'center',
          outlineWidth: 0,
        }}
      />
    </View>
  );
}
