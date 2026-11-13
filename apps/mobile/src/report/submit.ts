// Posting (US-06, US-11, US-41): for each photo, resize it, ask POST /uploads for a presigned URL, PUT the
// file there with the given headers, then POST /reports with the photo keys and the first photo's capture.
// Phase 3: the first photo may already be uploaded for the category suggestion (US-14); the draft keeps its key,
// so posting does not upload it twice. Between uploading and posting sits "Already reported?" (US-13).
import { categoryNeedsDescription } from '@kiezruf/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { type CaptureBody, createUpload, type PostReportBody, postReport } from '../api/endpoints';
import { AppError } from '../api/errors';
import type { PostedReport, UploadTicket } from '../api/schemas';
import { UPLOAD_MAX_EDGE_PX } from '../config';
import type { Draft, DraftPhoto } from './DraftProvider';

export type DraftProblem = 'no_photos' | 'no_category' | 'description_required';

/** What still blocks posting, checked before the sign-in sheet opens. */
export function draftProblem(draft: Draft): DraftProblem | null {
  if (draft.photos.length === 0) return 'no_photos';
  if (!draft.category) return 'no_category';
  if (categoryNeedsDescription(draft.category) && draft.description.trim() === '') return 'description_required';
  return null;
}

/** The first photo's capture, as the API expects it (posting and co-reporting). */
export function captureBody(draft: Draft): CaptureBody {
  const capture = draft.photos[0]!.capture;
  return { lat: capture.lat, lon: capture.lon, accuracyM: capture.accuracyM, capturedAt: capture.capturedAt.toISOString() };
}

export function reportBody(draft: Draft, photoKeys: string[]): PostReportBody {
  const description = draft.description.trim();
  const suggestion = draft.suggestion;
  return {
    category: draft.category!,
    ...(description ? { description } : {}),
    dangerous: draft.dangerous,
    capture: captureBody(draft),
    ...(draft.pin ? { pin: draft.pin } : {}),
    photoKeys,
    // Sent whenever a suggestion was shown, also when the citizen kept it (US-14).
    ...(suggestion ? { suggestion: { category: suggestion.category, confidence: suggestion.confidence } } : {}),
  };
}

/** Re-encodes as JPEG with the long edge capped. Re-encoding also drops the file's EXIF block. */
export async function resizeForUpload(photo: DraftPhoto): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > UPLOAD_MAX_EDGE_PX) {
    context.resize(photo.width >= photo.height ? { width: UPLOAD_MAX_EDGE_PX } : { height: UPLOAD_MAX_EDGE_PX });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return saved.uri;
}

export async function putFile(ticket: UploadTicket, fileUri: string): Promise<void> {
  try {
    const file = await (await fetch(fileUri)).blob();
    const response = await fetch(ticket.url, { method: ticket.method, headers: ticket.headers, body: file });
    if (!response.ok) throw new AppError('upload_failed');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('upload_failed');
  }
}

export interface UploadDeps {
  resize: (photo: DraftPhoto) => Promise<string>;
  createUpload: typeof createUpload;
  putFile: typeof putFile;
}
export interface SubmitDeps extends UploadDeps {
  postReport: typeof postReport;
}

const defaultDeps: SubmitDeps = { resize: resizeForUpload, createUpload, putFile, postReport };

/** Resizes one photo, uploads it and returns its key. */
export async function uploadPhoto(photo: DraftPhoto, deps: UploadDeps = defaultDeps): Promise<string> {
  const uri = await deps.resize(photo);
  const ticket = await deps.createUpload('image/jpeg');
  await deps.putFile(ticket, uri);
  return ticket.key;
}

export type SubmitProgress = { step: 'upload'; n: number; total: number } | { step: 'post' };

/** Uploads every photo in order, one at a time, reporting progress. `upload` may return a key it already has. */
export async function uploadPhotos(
  photos: DraftPhoto[],
  upload: (photo: DraftPhoto) => Promise<string>,
  onProgress: (p: SubmitProgress) => void = () => undefined,
): Promise<string[]> {
  const keys: string[] = [];
  for (const [i, photo] of photos.entries()) {
    onProgress({ step: 'upload', n: i + 1, total: photos.length });
    keys.push(await upload(photo));
  }
  return keys;
}

export async function submitDraft(
  draft: Draft,
  onProgress: (p: SubmitProgress) => void = () => undefined,
  deps: SubmitDeps = defaultDeps,
): Promise<PostedReport> {
  const keys = await uploadPhotos(draft.photos, (photo) => uploadPhoto(photo, deps), onProgress);
  onProgress({ step: 'post' });
  return deps.postReport(reportBody(draft, keys));
}
