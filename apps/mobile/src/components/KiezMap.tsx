import { KIEZ_MAP, type PublicReport } from '@kiezruf/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSettings } from '@/theme/settings';
import { fonts, radius } from '@/theme/tokens';
import { Icon } from './Icon';

const MAP_COLORS = {
  light: { bg: '#e5ebe7', road: '#ffffff', park: '#cde2d2', water: '#c6dceb' },
  dark: { bg: '#18232c', road: '#283642', park: '#1b3329', water: '#172e40' },
};
const PIN = 30;

/**
 * Labelled street diagram of north Neukölln (packages/shared/src/kiez-map.ts), the same as the
 * web. Street names are Text on top of the SVG so they stay legible; pins open the report.
 */
export function KiezMap({ reports, label }: { reports: PublicReport[]; label: string }) {
  const { colors: c, scheme, lang } = useSettings();
  const m = MAP_COLORS[scheme];
  const [width, setWidth] = useState(0);
  const { width: W, height: H } = KIEZ_MAP;
  const scale = width / W;

  return (
    <View
      style={[styles.map, { aspectRatio: W / H, borderColor: c.line, backgroundColor: m.bg }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={label}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Rect width={W} height={H} fill={m.bg} />
        <Path d={KIEZ_MAP.park} fill={m.park} />
        <Path d={KIEZ_MAP.water} fill={m.water} />
        {KIEZ_MAP.minorStreets.map((d) => (
          <Path key={d} d={d} stroke={m.road} strokeWidth={3} strokeLinecap="round" fill="none" />
        ))}
        {KIEZ_MAP.majorStreets.map((d) => (
          <Path key={d} d={d} stroke={m.road} strokeWidth={6} strokeLinecap="round" fill="none" />
        ))}
      </Svg>

      {width > 0 &&
        [...KIEZ_MAP.labels, { ...KIEZ_MAP.offMapHint, angle: 0 }].map((l) => (
          <View
            key={l.text}
            pointerEvents="none"
            style={[styles.labelBox, { left: l.x * scale - 80, top: l.y * scale - 8, transform: [{ rotate: `${l.angle}deg` }] }]}
          >
            <Text style={[styles.label, { color: c.muted, textShadowColor: m.bg }]}>{l.text}</Text>
          </View>
        ))}

      {reports.map((r) => {
        const facility = r.category === 'facility';
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push(`/reports/${r.id}`)}
            accessibilityRole="link"
            accessibilityLabel={r.title[lang]}
            hitSlop={8}
            style={[styles.pin, { left: `${r.x}%`, top: `${r.y}%`, backgroundColor: facility ? '#2a78d6' : c.brand, borderColor: c.surface }]}
          >
            <View style={styles.pinIcon}>
              <Icon name="pin" size={15} color={facility ? '#ffffff' : c.onBrand} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  labelBox: { position: 'absolute', width: 160, alignItems: 'center' },
  label: { fontFamily: fonts.displaySemibold, fontSize: 11, textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    marginLeft: -PIN / 2,
    marginTop: -PIN,
    borderWidth: 2,
    borderTopLeftRadius: PIN / 2,
    borderTopRightRadius: PIN / 2,
    borderBottomRightRadius: PIN / 2,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinIcon: { transform: [{ rotate: '45deg' }] },
});
