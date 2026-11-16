// Sign-in sheet (US-01, US-37, ENG-24): email and password, or a new account. It opens the first time someone posts,
// comments, votes or follows; once signed in, the action they started completes on its own.
// Supabase Auth (ENG-22): signInWithPassword, or signUp (no confirmation email, so it signs in at once).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { currentLocale } from '../i18n';
import { Button, ErrorText } from '../ui/components';
import { colors, radius, space, TOUCH } from '../ui/theme';
import { type SignInStep, signInErrorCode } from './authErrors';
import { useAuth } from './AuthProvider';
import { supabase } from './supabase';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Supabase's minimum_password_length (supabase/config.toml). */
const PASSWORD_MIN = 10;

export function SignInSheet() {
  const { sheet } = useAuth();
  // The form mounts each time the sheet opens, so it always starts at the email step with no old code or error.
  return sheet ? <SignInForm key={sheet} sheet={sheet} /> : null;
}

type SheetReason = NonNullable<ReturnType<typeof useAuth>['sheet']>;

function SignInForm({ sheet }: { sheet: SheetReason }) {
  const { t } = useTranslation();
  const { closeSheet, completeSignIn } = useAuth();
  const [mode, setMode] = useState<SignInStep>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creating = mode === 'sign-up';

  const failed = (e: unknown) => {
    const reason = signInErrorCode(e, mode);
    setError(reason === 'email_invalid' ? t('signin.emailInvalid') : t(`errors.${reason}`));
  };

  const submit = async () => {
    const address = email.trim();
    if (!EMAIL.test(address)) return setError(t('signin.emailInvalid'));
    if (creating && password.length < PASSWORD_MIN) return setError(t('signin.passwordTooShort'));
    if (!password) return setError(t('errors.invalid_credentials'));
    setBusy(true);
    setError(null);
    try {
      // data.locale lands in the new user's metadata, the language of the account's emails (US-35).
      const { data, error: authError } = creating
        ? await supabase.auth.signUp({ email: address, password, options: { data: { locale: currentLocale() } } })
        : await supabase.auth.signInWithPassword({ email: address, password });
      if (authError) throw authError;
      // Without a session the project would be waiting for a confirmation email, which Kiezruf does not use (ENG-24).
      if (!data.session) {
        setBusy(false);
        return setError(t('errors.unknown'));
      }
      setBusy(false);
      await completeSignIn(data.session);
    } catch (e) {
      setBusy(false);
      failed(e);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeSheet} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet} testID="signin-sheet" accessibilityViewIsModal>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title} testID="signin-title">
              {t(`signin.title.${sheet}`)}
            </Text>
            <Pressable
              testID="signin-close"
              onPress={closeSheet}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={styles.close}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.body}>{t('signin.intro')}</Text>
          <Text style={styles.label} nativeID="signin-email-label">
            {t('signin.emailLabel')}
          </Text>
          <TextInput
            testID="signin-identifier"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType={creating ? 'emailAddress' : 'username'}
            autoCorrect={false}
            accessibilityLabel={t('signin.emailLabel')}
            accessibilityLabelledBy="signin-email-label"
            style={styles.input}
            returnKeyType="next"
          />
          <Text style={styles.label} nativeID="signin-password-label">
            {creating ? t('signin.newPasswordLabel') : t('signin.passwordLabel')}
          </Text>
          <TextInput
            testID="signin-password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={creating ? 'new-password' : 'current-password'}
            textContentType={creating ? 'newPassword' : 'password'}
            maxLength={72}
            accessibilityLabel={creating ? t('signin.newPasswordLabel') : t('signin.passwordLabel')}
            accessibilityLabelledBy="signin-password-label"
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <ErrorText message={error} testID="signin-error" />
          <Button
            testID="signin-submit"
            variant="primary"
            label={creating ? t('signin.create') : t('signin.submit')}
            onPress={submit}
            busy={busy}
          />
          <Button
            testID="signin-switch"
            variant="ghost"
            label={creating ? t('signin.toSignIn') : t('signin.toCreate')}
            onPress={() => {
              setMode(creating ? 'sign-in' : 'sign-up');
              setError(null);
            }}
            disabled={busy}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.m * 2,
    borderTopRightRadius: radius.m * 2,
    padding: space.xl,
    gap: space.m,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text },
  close: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, color: colors.text },
  body: { fontSize: 15, color: colors.muted },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.s,
    paddingHorizontal: space.m,
    fontSize: 17,
    color: colors.text,
  },
});
