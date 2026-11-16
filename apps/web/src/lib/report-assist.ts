// Help while reporting (README "API (analysis and AI, Phase 3)"): the category suggested from the first photo
// (US-14) and "Already reported?" (US-13). Neither may hold up posting: a failure or timeout means no help.
// Citizen answers carry no score or level (US-24).
import { CATEGORIES } from '@kiezruf/shared';
import { api } from './api-client';
import type { ReportStatus } from './paths';

/** The API pre-selects from this confidence on (US-14: "start at 0.80"). */
export const SUGGESTION_THRESHOLD = 0.8;
/** The API answers within about 3 s; the browser stops waiting a little later. */
export const SUGGESTION_TIMEOUT_MS = 4_000;
/** "Already reported?" shows at most 3 matches (US-13). */
export const MAX_DUPLICATES = 3;

export interface Suggestion {
  category: string | null;
  confidence: number | null;
  preselect: boolean;
}

const NO_SUGGESTION: Suggestion = { category: null, confidence: null, preselect: false };

const isCategory = (key: unknown): key is string => typeof key === 'string' && CATEGORIES.some((c) => c.key === key);

export function normalizeSuggestion(value: unknown): Suggestion {
  if (!value || typeof value !== 'object') return NO_SUGGESTION;
  const raw = value as Record<string, unknown>;
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : null;
  return { category: isCategory(raw.category) ? raw.category : null, confidence, preselect: raw.preselect === true };
}

/**
 * The category to pre-select, or null. Only when the API says so (`preselect`, from 0.80), the category is one the
 * form knows, the confidence (if sent) is not below the threshold, and the citizen has not picked one yet.
 */
export function categoryToPreselect(s: Suggestion, chosenCategory: string): string | null {
  if (!s.preselect || !s.category || chosenCategory) return null;
  if (s.confidence !== null && s.confidence < SUGGESTION_THRESHOLD) return null;
  return s.category;
}

/** POST /uploads/suggest; a failure or timeout answers "no suggestion". */
export async function requestSuggestion(key: string, timeoutMs = SUGGESTION_TIMEOUT_MS): Promise<Suggestion> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Suggestion>((resolve) => {
    timer = setTimeout(() => resolve(NO_SUGGESTION), timeoutMs);
  });
  const answer = api<unknown>('uploads/suggest', { method: 'POST', body: { key } }).then((r) => (r.ok ? normalizeSuggestion(r.data) : NO_SUGGESTION));
  try {
    return await Promise.race([answer, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface DuplicateMatch {
  publicId: string;
  category: string;
  status: ReportStatus | string;
  distanceM: number | null;
  meTooCount: number;
  /** The public (blurred) photo URL. */
  photo: string | null;
  tenantName: string | null;
}

/** Assumed: `photo` is a URL string or `{ url }`, as the mobile app also accepts. */
export function normalizeDuplicates(value: unknown): DuplicateMatch[] {
  const list = value && typeof value === 'object' && Array.isArray((value as { matches?: unknown }).matches) ? (value as { matches: unknown[] }).matches : [];
  return list
    .map((v) => {
      const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      const photo = typeof o.photo === 'string' ? o.photo : o.photo && typeof o.photo === 'object' && typeof (o.photo as { url?: unknown }).url === 'string' ? (o.photo as { url: string }).url : null;
      return {
        publicId: typeof o.publicId === 'string' ? o.publicId : '',
        category: typeof o.category === 'string' ? o.category : '',
        status: typeof o.status === 'string' ? o.status : '',
        distanceM: typeof o.distanceM === 'number' && Number.isFinite(o.distanceM) ? o.distanceM : null,
        meTooCount: typeof o.meTooCount === 'number' && Number.isFinite(o.meTooCount) ? o.meTooCount : 0,
        photo,
        tenantName: typeof o.tenantName === 'string' ? o.tenantName : null,
      };
    })
    .filter((m) => m.publicId)
    .slice(0, MAX_DUPLICATES);
}

export interface DuplicateQuery {
  lat: number;
  lon: number;
  category: string;
  photoKey?: string | null;
}

/** The inputs as one string, so the form checks again only when location, category or photo changed. */
export function duplicateSignature(q: DuplicateQuery): string {
  return `${q.lat.toFixed(5)},${q.lon.toFixed(5)},${q.category},${q.photoKey ?? ''}`;
}

/** POST /reports/duplicates. Errors other than a lost session count as "no matches", so posting goes on. */
export async function findDuplicates(q: DuplicateQuery) {
  const result = await api<unknown>('reports/duplicates', {
    method: 'POST',
    body: { lat: q.lat, lon: q.lon, category: q.category, ...(q.photoKey ? { photoKey: q.photoKey } : {}) },
  });
  if (result.ok) return { ok: true as const, status: result.status, data: normalizeDuplicates(result.data) };
  if (result.status === 401) return result;
  return { ok: true as const, status: result.status, data: [] as DuplicateMatch[] };
}
