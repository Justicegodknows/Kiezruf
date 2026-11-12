// Posting from the web (US-03, US-06, US-11, US-13, US-14): one presigned upload per photo, the browser PUTs the
// file there, then the report is posted with the photo keys. A photo uploaded earlier (the first one, for the
// category suggestion and the duplicate check) is not uploaded again. "Add my photo to this report" (US-13) sends
// the same capture and photo keys to the matched report instead.
import { api, type ApiResult } from './api-client';
import type { Fix, Point } from './geo';
import { uploadTypeOf } from './photo-check';

/** The category suggestion the citizen saw (US-14), sent with the report as feedback. */
export interface ShownSuggestion {
  category: string;
  confidence: number | null;
}

export interface NewReport {
  category: string;
  description: string;
  dangerous: boolean;
  fix: Fix;
  capturedAt: Date;
  /** Only when the citizen moved the pin (US-10). */
  pin: Point | null;
  files: File[];
  /** Keys of photos already uploaded, aligned with `files`; missing entries are uploaded now. */
  uploadedKeys?: (string | null | undefined)[];
  /** Only when a suggestion was shown. */
  suggestion?: ShownSuggestion | null;
}

export interface Posted {
  publicId: string;
  status: string;
  tenant?: unknown;
}

interface Upload {
  key: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export type Put = (url: string, init: RequestInit) => Promise<Response>;

const defaultPut: Put = (url, init) => fetch(url, init);

/** Uploads one original photo (POST /uploads, then PUT to the presigned URL) and returns its key. */
export async function uploadPhoto(file: File, put: Put = defaultPut): Promise<ApiResult<string>> {
  const contentType = uploadTypeOf(file);
  if (!contentType) return { ok: false, status: 0, error: 'unsupported_type', body: {} };
  const upload = await api<Upload>('uploads', { method: 'POST', body: { contentType } });
  if (!upload.ok) return upload;
  let response: Response;
  try {
    response = await put(upload.data.url, {
      method: upload.data.method ?? 'PUT',
      headers: upload.data.headers ?? { 'Content-Type': contentType },
      body: file,
    });
  } catch {
    return { ok: false, status: 0, error: 'upload_failed', body: {} };
  }
  if (!response.ok) return { ok: false, status: response.status, error: 'upload_failed', body: {} };
  return { ok: true, status: response.status, data: upload.data.key };
}

/** Every photo's key, uploading those without one. */
export async function uploadAll(files: File[], uploadedKeys: (string | null | undefined)[] = [], put: Put = defaultPut): Promise<ApiResult<string[]>> {
  const keys: string[] = [];
  for (const [i, file] of files.entries()) {
    const known = uploadedKeys[i];
    if (known) {
      keys.push(known);
      continue;
    }
    const uploaded = await uploadPhoto(file, put);
    if (!uploaded.ok) return uploaded;
    keys.push(uploaded.data);
  }
  return { ok: true, status: 200, data: keys };
}

/** The on-site evidence the API checks (US-03, US-06). */
export function captureBody(fix: Fix, capturedAt: Date) {
  return { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM, capturedAt: capturedAt.toISOString() };
}

export async function postReport(input: NewReport, put: Put = defaultPut): Promise<ApiResult<Posted>> {
  const keys = await uploadAll(input.files, input.uploadedKeys, put);
  if (!keys.ok) return keys;
  const description = input.description.trim();
  return api<Posted>('reports', {
    method: 'POST',
    body: {
      category: input.category,
      ...(description ? { description } : {}),
      dangerous: input.dangerous,
      capture: captureBody(input.fix, input.capturedAt),
      ...(input.pin ? { pin: input.pin } : {}),
      photoKeys: keys.data,
      ...(input.suggestion ? { suggestion: { category: input.suggestion.category, confidence: input.suggestion.confidence } } : {}),
    },
  });
}

export interface CoReport {
  fix: Fix;
  capturedAt: Date;
  files: File[];
  uploadedKeys?: (string | null | undefined)[];
}

/** "Add my photo to this report" (US-13): the citizen becomes a co-reporter of `publicId` and follows it. */
export async function coReport(publicId: string, input: CoReport, put: Put = defaultPut): Promise<ApiResult<{ publicId: string }>> {
  const keys = await uploadAll(input.files, input.uploadedKeys, put);
  if (!keys.ok) return keys;
  const result = await api<{ publicId: string }>(`reports/${encodeURIComponent(publicId)}/co-report`, {
    method: 'POST',
    body: { capture: captureBody(input.fix, input.capturedAt), photoKeys: keys.data },
  });
  // The API says not_on_site for both Me too and co-reporting; here it means "too far from this report".
  if (!result.ok && result.error === 'not_on_site') return { ...result, error: 'too_far' };
  return result;
}
