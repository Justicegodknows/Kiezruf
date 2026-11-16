// Response shapes of the analysis and AI endpoints (README "API (analysis and AI, Phase 3)"): weekly briefings
// (US-53, US-54), hotspots (US-50, US-52), trends (US-51) and merge suggestions (US-17). Like ./types, each payload
// passes through a normaliser that tolerates missing or oddly typed fields. Assumptions are marked "Assumed".
import { CATEGORIES, LEVELS, type Level } from '@kiezruf/shared';
import { toLevel, type TenantRef } from './types';

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const list = (v: unknown, key?: string): unknown[] => (Array.isArray(v) ? v : key && Array.isArray(obj(v)[key]) ? (obj(v)[key] as unknown[]) : []);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === 'string' && x !== '');

// --- Weekly briefing (US-53, US-54) ------------------------------------------------------------------------

/** At most 5 items per briefing (US-53). */
export const MAX_BRIEFING_ITEMS = 5;
export const BRIEFING_KINDS = ['Urgent', 'Watch', 'Improving'] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];

export interface BriefingRating {
  useful: boolean;
  note: string | null;
}

export interface BriefingItem {
  id: string;
  level: Level;
  kind: BriefingKind;
  headline: string;
  text: string;
  /** Report IDs the item rests on (US-53: every claim cites reports). */
  citations: string[];
  /** The signed-in staff member's own rating, if they gave one. */
  myRating: BriefingRating | null;
}

export interface Briefing {
  id: string;
  tenant: TenantRef;
  /** Monday of the briefing's week (YYYY-MM-DD, Europe/Berlin). */
  weekStart: string | null;
  generatedAt: string | null;
  aiWritten: boolean;
  /** No AI item survived validation: the top reports by score instead (not AI-written). */
  fallback: boolean;
  items: BriefingItem[];
}

function toKind(value: unknown): BriefingKind {
  if (typeof value !== 'string') return 'Watch';
  const lower = value.toLowerCase();
  return BRIEFING_KINDS.find((k) => k.toLowerCase() === lower) ?? 'Watch';
}

/** Assumed: `myRating` is `{ useful, note }`, a bare boolean, or null. */
function toRating(value: unknown): BriefingRating | null {
  if (typeof value === 'boolean') return { useful: value, note: null };
  const raw = obj(value);
  return typeof raw.useful === 'boolean' ? { useful: raw.useful, note: str(raw.note) } : null;
}

function toTenantRef(value: unknown, raw: Raw): TenantRef {
  if (typeof value === 'string') return { id: str(raw.tenantId) ?? '', name: value, path: null };
  const o = obj(value);
  return { id: str(o.id) ?? str(raw.tenantId) ?? '', name: str(o.name) ?? str(raw.tenantName) ?? '', path: str(o.path) };
}

export function normalizeBriefingItem(value: unknown): BriefingItem | null {
  const raw = obj(value);
  const id = str(raw.id);
  const level = toLevel(raw.level);
  if (!id || !level) return null;
  return {
    id,
    level,
    kind: toKind(raw.kind),
    headline: typeof raw.headline === 'string' ? raw.headline : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    citations: strings(raw.citations),
    myRating: toRating(raw.myRating),
  };
}

export function normalizeBriefing(value: unknown): Briefing | null {
  const raw = obj(value);
  const id = str(raw.id);
  if (!id) return null;
  const fallback = raw.fallback === true;
  return {
    id,
    tenant: toTenantRef(raw.tenant, raw),
    weekStart: str(raw.weekStart),
    generatedAt: str(raw.generatedAt),
    // A fallback is never AI-written; otherwise assume it is unless the API says no.
    aiWritten: fallback ? false : raw.aiWritten !== false,
    fallback,
    items: list(raw.items)
      .map(normalizeBriefingItem)
      .filter((i): i is BriefingItem => i !== null)
      .slice(0, MAX_BRIEFING_ITEMS),
  };
}

/** Newest week first. */
export function normalizeBriefings(value: unknown): Briefing[] {
  return list(value, 'briefings')
    .map(normalizeBriefing)
    .filter((b): b is Briefing => b !== null)
    .sort((a, b) => (b.weekStart ?? '').localeCompare(a.weekStart ?? ''));
}

/** The fallback briefing carries a category key as its text; show it as a category name. */
export function isCategoryKey(text: string): boolean {
  return CATEGORIES.some((c) => c.key === text);
}

// --- Hotspots (US-50, US-52) ------------------------------------------------------------------------------

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface HotspotCluster {
  id: string;
  /** Category group: traffic or community (CATEGORIES `group`). */
  group: string;
  lat: number;
  lon: number;
  count: number;
  /** The highest level inside the cluster. */
  level: Level;
  publicIds: string[];
  recurring: boolean;
  weekdayPattern: Weekday | null;
}

export interface Hotspots {
  clusters: HotspotCluster[];
  computedAt: string | null;
}

function toWeekday(value: unknown): Weekday | null {
  if (typeof value !== 'string') return null;
  const lower = value.slice(0, 3).toLowerCase();
  return WEEKDAYS.find((d) => d === lower) ?? null;
}

const LEVEL_RANK: Record<Level, number> = Object.fromEntries(LEVELS.map((l, i) => [l, i])) as Record<Level, number>;

export function normalizeHotspots(value: unknown): Hotspots {
  const clusters = list(value, 'clusters')
    .map((v, index) => {
      const o = obj(v);
      const lat = num(o.lat);
      const lon = num(o.lon);
      const publicIds = strings(o.publicIds);
      if (lat === null || lon === null) return null;
      return {
        id: str(o.id) ?? String(num(o.id) ?? index),
        group: str(o.group) ?? '',
        lat,
        lon,
        count: num(o.count) ?? publicIds.length,
        level: toLevel(o.level) ?? 'Low',
        publicIds,
        recurring: o.recurring === true,
        weekdayPattern: toWeekday(o.weekdayPattern),
      };
    })
    .filter((c): c is HotspotCluster => c !== null)
    // Highest level first, then the biggest cluster.
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.count - a.count);
  return { clusters, computedAt: str(obj(value).computedAt) };
}

/** Marker diameter in pixels: grows with the report count, capped so a big cluster does not hide the map. */
export function clusterSize(count: number): number {
  return Math.round(Math.min(64, 26 + Math.sqrt(Math.max(1, count)) * 8));
}

// --- Trends (US-51) ---------------------------------------------------------------------------------------

export interface CategoryTrend {
  category: string;
  /** Weekly counts, oldest first, aligned with `weeks`. */
  counts: number[];
  fourWeekAverage: number | null;
  /** As the API sends it; the display recomputes from counts and average when it can (see trendChange). */
  change: number | null;
}

export interface Trends {
  weeks: string[];
  categories: CategoryTrend[];
  medianHoursToAcknowledge: number | null;
  medianHoursToResolve: number | null;
}

export function normalizeTrends(value: unknown): Trends {
  const raw = obj(value);
  const weeks = list(raw.weeks).map((w) => (typeof w === 'string' ? w : String(num(w) ?? '')));
  return {
    weeks,
    categories: list(raw.categories)
      .map((v) => {
        const o = obj(v);
        const category = str(o.category);
        if (!category) return null;
        return { category, counts: list(o.counts).map((c) => num(c) ?? 0), fourWeekAverage: num(o.fourWeekAverage), change: num(o.change) };
      })
      .filter((c): c is CategoryTrend => c !== null),
    medianHoursToAcknowledge: num(raw.medianHoursToAcknowledge),
    medianHoursToResolve: num(raw.medianHoursToResolve),
  };
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'none';

export interface TrendChange {
  direction: TrendDirection;
  /** Whole percent against the 4-week average; null for `new` and `none`. */
  percent: number | null;
  /** The latest week's count, and the average it is compared with. */
  latest: number | null;
  average: number | null;
}

/**
 * The latest week against the average of the 4 weeks before it (US-51, as in the prototype). The average comes
 * from the API; without it, from the counts. Assumed: when neither is usable, the API's `change` is a ratio
 * (0.25 = +25 %).
 */
export function trendChange(trend: Pick<CategoryTrend, 'counts' | 'fourWeekAverage' | 'change'>): TrendChange {
  const latest = trend.counts.length ? trend.counts[trend.counts.length - 1]! : null;
  const before = trend.counts.slice(-5, -1);
  const average = trend.fourWeekAverage ?? (before.length === 4 ? before.reduce((s, n) => s + n, 0) / 4 : null);
  if (latest !== null && average !== null) {
    if (average === 0) return { direction: latest > 0 ? 'new' : 'flat', percent: latest > 0 ? null : 0, latest, average };
    const percent = Math.round(((latest - average) / average) * 100);
    return { direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat', percent, latest, average };
  }
  if (trend.change !== null) {
    const percent = Math.round(trend.change * 100);
    return { direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat', percent, latest, average };
  }
  return { direction: 'none', percent: null, latest, average };
}

/** ISO week number of a YYYY-MM-DD date (KW in German). */
export function isoWeek(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The week number from "2026-11-09" or "2026-W45"; null when the label is neither. */
export function weekNumber(label: string): number | null {
  const w = /^\d{4}-W(\d{1,2})$/i.exec(label);
  if (w) return Number(w[1]);
  return isoWeek(label);
}

// --- Merge suggestions (US-17) ----------------------------------------------------------------------------

export interface MergeSuggestion {
  publicId: string;
  status: string;
  level: Level | null;
  distanceM: number | null;
  similarity: number | null;
  createdAt: string | null;
}

export function normalizeMergeSuggestions(value: unknown, ownId: string): MergeSuggestion[] {
  return list(value, 'matches')
    .map((v) => {
      const o = obj(v);
      return {
        publicId: str(o.publicId) ?? '',
        status: str(o.status) ?? '',
        level: toLevel(o.level),
        distanceM: num(o.distanceM),
        similarity: num(o.similarity),
        createdAt: str(o.createdAt),
      };
    })
    .filter((m) => m.publicId && m.publicId !== ownId);
}

// --- Export (US-55) ---------------------------------------------------------------------------------------

/** BFF download URL for the queue CSV of a tenant and date range (YYYY-MM-DD, both optional). */
export function queueCsvUrl(tenantId: string, from: string, to: string): string {
  const qs = new URLSearchParams();
  if (tenantId) qs.set('tenantId', tenantId);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const s = qs.toString();
  return `/api/staff/export/queue.csv${s ? `?${s}` : ''}`;
}

export function trendsCsvUrl(tenantId: string): string {
  return `/api/staff/export/trends.csv${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`;
}
