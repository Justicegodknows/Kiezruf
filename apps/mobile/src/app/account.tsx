// Account (US-29, US-34, US-35, US-36): language, notification settings, my reports, followed reports,
// sign out, and account deletion with confirmation.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deleteMe,
  getMe,
  type Locale,
  myFollows,
  myReports,
  notificationSettings,
  saveNotificationSettings,
  updateMe,
} from '../api/endpoints';
import { errorMessage } from '../api/errors';
import type { NotificationSettings } from '../api/schemas';
import { useAuth } from '../auth/AuthProvider';
import { currentLocale, LOCALES, setLocale } from '../i18n';
import { BottomNav } from '../ui/BottomNav';
import { Banner, Button, Chip, ErrorText, SectionTitle } from '../ui/components';
import { ReportCard } from '../ui/ReportCard';
import { colors, space, TOUCH } from '../ui/theme';

const TYPES = ['statusChange', 'goLive'] as const;
const CHANNELS = ['push', 'email'] as const;

export default function AccountScreen() {
  const { t, i18n } = useTranslation();
  const { signedIn, requireSignIn, signOut, forgetSession, pushStatus } = useAuth();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = useQuery({ queryKey: ['me', 'profile'], queryFn: getMe, enabled: signedIn });
  const settings = useQuery({ queryKey: ['me', 'notification-settings'], queryFn: notificationSettings, enabled: signedIn });
  const reports = useQuery({ queryKey: ['me', 'reports'], queryFn: myReports, enabled: signedIn });
  const follows = useQuery({ queryKey: ['me', 'follows'], queryFn: myFollows, enabled: signedIn });

  const saveSettings = useMutation({
    mutationFn: saveNotificationSettings,
    onMutate: (next) => {
      const previous = queryClient.getQueryData<NotificationSettings>(['me', 'notification-settings']);
      queryClient.setQueryData(['me', 'notification-settings'], next);
      return { previous };
    },
    onError: (e, _next, ctx) => {
      queryClient.setQueryData(['me', 'notification-settings'], ctx?.previous);
      setError(errorMessage(t, e));
    },
  });

  const deleteAccount = useMutation({
    mutationFn: deleteMe,
    onSuccess: async () => {
      await forgetSession();
      setNotice(t('account.deleted'));
    },
    onError: (e) => setError(errorMessage(t, e)),
  });

  const changeLanguage = async (locale: Locale) => {
    setError(null);
    await setLocale(locale);
    if (signedIn) updateMe({ locale }).catch((e: unknown) => setError(errorMessage(t, e)));
  };

  const confirmDelete = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.deleteConfirm'), style: 'destructive', onPress: () => deleteAccount.mutate() },
    ]);

  const toggle = (type: (typeof TYPES)[number], channel: (typeof CHANNELS)[number], value: boolean) => {
    if (!settings.data) return;
    setError(null);
    saveSettings.mutate({ ...settings.data, [type]: { ...settings.data[type], [channel]: value } });
  };

  const open = (publicId: string) => router.push({ pathname: '/report/[publicId]', params: { publicId } });
  const language = currentLocale();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} testID="account-screen">
        <Text accessibilityRole="header" style={styles.title}>
          {t('account.title')}
        </Text>
        {notice ? (
          <Banner tone="success" testID="account-notice">
            {notice}
          </Banner>
        ) : null}
        <ErrorText message={error} testID="account-error" />

        {signedIn ? (
          me.data ? <Text style={styles.muted}>{t('account.confirmed', { email: me.data.email })}</Text> : null
        ) : (
          <>
            <Text style={styles.body}>{t('account.guestIntro')}</Text>
            <Button testID="account-signin" variant="primary" label={t('account.signIn')} onPress={() => requireSignIn('continue')} />
          </>
        )}

        <SectionTitle>{t('account.language')}</SectionTitle>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('account.language')} key={i18n.language}>
          {LOCALES.map((locale) => (
            <Chip
              key={locale}
              testID={`language-${locale}`}
              label={locale === 'de' ? t('account.deutsch') : t('account.english')}
              selected={language === locale}
              onPress={() => void changeLanguage(locale)}
            />
          ))}
        </View>

        {signedIn ? (
          <>
            <SectionTitle>{t('account.notifications')}</SectionTitle>
            {pushStatus && pushStatus !== 'registered' ? <Text style={styles.muted}>{t('account.pushMissing')}</Text> : null}
            {settings.isError ? <ErrorText message={errorMessage(t, settings.error)} /> : null}
            {settings.data
              ? TYPES.map((type) => (
                  <View key={type} style={styles.setting}>
                    <Text style={styles.bold}>{t(`account.${type}`)}</Text>
                    {CHANNELS.map((channel) => (
                      <View key={channel} style={styles.switchRow}>
                        <Text style={styles.body}>{t(`account.${channel}`)}</Text>
                        <Switch
                          testID={`setting-${type}-${channel}`}
                          value={settings.data[type][channel]}
                          onValueChange={(v) => toggle(type, channel, v)}
                          accessibilityRole="switch"
                          accessibilityLabel={t('account.channelA11y', { type: t(`account.${type}`), channel: t(`account.${channel}`) })}
                          accessibilityState={{ checked: settings.data[type][channel] }}
                          trackColor={{ true: colors.primary, false: colors.border }}
                        />
                      </View>
                    ))}
                  </View>
                ))
              : null}

            <SectionTitle>{t('account.myReports')}</SectionTitle>
            {reports.data?.reports.length === 0 ? <Text style={styles.muted}>{t('account.myReportsEmpty')}</Text> : null}
            <View style={styles.list} testID="account-my-reports">
              {reports.data?.reports.map((r) => (
                <ReportCard key={r.publicId} report={r} onPress={() => open(r.publicId)} />
              ))}
            </View>

            <SectionTitle>{t('account.follows')}</SectionTitle>
            {follows.data?.reports.length === 0 ? <Text style={styles.muted}>{t('account.followsEmpty')}</Text> : null}
            <View style={styles.list} testID="account-follows">
              {follows.data?.reports.map((r) => (
                <ReportCard key={r.publicId} report={r} onPress={() => open(r.publicId)} />
              ))}
            </View>

            <Button testID="account-signout" label={t('account.signOut')} onPress={() => void signOut()} style={styles.spaced} />
            <Button testID="account-delete" variant="danger" label={t('account.delete')} onPress={confirmDelete} busy={deleteAccount.isPending} />
          </>
        ) : null}
      </ScrollView>
      <BottomNav current="account" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.l, gap: space.m, paddingBottom: space.xl * 2 },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  bold: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', gap: space.s },
  setting: { gap: space.xs, paddingVertical: space.s, borderBottomWidth: 1, borderBottomColor: colors.divider },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TOUCH },
  list: { gap: space.s },
  spaced: { marginTop: space.xl },
});
