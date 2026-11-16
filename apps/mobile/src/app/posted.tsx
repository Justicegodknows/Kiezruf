// Report posted (US-11, US-41, US-20): the report ID with the tenant code, and the receiving office.
// The report is in My reports right away (GET /me/reports); it reaches the public map after blurring.
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../ui/components';
import { colors, space } from '../ui/theme';

export default function PostedScreen() {
  const { publicId, office } = useLocalSearchParams<{ publicId: string; office?: string }>();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.ok} importantForAccessibility="no-hide-descendants">
          <Text style={styles.okText}>✓</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title} testID="posted-title">
          {t('posted.title')}
        </Text>
        <Text style={styles.id} testID="posted-id" accessibilityLabel={t('posted.idA11y', { id: publicId })}>
          {`#${publicId}`}
        </Text>
        <Text style={styles.body}>{t('posted.sentTo', { office: office ?? '' })}</Text>
        <Button
          testID="posted-see"
          variant="primary"
          label={t('posted.seeReport')}
          onPress={() => {
            router.dismissTo('/');
            router.push({ pathname: '/report/[publicId]', params: { publicId } });
          }}
        />
        <Button testID="posted-back" label={t('posted.backToMap')} onPress={() => router.dismissTo('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, padding: space.xl, gap: space.l, justifyContent: 'center' },
  ok: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: { fontSize: 40, color: colors.success, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  id: { fontSize: 20, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
  body: { fontSize: 16, color: colors.muted, textAlign: 'center' },
});
