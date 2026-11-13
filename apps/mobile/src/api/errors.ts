import type { TFunction } from 'i18next';
import { ApiError } from './client';

/** Error codes the API sends (README "API (citizen core)"). Each has a translation under errors.<code>. */
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
] as const;

/** Codes the app itself produces (network, device permissions, unexpected answers). */
export const CLIENT_ERROR_CODES = [
  'network',
  'rate_limited',
  'bad_response',
  'upload_failed',
  'location_denied',
  'location_unavailable',
  'unknown',
] as const;

export type ErrorCode = (typeof API_ERROR_CODES)[number] | (typeof CLIENT_ERROR_CODES)[number];

const KNOWN = new Set<string>([...API_ERROR_CODES, ...CLIENT_ERROR_CODES]);

/** The error code of anything thrown, reduced to a code we have a translation for. */
export function errorCode(error: unknown): ErrorCode {
  const code = error instanceof ApiError ? error.code : error instanceof AppError ? error.code : 'unknown';
  return (KNOWN.has(code) ? code : 'unknown') as ErrorCode;
}

export function errorMessage(t: TFunction, error: unknown): string {
  return t(`errors.${errorCode(error)}`);
}

/** A failure on the device that is not an API answer, e.g. location permission denied. */
export class AppError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'AppError';
  }
}
