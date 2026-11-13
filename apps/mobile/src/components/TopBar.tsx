import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { langs } from '@/i18n';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space, touchTarget } from '@/theme/tokens';
import { Icon } from './Icon';

/** Brand mark: a signal-yellow plate with a pin, as on the web. */
export function BrandMark({ size = 30 }: { size?: number }) {
  const { colors: c } = useSettings();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width={32} height={32} rx={7} fill={c.signal} />
      <Path d="M16 25s-6.5-5.4-6.5-10.6a6.5 6.5 0 0 1 13 0C22.5 19.6 16 25 16 25z" fill={c.onSignal} />
      <Circle cx={16} cy={14.3} r={2.6} fill={c.signal} />
    </Svg>
  );
}

/** Brand on the left; language switch and theme toggle on the right. */
export function TopBar() {
  const { t } = useTranslation();
  const { colors: c, lang, setLang, scheme, toggleScheme } = useSettings();
  const themeLabel = scheme === 'dark' ? t('settings.toLight') : t('settings.toDark');

  return (
    <View style={[styles.bar, { borderColor: c.line }]}>
      <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel={`Kiezruf, ${t('brandTagline')}`}>
        <BrandMark />
        <View>
          <Text style={[styles.name, { color: c.ink }]}>Kiezruf</Text>
          <Text style={[styles.tagline, { color: c.muted }]}>{t('brandTagline')}</Text>
        </View>
      </View>

      <View style={styles.tools}>
        <View style={[styles.segmented, { backgroundColor: c.sunk, borderColor: c.line }]} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')}>
          {langs.map((l) => {
            const active = l === lang;
            return (
              <Pressable
                key={l}
                onPress={() => setLang(l)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`settings.${l}`)}
                style={[styles.segment, active && { backgroundColor: c.surface, borderColor: c.line }]}
              >
                <Text style={[styles.segmentText, { color: active ? c.ink : c.muted }]}>{l.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={toggleScheme}
          accessibilityRole="button"
          accessibilityLabel={themeLabel}
          style={({ pressed }) => [styles.iconButton, { borderColor: c.line, backgroundColor: pressed ? c.sunk : c.surface }]}
        >
          <Icon name={scheme === 'dark' ? 'sun' : 'moon'} size={20} color={c.ink2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontFamily: fonts.display, fontSize: 22, lineHeight: 22 },
  tagline: { fontFamily: fonts.regular, fontSize: 12 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.md, borderWidth: 1 },
  segment: { minWidth: 40, height: touchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1 },
});
