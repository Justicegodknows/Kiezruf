// Shared rules from the MVP prototype. Keep in sync with kiezruf-mvp-prototype.html.
// One module on purpose: relative imports inside this package would need file extensions, and the API (tsc NodeNext),
// the web app (Next) and the mobile app (Metro) do not agree on them. Split it when that changes.

// === Priority score (US-22, US-23) ==================================================================

export type Level = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ScoreInput {
  coReporters: number;   // unique accounts, weight 5
  commenters: number;    // unique accounts, weight 2
  meToo: number;         // unique accounts, weight 1 (after any discount)
  ageHours: number;
  dangerMarks: number;   // >=3 -> x1.5, 1-2 -> x1.2
  safetyCategory: boolean; // x1.3
}

export const DEFAULT_THRESHOLDS: Record<Exclude<Level, 'Low'>, number> = { Critical: 60, High: 25, Medium: 10 };

/** Every factor of the score, for the console's breakdown (US-22: "Breakdown visible to staff"). */
export interface ScoreBreakdown extends ScoreInput {
  base: number;
  decay: number;
  dangerMultiplier: number;
  safetyMultiplier: number;
  /** base × decay × dangerMultiplier × safetyMultiplier */
  score: number;
}

export function scoreBreakdown(r: ScoreInput): ScoreBreakdown {
  const base = r.coReporters * 5 + r.commenters * 2 + r.meToo;
  const decay = Math.pow(0.5, r.ageHours / (24 * 14));
  const dangerMultiplier = r.dangerMarks >= 3 ? 1.5 : r.dangerMarks >= 1 ? 1.2 : 1;
  const safetyMultiplier = r.safetyCategory ? 1.3 : 1;
  return { ...r, base, decay, dangerMultiplier, safetyMultiplier, score: base * decay * dangerMultiplier * safetyMultiplier };
}

export function priorityScore(r: ScoreInput): number {
  return scoreBreakdown(r).score;
}

export type Thresholds = Record<Exclude<Level, 'Low'>, number>;

export const LEVELS: readonly Level[] = ['Critical', 'High', 'Medium', 'Low'];

/** Per-tenant thresholds must fall strictly from Critical to Medium and stay positive (US-23). */
export function validThresholds(t: Thresholds): boolean {
  return t.Critical > t.High && t.High > t.Medium && t.Medium > 0;
}

export function priorityLevel(score: number, t: Thresholds = DEFAULT_THRESHOLDS): Level {
  if (score >= t.Critical) return 'Critical';
  if (score >= t.High) return 'High';
  if (score >= t.Medium) return 'Medium';
  return 'Low';
}

// === Vote spikes (US-26, US-37, D-04) ==================================================================

/** The spike rule: more than 10 Me too votes within 60 minutes, over half of them from accounts younger than 7 days. */
export const SPIKE_WINDOW_MINUTES = 60;
export const SPIKE_MIN_VOTES = 10;
export const NEW_ACCOUNT_DAYS = 7;
/** Weight of a new account's vote while a spike is flagged. */
export const NEW_ACCOUNT_DISCOUNT = 0.5;

export interface Vote {
  accountId: string;
  at: Date;
  /** When the voting account was created. */
  accountCreatedAt: Date;
}

/** An account counts as new if it was younger than 7 days when it voted. */
export function isNewAccountVote(v: Vote): boolean {
  return v.at.getTime() - v.accountCreatedAt.getTime() < NEW_ACCOUNT_DAYS * 86_400_000;
}

/** One vote per account: the earliest. Merged duplicates can bring the same account twice (US-17). */
export function uniqueVotes(votes: readonly Vote[]): Vote[] {
  const first = new Map<string, Vote>();
  for (const v of votes) {
    const seen = first.get(v.accountId);
    if (!seen || v.at < seen.at) first.set(v.accountId, v);
  }
  return [...first.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** True when any 60-minute window holds more than 10 votes with over half from new accounts. */
export function detectSpike(votes: readonly Vote[]): boolean {
  const sorted = uniqueVotes(votes);
  const windowMs = SPIKE_WINDOW_MINUTES * 60_000;
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end]!.at.getTime() - sorted[start]!.at.getTime() > windowMs) start++;
    const inWindow = sorted.slice(start, end + 1);
    const fresh = inWindow.filter(isNewAccountVote).length;
    if (inWindow.length > SPIKE_MIN_VOTES && fresh * 2 > inWindow.length) return true;
  }
  return false;
}

/** The Me too part of the score: one per account, new accounts at half weight while a spike is flagged. */
export function meTooWeight(votes: readonly Vote[], discountNewAccounts: boolean): number {
  return uniqueVotes(votes).reduce((sum, v) => sum + (discountNewAccounts && isNewAccountVote(v) ? NEW_ACCOUNT_DISCOUNT : 1), 0);
}

// === Forward links (US-45) ==========================================================================

/** A forward link opens the report without a login for this many days. */
export const FORWARD_LINK_DAYS = 90;

export function forwardLinkExpired(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() > FORWARD_LINK_DAYS * 86_400_000;
}

// === Report IDs ==================================================================================

// Public report IDs (US-41): <Land>-<tenant>-<year>-<4-digit sequence>, e.g. BE-NK-2026-0118.
// The sequence runs per tenant and calendar year (Europe/Berlin).

export const MAX_REPORT_SEQUENCE = 9999;

/** Matches a public report ID and captures Land code, tenant code, year and sequence. */
export const REPORT_ID_PATTERN = /^([A-Z]{2})-([A-Z]{1,4})-(\d{4})-(\d{4})$/;

export interface ReportIdParts {
  land: string;
  tenant: string;
  year: number;
  sequence: number;
}

export function formatReportId({ land, tenant, year, sequence }: ReportIdParts): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_REPORT_SEQUENCE) {
    throw new RangeError(`Report sequence must be 1–${MAX_REPORT_SEQUENCE}, got ${sequence}`);
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new RangeError(`Invalid year ${year}`);
  const id = `${land.toUpperCase()}-${tenant.toUpperCase()}-${year}-${String(sequence).padStart(4, '0')}`;
  if (!REPORT_ID_PATTERN.test(id)) throw new RangeError(`Invalid report ID parts: ${id}`);
  return id;
}

export function parseReportId(id: string): ReportIdParts | null {
  const m = REPORT_ID_PATTERN.exec(id);
  if (!m) return null;
  return { land: m[1]!, tenant: m[2]!, year: Number(m[3]), sequence: Number(m[4]) };
}

/** The calendar year in Berlin at `at`, which decides the report's ID year. */
export function berlinYear(at: Date): number {
  return Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(at));
}

// === On-site rules ===============================================================================

// On-site rules for posting and voting (US-03, US-06, US-32, D-03).
// The client enforces them before posting; the API checks them again.

/** Accuracy worse than this asks the citizen to wait or step outside (US-03). */
export const MAX_ACCURACY_M = 100;
/** Gallery photos only if taken on-site within this many hours (US-06). */
export const MAX_PHOTO_AGE_HOURS = 48;
/** Device clocks drift: a capture time this far in the future still counts as now. */
export const MAX_CLOCK_SKEW_MINUTES = 5;
/** The citizen may move the pin this far from the capture point (US-10). */
export const MAX_PIN_ADJUST_M = 50;
/** A Me too vote counts as on-site within this distance of the report (D-03). Same radius as the duplicate check. */
export const MAX_VOTE_DISTANCE_M = 150;
/** Up to 3 photos per report (US-06). */
export const MAX_PHOTOS = 3;

export interface CaptureFix {
  /** Horizontal accuracy in metres, as reported by the device. Missing means the photo had no location metadata. */
  accuracyM: number | null;
  /** When the photo was taken. Missing means the photo had no time metadata. */
  capturedAt: Date | null;
}

export type GateResult =
  | { ok: true }
  | { ok: false; reason: 'no_metadata' | 'accuracy_too_low' | 'capture_too_old' | 'capture_in_future' };

export function checkCapture(fix: CaptureFix, now: Date): GateResult {
  if (fix.accuracyM === null || fix.capturedAt === null || Number.isNaN(fix.capturedAt.getTime())) {
    return { ok: false, reason: 'no_metadata' };
  }
  if (!(fix.accuracyM >= 0) || fix.accuracyM > MAX_ACCURACY_M) return { ok: false, reason: 'accuracy_too_low' };
  const ageMs = now.getTime() - fix.capturedAt.getTime();
  if (ageMs < -MAX_CLOCK_SKEW_MINUTES * 60_000) return { ok: false, reason: 'capture_in_future' };
  if (ageMs > MAX_PHOTO_AGE_HOURS * 3_600_000) return { ok: false, reason: 'capture_too_old' };
  return { ok: true };
}

// === Categories ==================================================================================

// Default report categories (US-08): two groups with sub-categories. Per-tenant category management
// comes with the tenant setup screen (US-46); until then every tenant uses this list.
// Keys are stable API values; display names live in the clients' translation files.

export type CategoryGroup = 'traffic' | 'community';

export interface Category {
  key: string;
  group: CategoryGroup;
  /** The English name from the product plan, used in tests and Gherkin steps. */
  name: string;
  /** Safety-relevant: the score gets ×1.3 (US-22). From the product plan's sample reports. */
  safety: boolean;
}

export const CATEGORIES: readonly Category[] = [
  { key: 'traffic_light', group: 'traffic', name: 'Traffic light', safety: true },
  { key: 'pothole', group: 'traffic', name: 'Pothole', safety: true },
  { key: 'bike_lane', group: 'traffic', name: 'Bike lane', safety: false },
  { key: 'road_sign', group: 'traffic', name: 'Road sign', safety: true },
  { key: 'street_lighting', group: 'traffic', name: 'Street lighting', safety: true },
  { key: 'traffic_other', group: 'traffic', name: 'Other', safety: false },
  { key: 'illegal_dumping', group: 'community', name: 'Illegal dumping', safety: false },
  { key: 'playground', group: 'community', name: 'Playground', safety: true },
  { key: 'public_toilet', group: 'community', name: 'Public toilet', safety: false },
  { key: 'waste_bins', group: 'community', name: 'Waste bins', safety: false },
  { key: 'youth_centre', group: 'community', name: 'Youth centre', safety: false },
  { key: 'community_other', group: 'community', name: 'Other', safety: false },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** The group of a category key, e.g. pothole → traffic. Duplicates and hotspots compare within a group (US-13, US-50). */
export function categoryGroup(key: string): CategoryGroup | undefined {
  return CATEGORIES.find((c) => c.key === key)?.group;
}

export function isSafetyCategory(key: string): boolean {
  return CATEGORIES.some((c) => c.key === key && c.safety);
}

/** "Other" requires a description (US-08). */
export function categoryNeedsDescription(key: string): boolean {
  return key.endsWith('_other');
}

/** Finds a category by its English name, e.g. "Pothole". "Other" is ambiguous and returns undefined. */
export function categoryByName(name: string): Category | undefined {
  const matches = CATEGORIES.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  return matches.length === 1 ? matches[0] : undefined;
}

// === Pseudonymisation before AI calls (D-13, US-53) =================================================
//
// Citizen text (comments, descriptions) loses names, email addresses and phone numbers before it goes to the AI
// provider. It is a filter, not a guarantee: it errs towards removing, and street and place names must survive.

export const PSEUDONYMS = { name: '[Name]', email: '[E-Mail]', phone: '[Telefon]' } as const;

const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)+/gu;
// A phone number starts with +, 00 or 0 and has at least 7 digits, with spaces, slashes, dots, dashes or brackets.
const PHONE = /(?<![\p{L}\d])(?:\+|00|0)[\d\s/().-]{5,}\d(?![\p{L}\d])/gu;
const DATE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
// Words after which a person's name follows: "Call me, Anna", "Ich bin Jonas", "Viele Grüße, Leyla".
const NAME_CUES = [
  'call me', 'ask for', 'my name is', 'i am', "i'm", 'this is', 'thanks', 'thank you', 'regards', 'cheers', 'hi', 'hello', 'hey', 'dear',
  'ruf mich an', 'ruft mich an', 'rufen sie mich an', 'fragt nach', 'fragen sie nach', 'ich bin', 'ich heiße', 'mein name ist', 'hier ist',
  'danke', 'gruß', 'grüße', 'viele grüße', 'liebe grüße', 'lg', 'vg', 'mfg', 'hallo', 'liebe', 'lieber', 'frau', 'herr', 'herrn',
];
// Common first names in Berlin (German, Turkish, Arabic, Polish, English). Matched as whole words only.
const FIRST_NAMES = new Set(
  (
    'anna maria sophie sofia marie emma mia hannah hanna lena laura lea leonie julia sarah sara lisa katharina johanna clara klara ' +
    'charlotte emilia ella luisa louisa amelie nina jana paula frieda greta helene ida mila lina nele ' +
    'max maximilian alexander paul lukas luca leon felix jonas elias noah ben finn jan tim tom niklas moritz julian david daniel ' +
    'michael thomas andreas stefan christian peter klaus jürgen wolfgang uwe frank markus martin sebastian tobias philipp florian ' +
    'mehmet mustafa ahmet ali hasan hüseyin ibrahim emre burak can deniz elif zeynep ayşe ayse fatma emine merve büşra leyla ' +
    'mohammed mohamed muhammad ahmad ahmed omar youssef yusuf khaled karim amir fatima aisha mariam maryam yasmin layla nour ' +
    'piotr tomasz anna katarzyna agnieszka małgorzata ' +
    'john james robert william richard joseph charles thomas mary patricia jennifer linda elizabeth susan jessica emily olivia'
  ).split(/\s+/),
);
const STREET_SUFFIX = /^(straße|strasse|str\.?|platz|weg|allee|damm|ufer|park|brücke|ring|gasse|chaussee|markt|kiez)$/i;

function cueBefore(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 30), index).toLowerCase().replace(/[\s,:;!.-]+$/u, '');
  return NAME_CUES.some((cue) => before === cue || before.endsWith(` ${cue}`) || before.endsWith(`\n${cue}`));
}

/** Replaces names, email addresses and phone numbers in citizen text with placeholders. */
export function pseudonymise(text: string): string {
  let out = text.replace(EMAIL, PSEUDONYMS.email);
  out = out.replace(PHONE, (match) => {
    const trimmed = match.trim();
    if (DATE.test(trimmed)) return match;
    return (trimmed.match(/\d/g) ?? []).length >= 7 ? PSEUDONYMS.phone : match;
  });
  // Capitalised words: names after a cue, and common first names anywhere, unless part of a street or compound.
  return out.replace(/(?<![\p{L}\d-])(\p{Lu}[\p{Ll}]+)(?![\p{L}\d]|-\p{L})/gu, (word, _w, index: number) => {
    // A street suffix within the next two words: "Paul Lincke Ufer", "Karl Marx Straße".
    const following = out.slice(index + word.length).split(/\s+/u).filter(Boolean).slice(0, 2);
    if (following.some((w) => STREET_SUFFIX.test(w.replace(/[,.;:!?]+$/u, '')))) return word;
    if (FIRST_NAMES.has(word.toLowerCase()) || cueBefore(out, index)) return PSEUDONYMS.name;
    return word;
  });
}

// === Weekly briefing (US-53) =======================================================================

export const MAX_BRIEFING_ITEMS = 5;
export const BRIEFING_KINDS = ['Urgent', 'Watch', 'Improving'] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];

export interface BriefingItem {
  level: Level;
  kind: BriefingKind;
  headline: string;
  text: string;
  /** Report IDs the item rests on. Every claim cites at least one. */
  citations: string[];
}

export interface Briefing {
  /** Shown on every briefing: AI-written, staff decide (US-53). False only for the no-AI fallback. */
  aiWritten: boolean;
  fallback: boolean;
  items: BriefingItem[];
}

export type DropReason = 'malformed' | 'no_citations' | 'citation_out_of_scope' | 'over_limit';

/**
 * Keeps the model's items that are well formed and cite only reports from the briefing's input, which is always inside
 * the tenant's scope. An item citing anything else is dropped whole. At most 5 items survive.
 */
export function validateBriefing(raw: unknown, allowedIds: ReadonlySet<string>): Briefing & { dropped: { index: number; reason: DropReason }[] } {
  const list = Array.isArray((raw as { items?: unknown })?.items) ? ((raw as { items: unknown[] }).items) : [];
  const items: BriefingItem[] = [];
  const dropped: { index: number; reason: DropReason }[] = [];
  list.forEach((entry, index) => {
    const e = entry as Partial<Record<keyof BriefingItem, unknown>>;
    const wellFormed =
      LEVELS.includes(e.level as Level) && BRIEFING_KINDS.includes(e.kind as BriefingKind) &&
      typeof e.headline === 'string' && e.headline.trim() !== '' && typeof e.text === 'string' && Array.isArray(e.citations);
    if (!wellFormed) return dropped.push({ index, reason: 'malformed' });
    const citations = [...new Set((e.citations as unknown[]).filter((c): c is string => typeof c === 'string'))];
    if (citations.length === 0) return dropped.push({ index, reason: 'no_citations' });
    if (citations.some((c) => !allowedIds.has(c))) return dropped.push({ index, reason: 'citation_out_of_scope' });
    if (items.length >= MAX_BRIEFING_ITEMS) return dropped.push({ index, reason: 'over_limit' });
    items.push({ level: e.level as Level, kind: e.kind as BriefingKind, headline: (e.headline as string).trim(), text: (e.text as string).trim(), citations });
  });
  return { aiWritten: true, fallback: false, items, dropped };
}

export interface FallbackReport {
  publicId: string;
  level: Level;
  category: string;
}

/** When no AI item survives: the top reports by score, one item each, not AI-written. */
export function fallbackBriefing(top: readonly FallbackReport[]): Briefing {
  return {
    aiWritten: false,
    fallback: true,
    items: top.slice(0, MAX_BRIEFING_ITEMS).map((r) => ({
      level: r.level,
      kind: r.level === 'Critical' || r.level === 'High' ? 'Urgent' : 'Watch',
      headline: r.publicId,
      text: r.category,
      citations: [r.publicId],
    })),
  };
}

