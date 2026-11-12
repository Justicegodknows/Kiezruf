// Response shapes of the console API (README "API (admin console, Phase 2)"). The README names the fields but not
// every nesting, so each payload passes through a normaliser that accepts the plausible shapes (a tenant as an
// object or a name, an override as a level or an object, levels in any case). Assumptions are marked "Assumed".
import { DEFAULT_THRESHOLDS, LEVELS, priorityLevel, type Level } from '@kiezruf/shared';

export { LEVELS };
export const STAFF_ROLES = ['platform_admin', 'tenant_admin', 'case_worker', 'viewer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const TENANT_STATUSES = ['grouping', 'not_live', 'pilot', 'live'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];
/** Statuses staff can set with PATCH /staff/reports/:id/status (US-28). Forwarded comes from forwarding. */
export const SETTABLE_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'rejected'] as const;
export type SettableStatus = (typeof SETTABLE_STATUSES)[number];

export interface Grant {
  tenantId: string;
  tenantName: string;
  /** ltree path, e.g. de.be.bec.nk. A grant covers its node and everything below it (US-42). */
  path: string;
  role: StaffRole;
}

export interface StaffPreferences {
  /** The Monday briefing email (US-56). Null when the API sends no preference. */
  briefingEmail: boolean | null;
}

export interface StaffMe {
  id: string;
  email: string;
  grants: Grant[];
  /** From GET /staff/me (Phase 3); normalizeMe always fills it. */
  preferences?: StaffPreferences;
}

export interface StaffSession {
  signedIn: boolean;
  me?: StaffMe;
  /** Why there is no staff session although Supabase has one: the TOTP step is missing, or no staff role. */
  reason?: 'mfa_required' | 'not_staff';
}

/** Thresholds as the API sends them (lower case). */
export interface Thresholds {
  critical: number;
  high: number;
  medium: number;
}

export interface TenantRef {
  id: string;
  name: string;
  path: string | null;
}

export interface StaffTenant {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  path: string;
  status: TenantStatus;
  office: string | null;
  thresholds: Thresholds | null;
  /** From the API: may the caller change settings, contacts and staff here (tenant or platform admin)? */
  canAdmin: boolean | null;
  /** From the API: may the caller change this node's status (platform admin)? */
  canActivate: boolean | null;
}

export interface Override {
  level: Level;
  reason: string | null;
}

export interface Counts {
  coReporters: number;
  /** Unique commenters where the API sends them, else the number of visible comments. */
  comments: number;
  meToo: number;
}

export interface QueueRow {
  publicId: string;
  category: string;
  status: string;
  description: string | null;
  createdAt: string | null;
  score: number;
  level: Level;
  levelChangedAt: string | null;
  override: Override | null;
  /** Flagged or confirmed vote spike (US-26). */
  spike: boolean;
  /** none, flagged (waits for a moderator), confirmed (new accounts at half weight) or cleared. */
  spikeState: string;
  counts: Counts;
  tenant: TenantRef;
  editable: boolean;
}

export interface Breakdown {
  coReporters: number;
  commenters: number;
  meToo: number;
  /** Me too votes of new accounts that count at half weight after a confirmed spike (US-26), if any. */
  discountedVotes: number | null;
  base: number;
  ageHours: number;
  decay: number;
  dangerMarks: number;
  dangerMultiplier: number;
  safetyCategory: boolean;
  safetyMultiplier: number;
  score: number;
}

export interface StaffPhoto {
  blurredUrl: string | null;
  originalUrl: string | null;
}

export interface StaffComment {
  id: string;
  body: string;
  state: 'visible' | 'held' | 'removed';
  flagCount: number;
  createdAt: string | null;
  /** Assumed: the author's account ID, for banning (US-33). */
  authorId: string | null;
  /** Moderation queue only: the report the comment belongs to, and its tenant. */
  reportId: string | null;
  tenantName: string | null;
  /** From the API: may the caller moderate it (owning tenant)? Null when not sent. */
  editable: boolean | null;
}

export interface HistoryEntry {
  at: string | null;
  kind: string;
  from: string | null;
  to: string | null;
  note: string | null;
  reason: string | null;
  by: string | null;
}

export interface ForwardTarget {
  id: string;
  name: string;
  /** Tenant type, used to tell parents from siblings when the API sends one flat list. */
  type?: string | null;
}

export interface ForwardTargets {
  parents: ForwardTarget[];
  siblings: ForwardTarget[];
  contacts: (ForwardTarget & { email: string | null })[];
}

export interface StaffReportDetail extends QueueRow {
  dangerous: boolean;
  lat: number | null;
  lon: number | null;
  capture: { lat: number | null; lon: number | null; accuracyM: number | null; at: string | null } | null;
  photos: StaffPhoto[];
  breakdown: Breakdown | null;
  thresholds: Thresholds;
  publicNote: string | null;
  comments: StaffComment[];
  history: HistoryEntry[];
  /** Where this report may be forwarded: parent and sibling tenants, saved contacts (US-45). */
  forwardTargets: ForwardTargets | null;
  meTooCount: number | null;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
}

export interface StaffMember {
  accountId: string;
  email: string;
  role: StaffRole;
}

export interface SpikeFlag {
  publicId: string;
  category: string | null;
  tenant: TenantRef;
  votes: number | null;
  newAccountVotes: number | null;
  flaggedAt: string | null;
  editable: boolean;
}

/** Why a report is held before publishing (Phase 3 photo pipeline). */
export const HELD_REASONS = ['blur_failed', 'too_large'] as const;
export type HeldReason = (typeof HELD_REASONS)[number];

export interface HeldReport {
  publicId: string;
  category: string | null;
  tenant: TenantRef;
  createdAt: string | null;
  /** Null when the API sends no reason, or one this console does not know yet. */
  reason: HeldReason | null;
}

export interface ModerationQueue {
  comments: StaffComment[];
  spikes: SpikeFlag[];
  heldReports: HeldReport[];
}

// --- Normalisers --------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const list = (v: unknown, key?: string): unknown[] => (Array.isArray(v) ? v : key && Array.isArray(obj(v)[key]) ? (obj(v)[key] as unknown[]) : []);
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/** Tenant types from the top of the tree down (US-40), to tell a parent from a sibling. */
const TYPE_RANK: Record<string, number> = { country: 0, land: 1, regierungsbezirk: 2, kreis: 3, kreisfreie_stadt: 3, gemeinde: 4, bezirk: 5 };

/**
 * Splits the API's flat list of forward tenants (parent first, then siblings) into parents and siblings. With the
 * report tenant's own type a parent is anything ranked above it; without it, the deepest type counts as siblings.
 */
export function splitForwardTenants(tenants: ForwardTarget[], ownType?: string | null): { parents: ForwardTarget[]; siblings: ForwardTarget[] } {
  const rank = (t: ForwardTarget) => TYPE_RANK[t.type ?? ''] ?? 99;
  const own = ownType ? TYPE_RANK[ownType] : undefined;
  const deepest = Math.max(...tenants.map(rank));
  const isParent = (t: ForwardTarget) => (own !== undefined ? rank(t) < own : tenants.length > 1 ? rank(t) < deepest : rank(t) < TYPE_RANK.gemeinde!);
  return { parents: tenants.filter(isParent), siblings: tenants.filter((t) => !isParent(t)) };
}

export function toLevel(value: unknown): Level | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return LEVELS.find((l) => l.toLowerCase() === lower) ?? null;
}

export function toRole(value: unknown): StaffRole | null {
  return (STAFF_ROLES as readonly unknown[]).includes(value) ? (value as StaffRole) : null;
}

export function toTenantStatus(value: unknown): TenantStatus {
  return (TENANT_STATUSES as readonly unknown[]).includes(value) ? (value as TenantStatus) : 'grouping';
}

/** Shared thresholds use capitalised level names; the API uses lower case. */
export function sharedThresholds(t: Thresholds | null | undefined): typeof DEFAULT_THRESHOLDS {
  return t ? { Critical: t.critical, High: t.high, Medium: t.medium } : DEFAULT_THRESHOLDS;
}

export function toThresholds(value: unknown): Thresholds | null {
  const raw = obj(value);
  const critical = num(raw.critical ?? raw.Critical);
  const high = num(raw.high ?? raw.High);
  const medium = num(raw.medium ?? raw.Medium);
  return critical !== null && high !== null && medium !== null ? { critical, high, medium } : null;
}

function toTenantRef(raw: Raw): TenantRef {
  const t = raw.tenant;
  if (typeof t === 'string') return { id: str(raw.tenantId) ?? '', name: t, path: str(raw.tenantPath) };
  const o = obj(t);
  return {
    id: str(o.id) ?? str(raw.tenantId) ?? '',
    name: str(o.name) ?? str(raw.tenantName) ?? '',
    path: str(o.path) ?? str(raw.tenantPath),
  };
}

function toOverride(value: unknown, raw: Raw): Override | null {
  if (value === null || value === undefined || value === false) return null;
  const level = toLevel(value) ?? toLevel(obj(value).level);
  if (!level) return null;
  return { level, reason: str(obj(value).reason) ?? str(raw.overrideReason) };
}

export function normalizeGrant(value: unknown): Grant | null {
  const raw = obj(value);
  const role = toRole(raw.role);
  const tenantId = str(raw.tenantId);
  const path = str(raw.path);
  if (!role || !tenantId || !path) return null;
  return { tenantId, tenantName: str(raw.tenantName) ?? '', path, role };
}

export function normalizeMe(value: unknown): StaffMe {
  const raw = obj(value);
  return {
    id: str(raw.id) ?? '',
    email: str(raw.email) ?? '',
    grants: list(raw.grants).map(normalizeGrant).filter((g): g is Grant => g !== null),
    preferences: { briefingEmail: flag(obj(raw.preferences).briefingEmail) },
  };
}

export function normalizeQueueRow(value: unknown): QueueRow {
  const raw = obj(value);
  const counts = obj(raw.counts);
  const score = num(raw.score) ?? 0;
  const override = toOverride(raw.override, raw);
  const spikeState = str(raw.spikeState) ?? (typeof raw.spike === 'string' ? raw.spike : raw.spike === true ? 'flagged' : 'none');
  return {
    publicId: str(raw.publicId) ?? '',
    category: str(raw.category) ?? '',
    status: str(raw.status) ?? '',
    description: str(raw.description),
    createdAt: str(raw.createdAt),
    score,
    level: toLevel(raw.level) ?? override?.level ?? priorityLevel(score),
    levelChangedAt: str(raw.levelChangedAt),
    override,
    spike: raw.spike === true || spikeState === 'flagged' || spikeState === 'confirmed',
    spikeState,
    counts: {
      coReporters: num(counts.coReporters) ?? num(raw.coReporterCount) ?? 0,
      comments: num(counts.commenters) ?? num(counts.comments) ?? num(raw.commentCount) ?? 0,
      meToo: num(counts.meToo) ?? num(raw.meTooCount) ?? 0,
    },
    tenant: toTenantRef(raw),
    editable: raw.editable === true,
  };
}

export function normalizeQueue(value: unknown): { reports: QueueRow[]; total: number | null } {
  return { reports: list(value, 'reports').map(normalizeQueueRow), total: num(obj(value).total) };
}

export function normalizeBreakdown(value: unknown): Breakdown | null {
  const raw = obj(value);
  const score = num(raw.score);
  if (score === null) return null;
  const coReporters = num(raw.coReporters) ?? 0;
  const commenters = num(raw.commenters) ?? 0;
  const meToo = num(raw.meToo) ?? 0;
  return {
    coReporters,
    commenters,
    meToo,
    discountedVotes: num(raw.discountedVotes ?? raw.discounted),
    base: num(raw.base) ?? coReporters * 5 + commenters * 2 + meToo,
    ageHours: num(raw.ageHours) ?? 0,
    decay: num(raw.decay) ?? 1,
    dangerMarks: num(raw.dangerMarks) ?? 0,
    dangerMultiplier: num(raw.dangerMultiplier) ?? 1,
    safetyCategory: raw.safetyCategory === true,
    safetyMultiplier: num(raw.safetyMultiplier) ?? 1,
    score,
  };
}

export function normalizeComment(value: unknown): StaffComment {
  const raw = obj(value);
  const state = raw.state === 'held' || raw.state === 'removed' ? raw.state : 'visible';
  const report = raw.report;
  return {
    id: str(raw.id) ?? '',
    body: typeof raw.body === 'string' ? raw.body : '',
    state,
    flagCount: num(raw.flagCount ?? raw.flags) ?? 0,
    createdAt: str(raw.createdAt),
    authorId: str(raw.authorId ?? raw.accountId),
    reportId: str(raw.reportPublicId ?? raw.reportId ?? raw.publicId) ?? (typeof report === 'string' ? report : str(obj(report).publicId)),
    tenantName: str(raw.tenantName),
    editable: flag(raw.editable),
  };
}

function normalizeHistory(value: unknown): HistoryEntry {
  const raw = obj(value);
  return {
    at: str(raw.at ?? raw.createdAt),
    kind: str(raw.kind ?? raw.action ?? raw.type) ?? '',
    to: str(raw.to ?? raw.status ?? raw.level),
    from: str(raw.from),
    note: str(raw.note ?? raw.publicNote),
    reason: str(raw.reason),
    by: str(raw.by ?? raw.actor ?? raw.byEmail),
  };
}

function normalizeTargets(value: unknown): ForwardTargets | null {
  if (!value || typeof value !== 'object') return null;
  const raw = obj(value);
  const target = (v: unknown) => {
    const o = obj(v);
    return { id: str(o.id) ?? '', name: str(o.name) ?? '', type: str(o.type) };
  };
  // The API sends `tenants` (parent first, then live siblings); `parents`/`siblings` are accepted too.
  const split = Array.isArray(raw.tenants) ? splitForwardTenants(list(raw.tenants).map(target).filter((t) => t.id)) : null;
  return {
    parents: split?.parents ?? list(raw.parents).map(target).filter((t) => t.id),
    siblings: split?.siblings ?? list(raw.siblings).map(target).filter((t) => t.id),
    contacts: list(raw.contacts)
      .map((v) => ({ ...target(v), email: str(obj(v).email) }))
      .filter((t) => t.id),
  };
}

export function normalizeDetail(value: unknown): StaffReportDetail {
  const raw = obj(value);
  const row = normalizeQueueRow(value);
  const breakdown = normalizeBreakdown(raw.breakdown);
  const capture = raw.capture && typeof raw.capture === 'object' ? obj(raw.capture) : null;
  const location = obj(raw.location);
  const thresholds = toThresholds(raw.thresholds) ?? { critical: DEFAULT_THRESHOLDS.Critical, high: DEFAULT_THRESHOLDS.High, medium: DEFAULT_THRESHOLDS.Medium };
  const score = breakdown?.score ?? row.score;
  const meTooCount = num(raw.meTooCount);
  // After a confirmed spike, new accounts' votes count half: the difference to the raw count is half of them.
  if (breakdown && breakdown.discountedVotes === null && row.spikeState === 'confirmed' && meTooCount !== null && meTooCount > breakdown.meToo) {
    breakdown.discountedVotes = Math.round((meTooCount - breakdown.meToo) * 2);
  }
  return {
    ...row,
    score,
    level: toLevel(raw.level) ?? row.override?.level ?? priorityLevel(score, sharedThresholds(thresholds)),
    dangerous: raw.dangerous === true,
    lat: num(raw.lat ?? location.lat),
    lon: num(raw.lon ?? location.lon),
    capture: capture
      ? { lat: num(capture.lat), lon: num(capture.lon), accuracyM: num(capture.accuracyM), at: str(capture.at ?? capture.capturedAt) }
      : raw.captureAt || raw.captureAccuracyM
        ? { lat: null, lon: null, accuracyM: num(raw.captureAccuracyM), at: str(raw.captureAt) }
        : null,
    photos: list(raw.photos).map((p) => {
      const o = obj(p);
      return { blurredUrl: str(o.blurredUrl ?? o.url), originalUrl: str(o.originalUrl) };
    }),
    breakdown,
    thresholds,
    publicNote: str(raw.publicNote),
    comments: list(raw.comments).map(normalizeComment),
    history: list(raw.history).map(normalizeHistory),
    forwardTargets: normalizeTargets(raw.forwardTargets),
    meTooCount,
  };
}

export function normalizeTenant(value: unknown): StaffTenant {
  const raw = obj(value);
  return {
    id: str(raw.id) ?? '',
    parentId: str(raw.parentId),
    name: str(raw.name) ?? '',
    type: str(raw.type) ?? '',
    path: str(raw.path) ?? '',
    status: toTenantStatus(raw.status),
    office: str(raw.office),
    thresholds: toThresholds(raw.thresholds),
    canAdmin: flag(raw.canAdmin),
    canActivate: flag(raw.canActivate),
  };
}

export function normalizeTenants(value: unknown): StaffTenant[] {
  return list(value, 'tenants').map(normalizeTenant).filter((t) => t.id && t.path);
}

export function normalizeContacts(value: unknown): Contact[] {
  return list(value, 'contacts')
    .map((v) => {
      const o = obj(v);
      return { id: str(o.id) ?? '', name: str(o.name) ?? '', email: str(o.email) ?? '' };
    })
    .filter((c) => c.id);
}

export function normalizeStaff(value: unknown): StaffMember[] {
  return list(value, 'staff')
    .map((v) => {
      const o = obj(v);
      const role = toRole(o.role);
      return role ? { accountId: str(o.accountId ?? o.id) ?? '', email: str(o.email) ?? '', role } : null;
    })
    .filter((s): s is StaffMember => s !== null && s.accountId !== '');
}

export function normalizeModeration(value: unknown): ModerationQueue {
  const raw = obj(value);
  return {
    comments: list(raw.comments).map(normalizeComment).filter((c) => c.id),
    spikes: list(raw.spikes ?? raw.voteSpikes)
      .map((v) => {
        const o = obj(v);
        return {
          publicId: str(o.publicId) ?? '',
          category: str(o.category),
          tenant: toTenantRef(o),
          votes: num(o.votes ?? o.meTooCount),
          newAccountVotes: num(o.newAccountVotes),
          flaggedAt: str(o.flaggedAt ?? o.createdAt),
          editable: o.editable === true,
        };
      })
      .filter((s) => s.publicId),
    heldReports: list(raw.held ?? raw.heldReports ?? raw.reports)
      .map((v) => {
        const o = obj(v);
        const reason = (HELD_REASONS as readonly unknown[]).includes(o.reason) ? (o.reason as HeldReason) : null;
        return { publicId: str(o.publicId) ?? '', category: str(o.category), tenant: toTenantRef(o), createdAt: str(o.createdAt), reason };
      })
      .filter((r) => r.publicId),
  };
}
