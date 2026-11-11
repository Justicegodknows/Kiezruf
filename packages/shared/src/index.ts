// Shared rules from the MVP prototype (US-22, US-23). Keep in sync with kiezruf-mvp-prototype.html.
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

export function priorityScore(r: ScoreInput): number {
  const base = r.coReporters * 5 + r.commenters * 2 + r.meToo;
  const decay = Math.pow(0.5, r.ageHours / (24 * 14));
  const danger = r.dangerMarks >= 3 ? 1.5 : r.dangerMarks >= 1 ? 1.2 : 1;
  const safety = r.safetyCategory ? 1.3 : 1;
  return base * decay * danger * safety;
}

export function priorityLevel(score: number, t = DEFAULT_THRESHOLDS): Level {
  if (score >= t.Critical) return 'Critical';
  if (score >= t.High) return 'High';
  if (score >= t.Medium) return 'Medium';
  return 'Low';
}
