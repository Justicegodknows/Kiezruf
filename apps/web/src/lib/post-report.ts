// Posting from the web (US-03, US-06, US-11): one presigned upload per photo, the browser PUTs the file there,
// then the report is posted with the photo keys.
import { api, type ApiResult } from './api-client';
import type { Fix, Point } from './geo';
import { uploadTypeOf } from './photo-check';

export interface NewReport {
  category: string;
  description: string;
  dangerous: boolean;
  fix: Fix;
  capturedAt: Date;
  /** Only when the citizen moved the pin (US-10). */
  pin: Point | null;
  files: File[];
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

type Put = (url: string, init: RequestInit) => Promise<Response>;

export async function postReport(input: NewReport, put: Put = (url, init) => fetch(url, init)): Promise<ApiResult<Posted>> {
  const keys: string[] = [];
  for (const file of input.files) {
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
    keys.push(upload.data.key);
  }
  const description = input.description.trim();
  return api<Posted>('reports', {
    method: 'POST',
    body: {
      category: input.category,
      ...(description ? { description } : {}),
      dangerous: input.dangerous,
      capture: {
        lat: input.fix.lat,
        lon: input.fix.lon,
        accuracyM: input.fix.accuracyM,
        capturedAt: input.capturedAt.toISOString(),
      },
      ...(input.pin ? { pin: input.pin } : {}),
      photoKeys: keys,
    },
  });
}
