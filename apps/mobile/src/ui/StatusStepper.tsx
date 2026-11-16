// Open → Acknowledged → In progress → Resolved, with Forwarded shown on its own (US-28, US-45 in the prototype).
// Each step says in text whether it is done, current or pending, so the state does not rely on colour.
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import type { ReportStatus } from '../api/schemas';
import { colors, space } from './theme';

export const STEPS = ['open', 'acknowledged', 'in_progress', 'resolved'] as const;

/** Index of the current step; Forwarded counts as acknowledged, like the prototype. */
export function stepIndex(status: ReportStatus): number {
  if (status === 'forwarded') return 1;
  const i = (STEPS as readonly string[]).indexOf(status);
  return i;
}

export function StatusStepper({ status }: { status: ReportStatus }) {
  const { t } = useTranslation();
  const current = stepIndex(status);
  return (
    <View accessibilityRole="list" accessibilityLabel={t('detail.progress')} style={styles.row} testID="status-stepper">
      {STEPS.map((step, i) => {
        const name = t(`status.${step}`);
        const state = i < current ? 'done' : i === current ? 'current' : 'pending';
        const a11y = t(state === 'done' ? 'detail.stepDone' : state === 'current' ? 'detail.stepCurrent' : 'detail.stepPending', { step: name });
        return (
          <View key={step} style={styles.step} accessible accessibilityLabel={a11y}>
            <Text style={[styles.dot, state !== 'pending' && styles.dotOn]}>{state === 'pending' ? '○' : state === 'current' ? '●' : '✓'}</Text>
            <Text style={[styles.label, state === 'current' && styles.labelCurrent]}>{name}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s },
  step: { flex: 1, alignItems: 'center', gap: space.xs },
  dot: { fontSize: 18, color: colors.border },
  dotOn: { color: colors.primary },
  label: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  labelCurrent: { color: colors.text, fontWeight: '700' },
});
