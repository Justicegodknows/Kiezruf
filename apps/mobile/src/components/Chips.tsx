import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSettings } from '@/theme/settings';
import { fonts, space, touchTarget } from '@/theme/tokens';

/** Single-choice filter chips. The selected chip turns asphalt. */
export function Chips<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const { colors: c } = useSettings();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active ? { backgroundColor: c.ink, borderColor: c.ink } : { backgroundColor: c.surface, borderColor: c.lineStrong }]}
          >
            <Text style={[styles.text, { color: active ? c.surface : c.ink2 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: touchTarget - 4, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  text: { fontFamily: fonts.medium, fontSize: 16 },
});
