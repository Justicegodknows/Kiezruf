import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '@/theme/motion';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space } from '@/theme/tokens';

// Signature element: a Berlin street-name plate. White enamel, inset black frame, the street in
// condensed type and the district small, as on the real signs. Plates slide in once, staggered.
export function Plate({
  href,
  street,
  district,
  issue,
  age,
  index,
}: {
  href: `/reports/${string}`;
  street: string;
  district: string;
  issue: string;
  age: string;
  index: number;
}) {
  const { colors: c } = useSettings();
  const reduced = useReducedMotion();
  // An Animated.Value lives for the component's lifetime; lazy state keeps it out of render reads.
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, { toValue: 1, duration: 520, delay: index * 90, useNativeDriver: true }).start();
  }, [enter, index, reduced]);

  const motion = {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  return (
    <Animated.View style={motion}>
      <Pressable
        onPress={() => router.push(href)}
        accessibilityRole="link"
        accessibilityLabel={`${street}, ${district}. ${issue}, ${age}`}
        style={({ pressed }) => [styles.plate, { backgroundColor: c.plate, borderColor: c.line }, pressed && styles.pressed]}
      >
        <View style={[styles.frame, { borderColor: c.plateInk }]}>
          <View style={styles.top}>
            <Text style={[styles.street, { color: c.plateInk }]} numberOfLines={1}>
              {street}
            </Text>
            <Text style={[styles.district, { color: c.plateMuted }]}>{district}</Text>
          </View>
          <View style={styles.bottom}>
            <Text style={[styles.issue, { color: c.plateMuted }]} numberOfLines={1}>
              {issue}
            </Text>
            <Text style={[styles.issue, styles.age, { color: c.plateMuted }]} numberOfLines={1}>
              {age}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plate: { borderRadius: radius.md, borderWidth: 1, padding: 3 },
  pressed: { transform: [{ translateX: -3 }] },
  frame: { borderWidth: 2, borderRadius: radius.sm, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 2 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  street: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, flexShrink: 1 },
  district: { fontFamily: fonts.medium, fontSize: 12, paddingTop: 6 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  issue: { fontFamily: fonts.regular, fontSize: 15, flexShrink: 1 },
  age: { flexShrink: 0 },
});
