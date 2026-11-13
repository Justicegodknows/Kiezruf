import { listPublicReports, type Category } from '@kiezruf/shared';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chips } from '@/components/Chips';
import { Plate } from '@/components/Plate';
import { ReportCard } from '@/components/ReportCard';
import { TopBar } from '@/components/TopBar';
import { Workflow } from '@/components/Workflow';
import { formatAge, formatNumber } from '@/i18n/format';
import { useSettings } from '@/theme/settings';
import { space, type } from '@/theme/tokens';

type Filter = 'all' | Category;

export default function Home() {
  const { t } = useTranslation();
  const { colors: c, lang } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');

  const reports = useMemo(() => listPublicReports(), []);
  const plates = useMemo(
    () => reports.filter((r) => r.status !== 'resolved').sort((a, b) => a.ageHours - b.ageHours).slice(0, 3),
    [reports],
  );
  const visible = reports.filter((r) => filter === 'all' || r.category === filter);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero: the headline, then what was just reported, as street-name plates. */}
        <View style={styles.section}>
          <Text style={[type.display, { color: c.ink }]} accessibilityRole="header">
            {t('home.title')}
          </Text>
          <Text style={[type.lead, styles.lead, { color: c.ink2 }]}>{t('home.lead')}</Text>

          <Text style={[type.label, styles.caption, { color: c.muted }]} accessibilityRole="header">
            {t('home.platesLabel')}
          </Text>
          <View style={styles.plates}>
            {plates.map((r, i) => (
              <Plate
                key={r.id}
                index={i}
                href={`/reports/${r.id}`}
                street={r.street}
                district={t('home.district')}
                issue={r.title[lang]}
                age={formatAge(r.ageHours, lang)}
              />
            ))}
          </View>
          <Text style={[type.small, styles.figures, { color: c.muted }]}>
            {t('home.figures', { open: formatNumber(101, lang), resolved: formatNumber(214, lang) })}
          </Text>
        </View>

        <View style={[styles.section, styles.ruled, { borderColor: c.line }]}>
          <Text style={[type.title, { color: c.ink }]} accessibilityRole="header">
            {t('home.stepsTitle')}
          </Text>
          <Text style={[type.body, styles.intro, { color: c.ink2 }]}>{t('home.stepsLead')}</Text>
          <Workflow />
        </View>

        <View style={[styles.section, styles.ruled, { borderColor: c.line, backgroundColor: c.sunk }]}>
          <Text style={[type.title, { color: c.ink }]} accessibilityRole="header">
            {t('home.nearbyTitle')}
          </Text>
          <Text style={[type.body, styles.intro, { color: c.ink2 }]}>{t('home.nearbyLead')}</Text>
          <Chips
            label={t('home.filterLabel')}
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: t('home.filterAll') },
              { key: 'traffic', label: t('categories.traffic') },
              { key: 'facility', label: t('categories.facility') },
            ]}
          />
          <Text style={[type.small, styles.count, { color: c.muted }]} accessibilityLiveRegion="polite">
            {t('home.count', { n: visible.length })}
          </Text>
          <View style={styles.list}>
            {visible.length === 0 ? (
              <Text style={[type.body, { color: c.muted }]}>{t('home.empty')}</Text>
            ) : (
              visible.map((r) => <ReportCard key={r.id} report={r} />)
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flexGrow: 1 },
  section: { paddingHorizontal: space.lg, paddingVertical: space.section },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  lead: { marginTop: space.lg },
  caption: { marginTop: space.section - space.lg, marginBottom: space.md },
  plates: { gap: space.md },
  figures: { marginTop: space.lg, maxWidth: 420 },
  intro: { marginTop: space.md, marginBottom: space.xxl },
  count: { marginTop: space.lg, marginBottom: space.md },
  list: { gap: space.md },
});
