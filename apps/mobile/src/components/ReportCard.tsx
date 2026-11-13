import { PHOTOS, type PublicReport } from '@kiezruf/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAge, formatDistance } from '@/i18n/format';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space } from '@/theme/tokens';
import { Icon } from './Icon';
import { Photo } from './Photo';
import { StatusBadge, Tag } from './StatusBadge';

/** A nearby report. Citizen view: status, Me too and comments only, never score or level (US-24). */
export function ReportCard({ report: r }: { report: PublicReport }) {
  const { t } = useTranslation();
  const { colors: c, lang } = useSettings();
  const facility = r.category === 'facility';

  return (
    <Pressable
      onPress={() => router.push(`/reports/${r.id}`)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.card, { backgroundColor: c.surface, borderColor: pressed ? c.ink2 : c.line }]}
    >
      <Photo photo={r.photo} alt={t('report.photoAlt', { place: PHOTOS[r.photo].place })} aspectRatio={16 / 7} rounded={false} />
      <View style={styles.body}>
        <View style={styles.meta}>
          <View style={styles.fact}>
            <Icon name={facility ? 'building' : 'trafficLight'} size={15} color={facility ? c.open : c.brand} />
            <Text style={[styles.kind, { color: c.ink2 }]}>{t(`subcategories.${r.subcategory}`)}</Text>
          </View>
          <View style={styles.fact}>
            <Icon name="pin" size={14} color={c.muted} />
            <Text style={[styles.metaText, { color: c.muted }]}>{formatDistance(r.distanceMetres, lang)}</Text>
          </View>
          <View style={styles.fact}>
            <Icon name="clock" size={14} color={c.muted} />
            <Text style={[styles.metaText, { color: c.muted }]}>{formatAge(r.ageHours, lang)}</Text>
          </View>
        </View>
        <Text style={[styles.title, { color: c.ink }]}>{r.title[lang]}</Text>
        <Text style={[styles.place, { color: c.ink2 }]}>{r.place}</Text>
        <View style={styles.footer}>
          <StatusBadge status={r.status} />
          {r.safetyCategory && <Tag icon="shield" label={t('report.safety')} />}
          <View style={styles.fact} accessibilityLabel={t('report.affected', { n: r.meToo })}>
            <Icon name="hand" size={16} color={c.muted} />
            <Text style={[styles.metaText, { color: c.muted }]}>{r.meToo}</Text>
          </View>
          <View style={styles.fact} accessibilityLabel={t('report.commentCount', { n: r.comments.length })}>
            <Icon name="message" size={16} color={c.muted} />
            <Text style={[styles.metaText, { color: c.muted }]}>{r.comments.length}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  body: { gap: 3, padding: space.lg + 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2 },
  kind: { fontFamily: fonts.semibold, fontSize: 14 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.regular, fontSize: 14, fontVariant: ['tabular-nums'] },
  title: { fontFamily: fonts.displaySemibold, fontSize: 23, lineHeight: 25, marginTop: 4 },
  place: { fontFamily: fonts.regular, fontSize: 15 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: space.sm },
});
