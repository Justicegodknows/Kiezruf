// New report / review (US-08, US-09, US-10, US-11, US-41). Category in two groups, "Other" needs a
// description, "Dangerous right now?" with the 112 / 110 banner, pin adjustable within 50 m, and the receiving
// office named before posting. Posting opens the sign-in sheet once, then uploads and posts on its own.
// Phase 3: the category is pre-selected from the photo when the AI is confident enough (US-14), and posting
// passes through "Already reported?" when there are similar reports nearby (US-13); see src/report/usePosting.ts.
import { CATEGORIES, type CategoryGroup, categoryNeedsDescription, MAX_PHOTOS, MAX_PIN_ADJUST_M } from '@kiezruf/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { categoryName } from '../lib/format';
import { distanceM } from '../lib/geo';
import { useDraft } from '../report/DraftProvider';
import { pinAllowed } from '../report/onsite';
import { draftProblem } from '../report/submit';
import { useCategorySuggestion } from '../report/useCategorySuggestion';
import { usePosting } from '../report/usePosting';
import { Banner, Button, Chip, ErrorText, SectionTitle } from '../ui/components';
import { PointMarker, ReportMap } from '../ui/ReportMap';
import { colors, radius, space, TOUCH } from '../ui/theme';

const GROUPS: CategoryGroup[] = ['traffic', 'community'];

export default function ComposeScreen() {
  const { t } = useTranslation();
  const { signedIn, requireSignIn } = useAuth();
  const { draft, anchor, removePhoto, update } = useDraft();
  const { start, busy, progressText, error, setError } = usePosting();
  const { suggesting } = useCategorySuggestion(signedIn);
  const [pinError, setPinError] = useState<string | null>(null);

  if (!anchor) {
    return (
      <View style={styles.centered}>
        <Text style={styles.body}>{t('compose.noPhotos')}</Text>
        <Button variant="primary" label={t('nav.newReport')} onPress={() => router.replace('/camera')} />
      </View>
    );
  }

  const needsDescription = draft.category !== null && categoryNeedsDescription(draft.category);
  const pin = draft.pin ?? anchor;
  const moved = draft.pin ? Math.round(distanceM(anchor, draft.pin)) : 0;

  const movePin = (to: { lat: number; lon: number }) => {
    if (!pinAllowed(anchor, to)) return setPinError(t('compose.pinTooFar', { max: MAX_PIN_ADJUST_M }));
    setPinError(null);
    update({ pin: to });
  };

  const onPost = () => {
    const problem = draftProblem(draft);
    if (problem === 'no_category') return setError(t('compose.categoryMissing'));
    if (problem === 'description_required') return setError(t('errors.description_required'));
    if (problem === 'no_photos') return setError(t('compose.noPhotos'));
    const snapshot = draft;
    requireSignIn('post', () => void start(snapshot));
  };

  // Shown while the suggested category is still the chosen one; tapping another chip changes it.
  const suggested = draft.suggestion !== null && draft.category === draft.suggestion.category;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="compose-screen">
      <SectionTitle>{t('compose.photos')}</SectionTitle>
      <View style={styles.photos}>
        {draft.photos.map((p, i) => (
          <View key={p.id} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={styles.thumb} accessible accessibilityRole="image" accessibilityLabel={t('compose.photoA11y', { n: i + 1 })} />
            <Pressable
              testID={`compose-remove-photo-${i + 1}`}
              onPress={() => removePhoto(p.id)}
              accessibilityRole="button"
              accessibilityLabel={t('compose.removePhoto', { n: i + 1 })}
              style={styles.remove}
            >
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {draft.photos.length < MAX_PHOTOS ? (
          <Button
            testID="compose-add-photo"
            label={t('compose.addPhoto')}
            icon="+"
            onPress={() => router.push({ pathname: '/camera', params: { mode: 'add' } })}
            style={styles.addPhoto}
          />
        ) : null}
      </View>

      <SectionTitle>{t('compose.category')}</SectionTitle>
      {suggested ? (
        <Banner tone="info" testID="compose-suggested">
          <Text style={styles.bold}>{`✨ ${t('compose.suggested', { category: categoryName(t, draft.category!) })}`}</Text>
          <Text style={styles.muted}>{t('compose.suggestedHint')}</Text>
        </Banner>
      ) : suggesting ? (
        <Text style={styles.muted} accessibilityLiveRegion="polite" testID="compose-suggesting">
          {t('compose.suggesting')}
        </Text>
      ) : null}
      {GROUPS.map((group) => (
        <View key={group} style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={t(`groups.${group}`)}>
          <Text style={styles.groupLabel}>{t(`groups.${group}`)}</Text>
          <View style={styles.chips}>
            {CATEGORIES.filter((c) => c.group === group).map((c) => (
              <Chip
                key={c.key}
                testID={`category-${c.key}`}
                label={categoryName(t, c.key)}
                selected={draft.category === c.key}
                onPress={() => update({ category: c.key })}
              />
            ))}
          </View>
        </View>
      ))}

      <Text style={styles.label} nativeID="description-label">
        {needsDescription ? t('compose.descriptionRequired') : t('compose.descriptionOptional')}
      </Text>
      <TextInput
        testID="report-description"
        value={draft.description}
        onChangeText={(description) => update({ description })}
        maxLength={1000}
        multiline
        placeholder={t('compose.descriptionPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={needsDescription ? t('compose.descriptionRequired') : t('compose.descriptionOptional')}
        accessibilityLabelledBy="description-label"
        style={styles.input}
      />

      <View style={styles.toggleRow}>
        <View style={styles.grow}>
          <Text style={styles.bold}>{t('compose.dangerous')}</Text>
          <Text style={styles.muted}>{t('compose.dangerousHint')}</Text>
        </View>
        <Switch
          testID="report-dangerous"
          value={draft.dangerous}
          onValueChange={(dangerous) => update({ dangerous })}
          accessibilityRole="switch"
          accessibilityLabel={t('compose.dangerous')}
          accessibilityHint={t('compose.dangerousHint')}
          accessibilityState={{ checked: draft.dangerous }}
          trackColor={{ true: colors.danger, false: colors.border }}
        />
      </View>
      {draft.dangerous ? (
        <Banner tone="danger" testID="emergency-banner">
          <Text style={styles.bold}>{`⚠ ${t('compose.emergency')}`}</Text>
          <Button testID="call-112" variant="danger" label={t('compose.call112')} onPress={() => void Linking.openURL('tel:112')} />
          <Button testID="call-110" variant="danger" label={t('compose.call110')} onPress={() => void Linking.openURL('tel:110')} />
        </Banner>
      ) : null}

      <SectionTitle>{t('compose.location')}</SectionTitle>
      <Text style={styles.body}>
        {draft.pin ? t('compose.pinMoved', { distance: moved }) : t('compose.takenHere', { accuracy: Math.round(anchor.accuracyM) })}
      </Text>
      <ReportMap
        testID="compose-map"
        accessibilityLabel={t('compose.pinMapA11y')}
        center={anchor}
        zoom={17}
        onPress={movePin}
        style={styles.map}
      >
        <PointMarker id="capture" at={anchor} kind="capture" />
        <PointMarker id="pin" at={pin} kind="pin" />
      </ReportMap>
      <Text style={styles.muted}>{t('compose.adjustHint', { max: MAX_PIN_ADJUST_M })}</Text>
      <ErrorText message={pinError} testID="compose-pin-error" />
      {draft.pin ? <Button testID="compose-pin-reset" variant="ghost" label={t('compose.pinReset')} onPress={() => update({ pin: null })} /> : null}

      <Banner tone="info" testID="compose-office">
        <Text style={styles.body}>
          {draft.route ? t('compose.office', { office: draft.route.office }) : t('compose.officeChecking')}
        </Text>
      </Banner>

      <ErrorText message={error} testID="compose-error" />
      {progressText ? (
        <Text style={styles.muted} accessibilityLiveRegion="polite" testID="compose-progress">
          {progressText}
        </Text>
      ) : null}
      <Button testID="report-post" variant="primary" label={t('compose.post')} onPress={onPost} busy={busy} />
      {signedIn ? null : <Text style={[styles.muted, styles.center]}>{t('compose.signInHint')}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.m, paddingBottom: space.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.m },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, alignItems: 'center' },
  thumbWrap: { position: 'relative' },
  thumb: { width: 96, height: 96, borderRadius: radius.s, backgroundColor: colors.sunk },
  remove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: TOUCH - 8,
    height: TOUCH - 8,
    borderRadius: (TOUCH - 8) / 2,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  addPhoto: { height: 96, minWidth: 96 },
  group: { gap: space.s },
  groupLabel: { fontSize: 15, fontWeight: '600', color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.s,
    padding: space.m,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: TOUCH },
  grow: { flex: 1 },
  bold: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  center: { textAlign: 'center' },
  map: { height: 220 },
});
