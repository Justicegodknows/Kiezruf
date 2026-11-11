// Map · New report · Account, as in the prototype's citizen app.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { colors, space, TOUCH } from './theme';

export function BottomNav({ current }: { current: 'home' | 'account' }) {
  const { t } = useTranslation();
  const { signedIn } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.s) }]} accessibilityRole="tablist">
      <Pressable
        testID="nav-map"
        accessibilityRole="tab"
        accessibilityLabel={t('nav.map')}
        accessibilityState={{ selected: current === 'home' }}
        onPress={() => current !== 'home' && router.navigate('/')}
        style={styles.item}
      >
        <Text style={[styles.text, current === 'home' && styles.on]}>{`🗺  ${t('nav.map')}`}</Text>
      </Pressable>
      <Pressable
        testID="nav-new-report"
        accessibilityRole="button"
        accessibilityLabel={t('nav.newReport')}
        onPress={() => router.push('/camera')}
        style={styles.fab}
      >
        <Text style={styles.fabText}>📷</Text>
      </Pressable>
      <Pressable
        testID="nav-account"
        accessibilityRole="tab"
        accessibilityLabel={signedIn ? t('nav.account') : t('nav.signIn')}
        accessibilityState={{ selected: current === 'account' }}
        onPress={() => current !== 'account' && router.navigate('/account')}
        style={styles.item}
      >
        <Text style={[styles.text, current === 'account' && styles.on]}>{`👤  ${signedIn ? t('nav.account') : t('nav.signIn')}`}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    paddingTop: space.s,
  },
  item: { minHeight: TOUCH, minWidth: 96, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 15, color: colors.muted },
  on: { color: colors.text, fontWeight: '700', textDecorationLine: 'underline' },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { fontSize: 26 },
});
