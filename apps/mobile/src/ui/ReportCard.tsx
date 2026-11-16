// A report in a list. Shows category, status, distance, age and the public Me too count. Never a score or
// level (US-24): the data it receives has none.
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ageLabel, categoryName, distanceText } from '../lib/format';
import { colors, radius, space } from './theme';

export interface CardReport {
  publicId: string;
  category: string;
  status: string;
  createdAt: string;
  description?: string | null;
  distanceM?: number;
  meTooCount?: number;
}

export function ReportCard({ report, onPress }: { report: CardReport; onPress: () => void }) {
  const { t } = useTranslation();
  const category = categoryName(t, report.category);
  const status = t(`status.${report.status}`);
  const age = ageLabel(t, report.createdAt);
  const distance = report.distanceM !== undefined ? distanceText(t, report.distanceM) : null;
  const meta = [status, distance, age].filter(Boolean).join(' · ');
  const label =
    report.distanceM !== undefined
      ? t('home.cardA11y', { category, status, distance, age, count: report.meTooCount ?? 0 })
      : `${category}, ${meta}, ${report.publicId}`;

  return (
    <Pressable
      testID={`report-card-${report.publicId}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.row}>
        <Text style={styles.title}>{category}</Text>
        <Text style={styles.id}>{report.publicId}</Text>
      </View>
      {report.description ? (
        <Text style={styles.desc} numberOfLines={2}>
          {report.description}
        </Text>
      ) : null}
      <Text style={styles.meta}>{meta}</Text>
      {report.meTooCount !== undefined ? <Text style={styles.meta}>{`✋ ${t('home.meTooCount', { count: report.meTooCount })}`}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.m,
    borderRadius: radius.m,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    gap: space.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  id: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  desc: { fontSize: 15, color: colors.text },
  meta: { fontSize: 14, color: colors.muted },
});
