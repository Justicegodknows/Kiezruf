// Decides whether a photo chosen on the web may be posted, or only kept as a draft (US-04, US-06).
// The time rules come from @kiezruf/shared, so the web, the app and the API agree.
import { checkCapture, MAX_PHOTOS } from '@kiezruf/shared';

/** Upload types the API accepts (`UPLOAD_TYPES` in apps/api/src/reports/service.ts). */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

export const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif';

/** The upload type for a file, from its MIME type or, when the browser gives none (often HEIC), its extension. */
export function uploadTypeOf(file: { name: string; type: string }): UploadContentType | null {
  const type = file.type.toLowerCase();
  if (type === 'image/jpeg' || type === 'image/jpg') return 'image/jpeg';
  if (type === 'image/png') return 'image/png';
  if (type === 'image/heic' || type === 'image/heif') return 'image/heic';
  if (type) return null;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  return null;
}

/** What the photo file says about itself. `null` means the metadata is missing. */
export interface PhotoMeta {
  capturedAt: Date | null;
  lat: number | null;
  lon: number | null;
}

export type PhotoVerdict =
  | { postable: true }
  | { postable: false; reason: 'no_metadata' | 'capture_too_old' | 'capture_in_future' | 'unsupported_type' };

/**
 * A photo may be posted only if its file carries a capture location and a capture time, and that time is
 * within MAX_PHOTO_AGE_HOURS (US-06). Everything else is kept as a draft only (US-04).
 */
export function assessPhoto(file: { name: string; type: string }, meta: PhotoMeta, now: Date): PhotoVerdict {
  if (!uploadTypeOf(file)) return { postable: false, reason: 'unsupported_type' };
  const hasLocation = meta.lat !== null && meta.lon !== null && Number.isFinite(meta.lat) && Number.isFinite(meta.lon);
  // The photo's own GPS has no accuracy figure; the device accuracy is checked separately on the browser fix.
  const result = checkCapture({ accuracyM: hasLocation ? 0 : null, capturedAt: meta.capturedAt }, now);
  if (result.ok) return { postable: true };
  if (result.reason === 'accuracy_too_low') return { postable: false, reason: 'no_metadata' };
  return { postable: false, reason: result.reason };
}

export interface ChosenPhoto {
  file: File;
  meta: PhotoMeta;
  verdict: PhotoVerdict;
}

export type ComposeDecision =
  | { kind: 'post'; capturedAt: Date }
  | { kind: 'draft'; reasons: Exclude<PhotoVerdict, { postable: true }>['reason'][] }
  | { kind: 'empty' }
  | { kind: 'too_many' };

/**
 * Whether the chosen photos can be posted or only saved as a draft. The capture time sent to the API is the
 * oldest photo's, so the strictest age applies.
 */
export function composeDecision(photos: readonly Pick<ChosenPhoto, 'meta' | 'verdict'>[]): ComposeDecision {
  if (photos.length === 0) return { kind: 'empty' };
  if (photos.length > MAX_PHOTOS) return { kind: 'too_many' };
  const reasons = photos.flatMap((p) => (p.verdict.postable ? [] : [p.verdict.reason]));
  if (reasons.length > 0) return { kind: 'draft', reasons: [...new Set(reasons)] };
  const times = photos.map((p) => p.meta.capturedAt!.getTime());
  return { kind: 'post', capturedAt: new Date(Math.min(...times)) };
}
