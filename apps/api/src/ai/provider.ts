// The AI provider (vlincta.com, D-13, D-15), spoken to through an OpenAI-compatible API: chat completions with a JSON
// schema (text and vision) and embeddings. Every call logs its kind, model, input hash and latency, never the input.
import { createHash } from 'node:crypto';
import { CATEGORY_KEYS } from '@kiezruf/shared';
import { BRIEFING_SCHEMA, BRIEFING_SYSTEM, PHOTO_SCHEMA, PHOTO_SYSTEM } from './prompts.js';

export interface PhotoInsight {
  /** A category key, or null when the model found none. */
  category: string | null;
  confidence: number | null;
  /** One sentence about the problem. Used only to compute the embedding; never stored. */
  caption: string;
}

export interface AiCallLog {
  kind: 'photo' | 'embedding' | 'briefing';
  model: string;
  inputHash: string;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface AiProvider {
  readonly models: { chat: string; vision: string; embedding: string };
  describePhoto(jpeg: Buffer, options?: { timeoutMs?: number }): Promise<PhotoInsight>;
  embed(text: string, options?: { timeoutMs?: number }): Promise<number[]>;
  /** The model's raw answer for a briefing input; validate it with validateBriefing before use. */
  briefing(input: unknown, options?: { timeoutMs?: number }): Promise<unknown>;
}

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  chatModel: string;
  visionModel: string;
  embeddingModel: string;
  fetch?: typeof fetch;
  log?: (entry: AiCallLog) => void;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export function openAiCompatibleProvider(options: OpenAiCompatibleOptions): AiProvider {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, '');

  async function call(kind: AiCallLog['kind'], model: string, path: string, body: object, timeoutMs: number): Promise<unknown> {
    const payload = JSON.stringify(body);
    const started = Date.now();
    const entry: AiCallLog = { kind, model, inputHash: sha256(payload), latencyMs: 0, ok: false };
    try {
      const response = await doFetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`AI provider answered ${response.status}`);
      const json = await response.json();
      entry.ok = true;
      return json;
    } catch (error) {
      entry.error = error instanceof Error ? error.name === 'TimeoutError' ? 'timeout' : error.message : 'unknown';
      throw error;
    } finally {
      entry.latencyMs = Date.now() - started;
      options.log?.(entry);
    }
  }

  async function chatJson(kind: 'photo' | 'briefing', model: string, messages: object[], schemaName: string, schema: object, timeoutMs: number) {
    const answer = (await call(kind, model, '/chat/completions', {
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } },
    }, timeoutMs)) as { choices?: { message?: { content?: string } }[] };
    const content = answer.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI provider gave no content');
    return JSON.parse(content) as unknown;
  }

  return {
    models: { chat: options.chatModel, vision: options.visionModel, embedding: options.embeddingModel },

    async describePhoto(jpeg, { timeoutMs = 30_000 } = {}) {
      const raw = (await chatJson('photo', options.visionModel, [
        { role: 'system', content: PHOTO_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Category keys: ${CATEGORY_KEYS.join(', ')}` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpeg.toString('base64')}` } },
          ],
        },
      ], 'photo_insight', PHOTO_SCHEMA, timeoutMs)) as { category?: unknown; confidence?: unknown; caption?: unknown };
      const category = typeof raw.category === 'string' && CATEGORY_KEYS.includes(raw.category) ? raw.category : null;
      const confidence = typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : null;
      return { category, confidence: category ? confidence : null, caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 200) : '' };
    },

    async embed(text, { timeoutMs = 15_000 } = {}) {
      const answer = (await call('embedding', options.embeddingModel, '/embeddings', { model: options.embeddingModel, input: text }, timeoutMs)) as {
        data?: { embedding?: number[] }[];
      };
      const vector = answer.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) throw new Error('AI provider gave no embedding');
      return vector;
    },

    async briefing(input, { timeoutMs = 120_000 } = {}) {
      return chatJson('briefing', options.chatModel, [
        { role: 'system', content: BRIEFING_SYSTEM },
        { role: 'user', content: JSON.stringify(input) },
      ], 'weekly_briefing', BRIEFING_SCHEMA, timeoutMs);
    },
  };
}
