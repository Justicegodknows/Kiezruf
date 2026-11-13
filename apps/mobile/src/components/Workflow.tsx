import type { IconName } from '@kiezruf/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space, type } from '@/theme/tokens';
import { Icon } from './Icon';

const STEPS: { key: 'photo' | 'locate' | 'follow' | 'fixed'; icon: IconName }[] = [
  { key: 'photo', icon: 'camera' },
  { key: 'locate', icon: 'pin' },
  { key: 'follow', icon: 'bell' },
  { key: 'fixed', icon: 'check' },
];

/** The four steps as a vertical timeline: numbered nodes joined by a dashed connector. */
export function Workflow() {
  const { t } = useTranslation();
  const { colors: c } = useSettings();

  return (
    <View accessibilityRole="list">
      {STEPS.map((step, i) => {
        const last = i === STEPS.length - 1;
        return (
          <View key={step.key} style={styles.step} accessibilityRole="text">
            <View style={styles.rail}>
              <View style={[styles.node, last ? { backgroundColor: c.brand, borderColor: c.brand } : { backgroundColor: c.surface, borderColor: c.lineStrong }]}>
                <Icon name={step.icon} size={24} color={last ? c.onBrand : c.brandInk} />
                <View style={[styles.number, { backgroundColor: c.ink, borderColor: c.bg }]}>
                  <Text style={[styles.numberText, { color: c.surface }]}>{i + 1}</Text>
                </View>
              </View>
              {!last && <View style={[styles.connector, { borderColor: c.lineStrong }]} />}
            </View>
            <View style={[styles.body, !last && styles.bodySpaced]}>
              <Text style={[type.subheading, { color: c.ink }]}>{t(`home.steps.${step.key}.title`)}</Text>
              <Text style={[type.body, { color: c.muted }]}>{t(`home.steps.${step.key}.body`)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const NODE = 60;
const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: space.lg },
  rail: { width: NODE, alignItems: 'center' },
  node: { width: NODE, height: NODE, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  number: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontFamily: fonts.semibold, fontSize: 12 },
  connector: { flex: 1, width: 0, borderLeftWidth: 2, borderStyle: 'dashed', marginVertical: 6 },
  body: { flex: 1, gap: 6, paddingTop: 6 },
  bodySpaced: { paddingBottom: space.xxl },
});
