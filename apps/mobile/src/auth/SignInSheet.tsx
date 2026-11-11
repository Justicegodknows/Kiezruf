// Sign-in sheet (US-01, US-37): email + 6-digit code. It opens the first time someone posts, comments,
// votes or follows; after the code is confirmed, the action they started completes on its own.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { requestCode, verifyCode } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { currentLocale } from '../i18n';
import { Button, ErrorText } from '../ui/components';
import { colors, radius, space, TOUCH } from '../ui/theme';
import { useAuth } from './AuthProvider';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInSheet() {
  const { t } = useTranslation();
  const { sheet, closeSheet, completeSignIn } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sheet) {
      setStep('email');
      setCode('');
      setError(null);
    }
  }, [sheet]);

  if (!sheet) return null;

  const sendCode = async () => {
    const address = email.trim();
    if (!EMAIL.test(address)) return setError(t('signin.emailInvalid'));
    setBusy(true);
    setError(null);
    try {
      await requestCode(address, currentLocale());
      setStep('code');
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) return setError(t('signin.codeInvalid'));
    setBusy(true);
    setError(null);
    try {
      const session = await verifyCode(email.trim(), code, currentLocale());
      setBusy(false);
      await completeSignIn(session.token);
    } catch (e) {
      setBusy(false);
      setError(errorMessage(t, e));
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeSheet} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet} testID="signin-sheet" accessibilityViewIsModal>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title} testID="signin-title">
              {step === 'email' ? t(`signin.title.${sheet}`) : t('signin.codeTitle')}
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

          {step === 'email' ? (
            <>
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
                textContentType="emailAddress"
                autoCorrect={false}
                accessibilityLabel={t('signin.emailLabel')}
                accessibilityLabelledBy="signin-email-label"
                style={styles.input}
                onSubmitEditing={sendCode}
                returnKeyType="send"
              />
              <ErrorText message={error} testID="signin-error" />
              <Button testID="signin-send" variant="primary" label={t('signin.sendCode')} onPress={sendCode} busy={busy} />
            </>
          ) : (
            <>
              <Text style={styles.body}>{t('signin.codeSent', { email: email.trim() })}</Text>
              <Text style={styles.label} nativeID="signin-code-label">
                {t('signin.codeLabel')}
              </Text>
              <TextInput
                testID="signin-code"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                accessibilityLabel={t('signin.codeLabel')}
                accessibilityLabelledBy="signin-code-label"
                style={[styles.input, styles.code]}
                onSubmitEditing={confirm}
              />
              <ErrorText message={error} testID="signin-error" />
              <Button testID="signin-confirm" variant="primary" label={t(`signin.confirm.${sheet}`)} onPress={confirm} busy={busy} />
              <View style={styles.links}>
                <Button variant="ghost" label={t('signin.resend')} onPress={sendCode} disabled={busy} />
                <Button
                  variant="ghost"
                  label={t('signin.changeEmail')}
                  onPress={() => {
                    setStep('email');
                    setError(null);
                  }}
                />
              </View>
            </>
          )}
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
  code: { letterSpacing: 8, fontSize: 22 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
