// "Already reported?" (US-13), between compose and posting. Shows up to 3 public reports within 150 m in the same
// category group, most similar first: blurred photo, category, status, distance and the Me too count. "Add my
// photo to this report" makes the citizen a co-reporter (POST /reports/:publicId/co-report) and opens the report;
// "No, mine is new" posts the draft as its own report. No score or level: the matches are public data (US-24).
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DuplicateMatch } from '../api/schemas';
import { useAuth } from '../auth/AuthProvider';
import { categoryName, distanceText } from '../lib/format';
import { useDraft } from '../report/DraftProvider';
import { usePosting } from '../report/usePosting';
import { Button, ErrorText } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

export default function DuplicatesScreen() {
  const { t } = useTranslation();
  const { requireSignIn } = useAuth();
  const { draft } = useDraft();
  const { postAsNew, addToReport, busy, progressText, error } = usePosting();
  const matches = draft.duplicates.slice(0, 3);

  if (draft.photos.length === 0 || matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>{t('compose.noPhotos')}</Text>
        <Button variant="primary" label={t('nav.newReport')} onPress={() => router.replace('/camera')} />
      </View>
    );
  }

  const closest = Math.min(...matches.map((m) => m.distanceM));
  // Co-reporting needs a session like posting does (the session may have ended since posting started).
  const onAdd = (publicId: string) => requireSignIn('add', () => void addToReport(draft, publicId));
  const onNew = () => requireSignIn('post', () => void postAsNew(draft));

  return (
    <ScrollView contentContainerStyle={styles.content} testID="dup-screen">
      <Text accessibilityRole="header" style={styles.title}>
        {t('dup.heading')}
      </Text>
      <Text style={styles.body}>{t('dup.intro', { count: matches.length, distance: distanceText(t, closest) })}</Text>

      {matches.map((match) => (
        <MatchCard key={match.publicId} match={match} busy={busy} onAdd={() => onAdd(match.publicId)} />
      ))}

      <ErrorText message={error} testID="dup-error" />
      {progressText ? (
        <Text style={styles.muted} accessibilityLiveRegion="polite" testID="dup-progress">
          {progressText}
        </Text>
      ) : null}
      <Button testID="dup-new" label={t('dup.mineIsNew')} accessibilityHint={t('dup.mineIsNewHint')} onPress={onNew} busy={busy} />
    </ScrollView>
  );
}

function MatchCard({ match, busy, onAdd }: { match: DuplicateMatch; busy: boolean; onAdd: () => void }) {
  const { t } = useTranslation();
  const category = categoryName(t, match.category);
  const status = t(`status.${match.status}`);
  const distance = distanceText(t, match.distanceM);
  const summary = t('dup.matchA11y', { category, status, distance, count: match.meTooCount });
  return (
    <View style={styles.card} testID={`dup-match-${match.publicId}`}>
      {match.photo ? (
        <Image
          source={{ uri: match.photo }}
          style={styles.photo}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('dup.photoA11y', { category })}
        />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Text style={styles.muted}>{t('detail.noPhoto')}</Text>
        </View>
      )}
      <View accessible accessibilityLabel={summary} style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>{category}</Text>
          <Text style={styles.id}>{match.publicId}</Text>
        </View>
        <Text style={styles.muted}>{[status, t('dup.away', { distance })].join(' · ')}</Text>
        <Text style={styles.muted}>{`✋ ${t('home.meTooCount', { count: match.meTooCount })}`}</Text>
      </View>
      <Button
        testID={`dup-add-${match.publicId}`}
        variant="primary"
        label={t('dup.addMyPhoto')}
        accessibilityLabel={t('dup.addMyPhotoA11y', { category, distance })}
        accessibilityHint={t('dup.addMyPhotoHint')}
        onPress={onAdd}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.m, paddingBottom: space.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.m },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  card: { borderRadius: radius.m, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface, padding: space.m, gap: space.s },
  photo: { width: '100%', height: 180, borderRadius: radius.s, backgroundColor: colors.sunk },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  info: { gap: space.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.s },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, flexShrink: 1 },
  id: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
});
