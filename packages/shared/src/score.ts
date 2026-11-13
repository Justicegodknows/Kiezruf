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

/** Every factor of the score, so staff can see how it is built (US-24 breakdown panel). */
export interface ScoreBreakdown {
  coReporterPoints: number;
  commenterPoints: number;
  meTooPoints: number;
  base: number;
  decay: number;
  danger: number;
  safety: number;
  score: number;
}

export function scoreBreakdown(r: ScoreInput): ScoreBreakdown {
  const coReporterPoints = r.coReporters * 5;
  const commenterPoints = r.commenters * 2;
  const meTooPoints = r.meToo;
  const base = coReporterPoints + commenterPoints + meTooPoints;
  const decay = Math.pow(0.5, r.ageHours / (24 * 14));
  const danger = r.dangerMarks >= 3 ? 1.5 : r.dangerMarks >= 1 ? 1.2 : 1;
  const safety = r.safetyCategory ? 1.3 : 1;
  return { coReporterPoints, commenterPoints, meTooPoints, base, decay, danger, safety, score: base * decay * danger * safety };
}

export function priorityScore(r: ScoreInput): number {
  return scoreBreakdown(r).score;
}

export function priorityLevel(score: number, t = DEFAULT_THRESHOLDS): Level {
  if (score >= t.Critical) return 'Critical';
  if (score >= t.High) return 'High';
  if (score >= t.Medium) return 'Medium';
  return 'Low';
}
