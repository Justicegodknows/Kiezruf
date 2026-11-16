// API error codes (README, "API (citizen core)" and "API (admin console, Phase 2)") and the client's own codes, mapped to translated messages.
import type { MessageKey } from '@/i18n';

/** Codes the API answers with as `{ "error": "<code>" }`. */
export const API_ERROR_CODES = [
  'unauthorized',
  'invalid_request',
  'invalid_credentials',
  'weak_password',
  'email_taken',
  'too_many_attempts',
  'not_found',
  'not_live',
  'no_metadata',
  'accuracy_too_low',
  'capture_too_old',
  'capture_in_future',
  'description_required',
  'pin_too_far',
  'photo_missing',
  'duplicate_photo',
  'not_on_site',
  'already_live',
  'no_tenant',
  // Console (README "API (admin console, Phase 2)").
  'not_staff',
  'invalid_totp',
  'challenge_expired',
  // Staff routes without a fresh TOTP check (README "Hosting and sign-in (ENG-22)").
  'mfa_required',
  'read_only',
  'invalid_transition',
  'reason_required',
  'not_same_tenant',
  'invalid_target',
  'link_expired',
  'forbidden_role',
  // Analysis and AI (Phase 3). The README names no new codes; these are assumed for co-reporting and export.
  'too_far',
  'already_reported',
  'report_closed',
  'invalid_range',
] as const;

/** Codes the web client produces itself (network, browser location, uploads, the BFF). */
export const CLIENT_ERROR_CODES = [
  'network',
  'unavailable',
  'forbidden',
  'too_large',
  'rate_limited',
  'location_denied',
  'location_unavailable',
  'location_unsupported',
  'upload_failed',
  'unsupported_type',
  'unknown',
] as const;

export type ErrorCode = (typeof API_ERROR_CODES)[number] | (typeof CLIENT_ERROR_CODES)[number];

const KNOWN = new Set<string>([...API_ERROR_CODES, ...CLIENT_ERROR_CODES]);

export function isKnownErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && KNOWN.has(code);
}

/** The translation key for an error code. Unknown codes get the generic message, never the raw code. */
export function errorMessageKey(code: unknown): MessageKey {
  return `error.${isKnownErrorCode(code) ? code : 'unknown'}` as MessageKey;
}

/** The error code for an HTTP answer without a usable `{ error }` body. */
export function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 410) return 'link_expired';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'unknown';
}
