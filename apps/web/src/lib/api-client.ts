// Browser-side calls. They only ever go to this site's own /api routes (the backend-for-frontend), which hold
// the session cookie and talk to the Kiezruf API. The browser never sees the API token.
import { codeForStatus, isKnownErrorCode, type ErrorCode } from './errors';
import type { ReportStatus } from './paths';

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ErrorCode | string; body: Record<string, unknown> };

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/${path.replace(/^\//, '')}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, error: 'network', body: {} };
  }
  const text = await response.text().catch(() => '');
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const error = typeof record.error === 'string' ? record.error : codeForStatus(response.status);
  return { ok: false, status: response.status, error, body: record };
}

/** Throws on failure; for react-query, which wants a rejected promise. */
export async function apiOrThrow<T>(path: string): Promise<T> {
  const result = await api<T>(path);
  if (!result.ok) throw new ApiError(result.error, result.status);
  return result.data;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(isKnownErrorCode(code) ? code : 'unknown');
  }
}

// --- Response shapes (README "API (citizen core)" and apps/api/src) ---------------------------------------

export interface PublicReport {
  publicId: string;
  category: string;
  status: ReportStatus;
  description: string | null;
  dangerous: boolean;
  lat: number;
  lon: number;
  createdAt: string;
  updatedAt: string;
  meTooCount: number;
  tenantName: string;
  office: string | null;
  distanceM?: number;
}

export interface ReportDetail extends PublicReport {
  photos: { url: string }[];
}

/** GET /me/reports rows; GET /me/follows rows have `updatedAt` instead of `createdAt` and no description or office. */
export interface OwnReport {
  publicId: string;
  category: string;
  status: ReportStatus;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  tenantName: string;
  office?: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
}

export interface Relation {
  following: boolean;
  meToo: boolean;
  mine: boolean;
}

export interface RouteAnswer {
  live: boolean;
  tenant: { name: string; office: string | null; status: string } | null;
}

export interface NotificationSettings {
  statusChange: { push: boolean; email: boolean };
  goLive: { push: boolean; email: boolean };
}

export interface SessionInfo {
  signedIn: boolean;
  email?: string;
  locale?: string;
}
