import { describe, expect, it } from 'vitest';
import { openAiCompatibleProvider, type AiCallLog } from './provider.js';

function fakeFetch(answer: (body: Record<string, unknown>) => unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown>; auth: string }[] = [];
  const impl = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.authorization! });
    return { ok: status < 400, status, json: async () => answer(body) } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const chatAnswer = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });

function provider(fetchImpl: typeof fetch, logs: AiCallLog[] = []) {
  return openAiCompatibleProvider({
    baseUrl: 'https://ai.example/v1/',
    apiKey: 'key',
    chatModel: 'chat-1',
    visionModel: 'vision-1',
    embeddingModel: 'embed-1',
    fetch: fetchImpl,
    log: (e) => logs.push(e),
  });
}

describe('OpenAI-compatible provider', () => {
  it('asks the vision model with a JSON schema and the image as a data URL', async () => {
    const { impl, calls } = fakeFetch(() => chatAnswer({ category: 'pothole', confidence: 0.91, caption: 'A deep pothole.' }));
    const insight = await provider(impl).describePhoto(Buffer.from('jpeg'));
    expect(insight).toEqual({ category: 'pothole', confidence: 0.91, caption: 'A deep pothole.' });
    expect(calls[0]!.url).toBe('https://ai.example/v1/chat/completions');
    expect(calls[0]!.auth).toBe('Bearer key');
    expect(calls[0]!.body).toMatchObject({ model: 'vision-1', temperature: 0, response_format: { type: 'json_schema' } });
    expect(JSON.stringify(calls[0]!.body)).toContain('data:image/jpeg;base64,');
  });

  it('turns "unknown" or an invented category into no suggestion', async () => {
    for (const category of ['unknown', 'spaceship']) {
      const { impl } = fakeFetch(() => chatAnswer({ category, confidence: 0.99, caption: 'x' }));
      expect(await provider(impl).describePhoto(Buffer.from('x'))).toMatchObject({ category: null, confidence: null });
    }
  });

  it('returns embeddings', async () => {
    const { impl, calls } = fakeFetch(() => ({ data: [{ embedding: [0.1, 0.2] }] }));
    expect(await provider(impl).embed('pothole')).toEqual([0.1, 0.2]);
    expect(calls[0]).toMatchObject({ url: 'https://ai.example/v1/embeddings', body: { model: 'embed-1', input: 'pothole' } });
  });

  it('returns the briefing answer as parsed JSON for validation', async () => {
    const { impl, calls } = fakeFetch(() => chatAnswer({ items: [] }));
    expect(await provider(impl).briefing({ reports: [] })).toEqual({ items: [] });
    expect(calls[0]!.body).toMatchObject({ model: 'chat-1' });
  });

  it('logs model, input hash and latency, not the input', async () => {
    const logs: AiCallLog[] = [];
    const { impl } = fakeFetch(() => ({ data: [{ embedding: [1] }] }));
    await provider(impl, logs).embed('Call me, Anna');
    expect(logs).toEqual([{ kind: 'embedding', model: 'embed-1', inputHash: expect.stringMatching(/^[0-9a-f]{64}$/), latencyMs: expect.any(Number), ok: true }]);
    expect(JSON.stringify(logs)).not.toContain('Anna');
  });

  it('fails on an HTTP error and logs it', async () => {
    const logs: AiCallLog[] = [];
    const { impl } = fakeFetch(() => ({}), 503);
    await expect(provider(impl, logs).embed('x')).rejects.toThrow('AI provider answered 503');
    expect(logs[0]).toMatchObject({ ok: false, error: 'AI provider answered 503' });
  });
});
