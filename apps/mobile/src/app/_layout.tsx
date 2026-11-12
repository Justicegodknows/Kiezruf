import '../i18n';
import { REPORT_ID_PATTERN } from '@kiezruf/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { SignInSheet } from '../auth/SignInSheet';
import { restoreLocale } from '../i18n';
import { publicIdFromNotification } from '../push/push';
import { DraftProvider } from '../report/DraftProvider';
import { colors } from '../ui/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Tapping a notification opens the report it is about (payload data carries publicId). */
function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const publicId = publicIdFromNotification(response?.notification.request.content.data, REPORT_ID_PATTERN);
    if (publicId) router.push({ pathname: '/report/[publicId]', params: { publicId } });
  }, [response]);
  return null;
}

export default function RootLayout() {
  const { t } = useTranslation();
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));

  useEffect(() => {
    void restoreLocale();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DraftProvider>
            <StatusBar style="dark" />
            <NotificationRouter />
            <Stack
              screenOptions={{
                headerTintColor: colors.primary,
                headerTitleStyle: { color: colors.text },
                headerBackTitle: t('common.back'),
                contentStyle: { backgroundColor: colors.surface },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false, title: t('nav.map') }} />
              <Stack.Screen name="report/[publicId]" options={{ title: t('detail.title') }} />
              <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal', title: t('nav.newReport') }} />
              <Stack.Screen name="compose" options={{ title: t('compose.title') }} />
              <Stack.Screen name="duplicates" options={{ title: t('dup.title') }} />
              <Stack.Screen name="not-live" options={{ title: t('notLive.title') }} />
              <Stack.Screen name="posted" options={{ headerShown: false, gestureEnabled: false, title: t('posted.title') }} />
              <Stack.Screen name="account" options={{ headerShown: false, title: t('account.title') }} />
            </Stack>
            <SignInSheet />
          </DraftProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
