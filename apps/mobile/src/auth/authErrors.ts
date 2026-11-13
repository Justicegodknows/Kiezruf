// Supabase Auth errors, reduced to the app's own error codes so the sign-in sheet shows translated text.
import { isAuthError } from '@supabase/supabase-js';
import type { ErrorCode } from '../api/errors';

export type SignInStep = 'sign-in' | 'sign-up';

/** 'email_invalid' is shown with signin.emailInvalid; everything else with errors.<code>. */
export type SignInErrorCode = ErrorCode | 'email_invalid';

export function signInErrorCode(error: unknown, step: SignInStep): SignInErrorCode {
  if (!isAuthError(error)) return 'unknown';
  const code = error.code;
  const status = error.status ?? 0;
  // AuthRetryableFetchError: no answer from Supabase (offline, timeout, 5xx gateway).
  if (error.name === 'AuthRetryableFetchError' || status === 0) return 'network';
  if (code === 'email_address_invalid') return 'email_invalid';
  if (code === 'over_request_rate_limit' || status === 429) return 'too_many_attempts';
  if (code === 'weak_password') return 'weak_password';
  if (code === 'user_already_exists' || code === 'email_exists') return 'email_taken';
  if (code === 'validation_failed') return 'invalid_request';
  // A wrong password, or an address without an account: one answer, so the sheet does not reveal who has an account.
  if (step === 'sign-in' && (code === 'invalid_credentials' || (status >= 400 && status < 500))) return 'invalid_credentials';
  return 'unknown';
}
