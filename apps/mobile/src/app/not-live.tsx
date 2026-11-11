// Not live here yet (US-44): the message, and "Tell me when it starts here" (POST /go-live-alerts).
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { goLiveAlert } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/AuthProvider';
import { useDraft } from '../report/DraftProvider';
import { Button, ErrorText } from '../ui/components';
import { colors, space } from '../ui/theme';

export default function NotLiveScreen() {
  const { tenant, lat, lon } = useLocalSearchParams<{ tenant?: string; lat?: string; lon?: string }>();
  const { t } = useTranslation();
  const { requireSignIn } = useAuth();
  const { reset } = useDraft();
  const point = { lat: Number(lat), lon: Number(lon) };
  const hasPoint = Number.isFinite(point.lat) && Number.isFinite(point.lon);

  const alert = useMutation({ mutationFn: () => goLiveAlert(point) });
  const done = alert.isSuccess || (alert.error as { code?: string } | null)?.code === 'already_live';

  return (
    <ScrollView contentContainerStyle={styles.content} testID="notlive-screen">
      <View style={styles.badge} importantForAccessibility="no-hide-descendants">
        <Text style={styles.badgeText}>⌖</Text>
      </View>
      <Text accessibilityRole="header" style={styles.heading} testID="notlive-heading">
        {tenant ? t('notLive.heading', { tenant }) : t('notLive.headingUnknown')}
      </Text>
      <Text style={styles.body}>{t('notLive.body')}</Text>
      {hasPoint ? (
        <Button
          testID="notlive-notify"
          variant={done ? 'secondary' : 'primary'}
          icon={done ? '✓' : undefined}
          label={done ? t('notLive.notified') : t('notLive.notify')}
          disabled={done}
          busy={alert.isPending}
          onPress={() => requireSignIn('continue', () => alert.mutate())}
        />
      ) : null}
      {alert.isError && !done ? <ErrorText message={errorMessage(t, alert.error)} testID="notlive-error" /> : null}
      <Button
        testID="notlive-back"
        label={t('notLive.backToMap')}
        onPress={() => {
          reset();
          router.dismissTo('/');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.l, alignItems: 'stretch' },
  badge: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.sunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 32, color: colors.muted },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  body: { fontSize: 16, color: colors.muted, textAlign: 'center' },
});
