// Posting (US-06, US-11, US-41): for each photo, resize it, ask POST /uploads for a presigned URL, PUT the
// file there with the given headers, then POST /reports with the photo keys and the first photo's capture.
import { categoryNeedsDescription } from '@kiezruf/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createUpload, type PostReportBody, postReport } from '../api/endpoints';
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

export function reportBody(draft: Draft, photoKeys: string[]): PostReportBody {
  const capture = draft.photos[0]!.capture;
  const description = draft.description.trim();
  return {
    category: draft.category!,
    ...(description ? { description } : {}),
    dangerous: draft.dangerous,
    capture: { lat: capture.lat, lon: capture.lon, accuracyM: capture.accuracyM, capturedAt: capture.capturedAt.toISOString() },
    ...(draft.pin ? { pin: draft.pin } : {}),
    photoKeys,
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

export interface SubmitDeps {
  resize: (photo: DraftPhoto) => Promise<string>;
  createUpload: typeof createUpload;
  putFile: typeof putFile;
  postReport: typeof postReport;
}

const defaultDeps: SubmitDeps = { resize: resizeForUpload, createUpload, putFile, postReport };

export type SubmitProgress = { step: 'upload'; n: number; total: number } | { step: 'post' };

export async function submitDraft(
  draft: Draft,
  onProgress: (p: SubmitProgress) => void = () => undefined,
  deps: SubmitDeps = defaultDeps,
): Promise<PostedReport> {
  const keys: string[] = [];
  for (const [i, photo] of draft.photos.entries()) {
    onProgress({ step: 'upload', n: i + 1, total: draft.photos.length });
    const uri = await deps.resize(photo);
    const ticket = await deps.createUpload('image/jpeg');
    await deps.putFile(ticket, uri);
    keys.push(ticket.key);
  }
  onProgress({ step: 'post' });
  return deps.postReport(reportBody(draft, keys));
}
