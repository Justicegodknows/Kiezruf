// Prompts for the AI provider, pinned in the repo (engineering plan, "AI guardrails"). Change PROMPT_VERSION with
// every edit: it is stored with each briefing so its output can be traced to the prompt that made it.
import { BRIEFING_KINDS, CATEGORY_KEYS, LEVELS, MAX_BRIEFING_ITEMS } from '@kiezruf/shared';

export const PROMPT_VERSION = '2026-11-12.1';

export const PHOTO_SYSTEM = [
  'You look at one photo taken by a citizen for a municipal problem-reporting app in Berlin.',
  'Classify the problem shown into exactly one category key, or "unknown" when none fits.',
  'Write a caption: one short sentence describing the problem only.',
  'Never describe people, faces, clothing, licence plates, or any text that names a person.',
  'Answer only with JSON matching the schema.',
].join(' ');

export const PHOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'confidence', 'caption'],
  properties: {
    category: { type: 'string', enum: [...CATEGORY_KEYS, 'unknown'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    caption: { type: 'string', maxLength: 200 },
  },
} as const;

export const BRIEFING_SYSTEM = [
  'Du schreibst das Wochenbriefing für die Mitarbeitenden eines Berliner Bezirksamts.',
  `Schreibe höchstens ${MAX_BRIEFING_ITEMS} Punkte auf Deutsch, die wichtigsten zuerst.`,
  'Jeder Punkt hat eine Art: "Urgent" (jetzt handeln), "Watch" (beobachten) oder "Improving" (wird besser).',
  'Verwende ausschließlich die Daten aus der Eingabe, keine anderen Quellen und kein Vorwissen über Orte oder Personen.',
  'Jeder Punkt muss mindestens eine Meldungs-ID aus der Eingabe in "citations" nennen; nenne keine anderen IDs.',
  'Nenne keine Namen, E-Mail-Adressen oder Telefonnummern. Platzhalter wie [Name] bleiben Platzhalter.',
  'Antworte nur mit JSON nach dem Schema.',
].join(' ');

export const BRIEFING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: MAX_BRIEFING_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['level', 'kind', 'headline', 'text', 'citations'],
        properties: {
          level: { type: 'string', enum: [...LEVELS] },
          kind: { type: 'string', enum: [...BRIEFING_KINDS] },
          headline: { type: 'string', maxLength: 120 },
          text: { type: 'string', maxLength: 600 },
          citations: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
      },
    },
  },
} as const;
