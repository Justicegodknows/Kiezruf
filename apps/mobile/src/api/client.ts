// HTTP client for the Kiezruf API. Errors arrive as { "error": "<code>" } and are thrown as ApiError;
// screens translate the code with errorMessage() (src/api/errors.ts). Nothing here logs request or response bodies.
import type { z } from 'zod';
import { API_BASE_URL } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

let tokenProvider: (() => Promise<string | null>) | null = null;
let onUnauthorized: (() => void) | null = null;

/**
 * Set once by the auth layer: returns the current Supabase access token, or null when signed out.
 * Asked before every request, so a refreshed token goes out at once (ENG-22).
 */
export function setAccessTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}

/** Called when the API answers 401 to a request that carried a token (expired or revoked session). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function currentToken(): Promise<string | null> {
  try {
    return (await tokenProvider?.()) ?? null;
  } catch {
    return null;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions<S extends z.ZodType | undefined> {
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  schema?: S;
}

export function buildUrl(path: string, query?: RequestOptions<undefined>['query']): string {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return `${API_BASE_URL}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

export async function api<S extends z.ZodType | undefined = undefined>(
  method: Method,
  path: string,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = await currentToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  if (!response.ok) {
    let code = response.status === 429 ? 'rate_limited' : 'unknown';
    let details: Record<string, unknown> = {};
    try {
      const body = (await response.json()) as { error?: unknown };
      if (body && typeof body.error === 'string') {
        const { error, ...rest } = body as { error: string };
        // Kiezruf codes are snake_case. Fastify's own errors (e.g. the rate limiter's "Too Many Requests") are not.
        if (/^[a-z_]+$/.test(error)) code = error;
        details = rest;
      }
    } catch {
      // Body was not JSON; keep the generic code.
    }
    if (response.status === 401 && token) onUnauthorized?.();
    throw new ApiError(response.status, code, details);
  }

  if (!options.schema || response.status === 204) return undefined as never;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, 'bad_response');
  }
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) throw new ApiError(response.status, 'bad_response');
  return parsed.data as never;
}
