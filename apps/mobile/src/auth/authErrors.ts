// Supabase Auth errors, reduced to the app's own error codes so the sign-in sheet shows translated text.
import { isAuthError } from '@supabase/supabase-js';
import type { ErrorCode } from '../api/errors';

export type SignInStep = 'send' | 'verify';

/** 'email_invalid' is shown with signin.emailInvalid; everything else with errors.<code>. */
export type SignInErrorCode = ErrorCode | 'email_invalid';

export function signInErrorCode(error: unknown, step: SignInStep): SignInErrorCode {
  if (!isAuthError(error)) return 'unknown';
  const code = error.code;
  const status = error.status ?? 0;
  // AuthRetryableFetchError: no answer from Supabase (offline, timeout, 5xx gateway).
  if (error.name === 'AuthRetryableFetchError' || status === 0) return 'network';
  if (code === 'email_address_invalid') return 'email_invalid';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return step === 'send' ? 'too_many_codes' : 'too_many_attempts';
  }
  // Supabase answers an unknown or expired code with otp_expired (403); other 4xx on verify mean the same to us.
  if (step === 'verify' && (code === 'otp_expired' || (status >= 400 && status < 500))) return 'invalid_code';
  if (code === 'validation_failed') return 'invalid_request';
  return 'unknown';
}
