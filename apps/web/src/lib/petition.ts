// The citizen frontend shows reports as petitions, after the app prototype (kiezruf-app-prototype.html, the
// frontend's source of truth since 2026-11-18): a report is a petition, "Me too" is signing it, category groups are
// topics. Pure helpers, so the feed, the pop-up and the tests share one definition.
import type { MessageKey } from '@/i18n';

export type TopicId = 'mobility' | 'green' | 'safety' | 'housing' | 'access' | 'families' | 'culture' | 'clean';

/** The prototype's eight topics, with its stroke icons (24×24). */
export const TOPICS: readonly { id: TopicId; icon: string }[] = [
  { id: 'mobility', icon: 'M2.5 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M14.5 16a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M6 16l4-7h5l3 7M10 9l3 7M9 6h3' },
  { id: 'green', icon: 'M12 21v-6M12 3a5 5 0 0 0-5 5 4 4 0 0 0 1 7h8a4 4 0 0 0 1-7 5 5 0 0 0-5-5z' },
  { id: 'safety', icon: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z' },
  { id: 'housing', icon: 'M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5' },
  { id: 'access', icon: 'M10.5 4.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M12 7v6h5l2 5M12 10h4M9 11a5 5 0 1 0 6 7' },
  { id: 'families', icon: 'M5.5 7a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M14 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M3.5 20v-3a4.5 4.5 0 0 1 9 0v3M13 20v-2.5a3 3 0 0 1 6 0V20' },
  { id: 'culture', icon: 'M9 18V5l11-2v13M4 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0M15 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0' },
  { id: 'clean', icon: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13' },
];

/** Which topic each report category belongs to. Housing and culture have no category yet. */
export const CATEGORY_TOPIC: Record<string, TopicId> = {
  traffic_light: 'safety',
  pothole: 'mobility',
  bike_lane: 'mobility',
  road_sign: 'mobility',
  street_lighting: 'safety',
  traffic_other: 'mobility',
  illegal_dumping: 'clean',
  waste_bins: 'clean',
  public_toilet: 'access',
  playground: 'families',
  youth_centre: 'families',
  community_other: 'green',
};

export const topicOf = (category: string): TopicId => CATEGORY_TOPIC[category] ?? 'mobility';
export const topicLabelKey = (topic: TopicId) => `kz.topic.${topic}` as MessageKey;

/**
 * The signature target: the next milestone above the count. Not the report's score or level threshold, which
 * citizens never see (US-24); a decision to confirm (ENG-26).
 */
const MILESTONES = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000];
export function signatureGoal(count: number): number {
  return MILESTONES.find((m) => m > count) ?? Math.ceil((count + 1) / 100_000) * 100_000;
}

export type PressureLevel = 0 | 1 | 2 | 3 | 4;

/**
 * The prototype's "votes to go" heat (kzPressure): label level, colours of the badge and of the rising fill.
 * Green, not the prototype's red "lava": in user testing (2026-11-23) red read as pressure ("like Booking.com")
 * and the fill was hard to see. The text darkens from ink to green as the petition nears its goal; every colour
 * keeps at least 4.5:1 against white, and white text keeps it on the fill.
 */
export function pressure(pct: number) {
  const level: PressureLevel = pct >= 100 ? 4 : pct >= 90 ? 3 : pct >= 75 ? 2 : pct >= 50 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (pct - 40) / 60));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const text = `rgb(${mix(42, 11)}, ${mix(58, 107)}, ${mix(99, 58)})`;
  const u = Math.max(0, Math.min(1, (pct - 30) / 70));
  const leaf = `${Math.round(30 - 10 * u)}, ${Math.round(110 + 20 * u)}, ${Math.round(64 + 6 * u)}`;
  return {
    level,
    color: level === 4 ? '#0B6B3A' : text,
    fillBottom: 'rgba(7, 82, 44, 0.96)',
    fillTop: `rgba(${leaf}, 0.94)`,
    wet: pct >= 50,
  };
}

/** Where a petition stands: the heat badge's text key while it collects signatures, the office's status after. */
export function badgeKey(status: string, level: PressureLevel): MessageKey {
  if (status === 'resolved') return 'kz.status.resolved';
  if (status === 'in_progress') return 'kz.status.inProgress';
  if (status === 'forwarded') return 'kz.status.forwarded';
  return (['kz.pCalm', 'kz.pRising', 'kz.pHigh', 'kz.pBoil', 'kz.pDone'] as const)[level];
}

export interface PetitionNumbers {
  count: number;
  goal: number;
  pct: number;
  left: number;
}

export function petitionNumbers(count: number, status: string): PetitionNumbers {
  // A resolved report reached its goal: the office fixed it.
  if (status === 'resolved') return { count, goal: Math.max(count, 1), pct: 100, left: 0 };
  const goal = signatureGoal(count);
  return { count, goal, pct: Math.min(99, Math.round((count / goal) * 100)), left: goal - count };
}

/**
 * A petition's title and body from a report's description: the first line (as the new petition form writes it), else
 * the first sentence, at most 90 characters. Without a description, the category's name is the title.
 */
export function splitDescription(description: string | null | undefined): { title: string | null; body: string | null } {
  const text = (description ?? '').trim();
  if (!text) return { title: null, body: null };
  const newline = text.indexOf('\n');
  if (newline > 0) return { title: clip(text.slice(0, newline).trim()), body: text.slice(newline + 1).trim() || null };
  const sentence = /^(.{8,}?[.!?])(\s|$)/.exec(text);
  if (sentence && sentence[1]!.length < text.length) return { title: clip(sentence[1]!.replace(/[.]$/, '')), body: text.slice(sentence[1]!.length).trim() || null };
  return { title: clip(text), body: text.length > 90 ? text : null };
}

function clip(s: string): string {
  return s.length > 90 ? `${s.slice(0, 88).trimEnd()}…` : s;
}

/** Initials for the account button: from the email's local part ("anna.schmidt@…" → "AS"). */
export function initialsOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const parts = email.split('@')[0]!.split(/[._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : parts[0]?.slice(0, 2)) ?? '';
  return letters.toUpperCase() || null;
}
