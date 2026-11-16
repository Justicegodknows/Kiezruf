import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radius, space, TOUCH } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  busy,
  testID,
  accessibilityLabel,
  accessibilityHint,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: string;
  style?: ViewStyle;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [styles.button, styles[variant], inactive && styles.inactive, pressed && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator color={variant === 'primary' ? colors.primaryText : colors.text} /> : null}
      <Text style={[styles.buttonText, variant === 'primary' && styles.primaryText, variant === 'danger' && styles.dangerText]}>
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

/** A selectable chip. Selection shows as a check mark and bold text, not only colour. */
export function Chip({
  label,
  selected,
  onPress,
  testID,
  role = 'radio',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  role?: 'radio' | 'checkbox' | 'button';
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'button' ? { selected } : { checked: selected }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{selected ? `✓ ${label}` : label}</Text>
    </Pressable>
  );
}

export function Banner({ tone, children, testID }: { tone: 'info' | 'danger' | 'success' | 'neutral'; children: ReactNode; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      style={[styles.banner, bannerTone[tone]]}
    >
      {typeof children === 'string' ? <Text style={styles.bannerText}>{children}</Text> : children}
    </View>
  );
}

export function ErrorText({ message, testID }: { message: string | null; testID?: string }) {
  if (!message) return null;
  return (
    <Text testID={testID} accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
      {`⚠ ${message}`}
    </Text>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={styles.section}>
      {children}
    </Text>
  );
}

const bannerTone = StyleSheet.create({
  info: { backgroundColor: colors.infoBg },
  danger: { backgroundColor: colors.dangerBg, borderColor: colors.danger, borderWidth: 1 },
  success: { backgroundColor: colors.successBg },
  neutral: { backgroundColor: colors.sunk },
});

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.s,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
  inactive: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  buttonText: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  primaryText: { color: colors.primaryText },
  dangerText: { color: colors.danger },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.m,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.infoBg, borderColor: colors.primary, borderWidth: 2 },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { fontWeight: '700' },
  banner: { padding: space.m, borderRadius: radius.m, gap: space.s },
  bannerText: { fontSize: 15, color: colors.text },
  error: { color: colors.danger, fontSize: 15 },
  section: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: space.m },
});
