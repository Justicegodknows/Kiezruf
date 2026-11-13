import { getPublicReport, STATUS_ORDER, type IconName } from '@kiezruf/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { ReportScene } from '@/components/ReportScene';
import { StatusBadge, Tag } from '@/components/StatusBadge';
import { formatAge, formatDistance } from '@/i18n/format';
import { useSettings } from '@/theme/settings';
import { fonts, radius, space, touchTarget, type } from '@/theme/tokens';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors: c, lang } = useSettings();
  const report = getPublicReport(id);
  // US-18. Until sign-in exists (US-01) the vote is local to this screen; a second tap takes it back.
  const [voted, setVoted] = useState(false);

  if (!report) {
    return (
      <SafeAreaView style={[styles.screen, styles.center, { backgroundColor: c.bg }]}>
        <Text style={[type.body, { color: c.ink }]}>{t('report.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const title = report.title[lang];
  const step = STATUS_ORDER.indexOf(report.status);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]} edges={['top']}>
      <View style={[styles.nav, { borderColor: c.line }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          style={styles.back}
          hitSlop={8}
        >
          <Icon name="arrowLeft" size={20} color={c.ink2} />
          <Text style={[type.label, { color: c.ink2 }]}>{t('report.back')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.media, { borderColor: c.line }]}>
          <ReportScene subcategory={report.subcategory} colors={c} label={t('report.photoAlt', { title })} />
        </View>

        <View style={styles.block}>
          <Text style={[type.small, { color: c.muted }]}>
            {t(`categories.${report.category}`)} / <Text style={{ color: c.ink, fontFamily: fonts.semibold }}>{t(`subcategories.${report.subcategory}`)}</Text>
          </Text>
          <Text style={[type.title, { color: c.ink }]} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.badges}>
            <StatusBadge status={report.status} />
            {report.safetyCategory && <Tag icon="shield" label={t('report.safety')} />}
          </View>
          <Text style={[type.lead, { color: c.ink2 }]}>{report.description[lang]}</Text>
        </View>

        {report.officeNote && (
          <View style={[styles.callout, { backgroundColor: c.brandSoft, borderColor: c.brand }]}>
            <Icon name="building" size={20} color={c.brandInk} />
            <View style={styles.flex}>
              <Text style={[type.label, { color: c.brandInk, fontFamily: fonts.semibold }]}>{t('report.officeNote')}</Text>
              <Text style={[type.body, { color: c.ink }]}>{report.officeNote[lang]}</Text>
            </View>
          </View>
        )}

        <Section title={t('report.progress')}>
          <View style={styles.timeline}>
            {/* One track behind all dots (centre of the first to centre of the last), filled up to the current step. */}
            <View style={[styles.tTrack, { backgroundColor: c.line }]}>
              <View style={[styles.tFill, { backgroundColor: c.brand, width: `${(step / (STATUS_ORDER.length - 1)) * 100}%` }]} />
            </View>
            {STATUS_ORDER.map((s, i) => {
              const state = i < step ? 'done' : i === step ? 'current' : 'todo';
              return (
                <View key={s} style={styles.tStep} accessibilityState={{ selected: state === 'current' }}>
                  <View
                    style={[
                      styles.tDot,
                      state === 'done' && { backgroundColor: c.brand, borderColor: c.brand },
                      state === 'current' && { borderColor: c.brand, backgroundColor: c.surface },
                      state === 'todo' && { borderColor: c.lineStrong, backgroundColor: c.surface },
                    ]}
                  >
                    {state === 'done' && <Icon name="tick" size={14} color={c.onBrand} />}
                    {state === 'current' && <View style={[styles.tCore, { backgroundColor: c.brand }]} />}
                  </View>
                  <Text style={[styles.tLabel, { color: state === 'current' ? c.ink : c.muted, fontFamily: state === 'current' ? fonts.semibold : fonts.regular }]}>
                    {t(`status.${s}`)}
                  </Text>
                </View>
              );
            })}
          </View>
        </Section>

        <Section title={t('report.details')}>
          <View style={[styles.facts, { borderColor: c.line, backgroundColor: c.surface }]}>
            <Fact icon="pin" label={t('report.location')} value={report.place} sub={t('report.distance', { distance: formatDistance(report.distanceMetres, lang) })} />
            <Fact icon="clock" label={t('report.reported')} value={formatAge(report.ageHours, lang)} />
            <Fact icon="users" label={t('report.involvement')} value={t('report.coReporters', { n: report.coReporters })} sub={t('report.commentCount', { n: report.comments.length })} />
            <Fact icon="inbox" label={t('report.reference')} value={report.id} last />
          </View>
        </Section>

        <Section title={`${t('report.comments')} (${report.comments.length})`}>
          {report.comments.length === 0 ? (
            <Text style={[type.body, { color: c.muted }]}>{t('report.noComments')}</Text>
          ) : (
            <View style={styles.comments}>
              {report.comments.map((cm, i) => (
                <View key={i} style={[styles.comment, cm.staff ? { backgroundColor: c.brandSoft, borderColor: 'transparent' } : { backgroundColor: c.surface, borderColor: c.line }]}>
                  <View style={[styles.avatar, { backgroundColor: cm.staff ? c.brand : c.sunk }]}>
                    {cm.staff ? <Icon name="building" size={16} color={c.onBrand} /> : <Text style={[type.label, { color: c.ink2 }]}>{cm.author.charAt(0)}</Text>}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[type.small, { color: c.muted }]}>
                      <Text style={{ color: c.ink, fontFamily: fonts.semibold }}>{cm.author}</Text>
                      {'   '}
                      {formatAge(cm.ageHours, lang)}
                    </Text>
                    <Text style={[type.body, { color: c.ink }]}>{cm.text[lang]}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Section>
      </ScrollView>

      {/* The screen's one signal-yellow action, always in reach. */}
      <SafeAreaView edges={['bottom']} style={[styles.actionBar, { backgroundColor: c.bg, borderColor: c.line }]}>
        <Pressable
          onPress={() => setVoted((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: voted }}
          style={({ pressed }) => [
            styles.meToo,
            voted ? { backgroundColor: c.signalSoft, borderColor: c.signal } : { backgroundColor: pressed ? c.signalPressed : c.signal, borderColor: c.signal },
          ]}
        >
          <Icon name={voted ? 'check' : 'hand'} size={20} color={voted ? c.ink : c.onSignal} />
          <Text style={[styles.meTooText, { color: voted ? c.ink : c.onSignal }]}>{voted ? t('report.meTooPressed') : t('report.meToo')}</Text>
        </Pressable>
        <Text style={[type.small, styles.affected, { color: c.muted }]} accessibilityLiveRegion="polite">
          {t('report.affected', { n: report.meToo + (voted ? 1 : 0) })}
        </Text>
      </SafeAreaView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { colors: c } = useSettings();
  return (
    <View style={styles.block}>
      <Text style={[type.heading, { color: c.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Fact({ icon, label, value, sub, last }: { icon: IconName; label: string; value: string; sub?: string; last?: boolean }) {
  const { colors: c } = useSettings();
  return (
    <View style={[styles.fact, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line }]} accessible>
      <View style={styles.factLabel}>
        <Icon name={icon} size={16} color={c.muted} />
        <Text style={[type.small, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={[type.body, { color: c.ink, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }]}>{value}</Text>
      {sub && <Text style={[type.small, { color: c.muted }]}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  nav: { paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: touchTarget, alignSelf: 'flex-start' },
  scroll: { padding: space.lg, paddingBottom: space.section, gap: space.xxl },
  media: { aspectRatio: 16 / 9, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  block: { gap: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  callout: { flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.md, borderLeftWidth: 3 },
  timeline: { flexDirection: 'row' },
  tStep: { flex: 1, alignItems: 'center', gap: space.sm },
  tTrack: { position: 'absolute', top: 11, left: '12.5%', right: '12.5%', height: 2 },
  tFill: { height: 2 },
  tDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tCore: { width: 8, height: 8, borderRadius: 4 },
  tLabel: { fontSize: 13, textAlign: 'center' },
  facts: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.lg },
  fact: { paddingVertical: space.md, gap: 2 },
  factLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comments: { gap: space.md },
  comment: { flexDirection: 'row', gap: space.md, padding: space.lg - 2, borderRadius: radius.md, borderWidth: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionBar: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
  meToo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 52, borderRadius: radius.md, borderWidth: 1 },
  meTooText: { fontFamily: fonts.semibold, fontSize: 17 },
  affected: { textAlign: 'center', paddingBottom: space.sm },
});
