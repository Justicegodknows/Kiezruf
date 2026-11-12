import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://x',
  AUTH_SECRET: 'a'.repeat(32),
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Kiezruf <no-reply@example.org>',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  S3_BUCKET_PRIVATE: 'photos-private',
  PUBLIC_PHOTO_BASE_URL: 'http://localhost:9000/photos-public',
  WEB_BASE_URL: 'http://localhost:3000',
};

describe('loadConfig', () => {
  it('trusts no proxy unless told to', () => {
    expect(loadConfig(base).TRUST_PROXY).toEqual([]);
  });

  it('reads a list of trusted proxies', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '10.0.0.5, 10.1.0.0/16' }).TRUST_PROXY).toEqual(['10.0.0.5', '10.1.0.0/16']);
  });

  it('names missing settings without their values', () => {
    expect(() => loadConfig({ ...base, AUTH_SECRET: 'short' })).toThrow('Invalid or missing configuration: AUTH_SECRET');
  });
});

describe('aiFromConfig', () => {
  it('has no provider without a base URL, and one with it', async () => {
    const { aiFromConfig } = await import('./config.js');
    expect(aiFromConfig(loadConfig(base))).toBeUndefined();
    const ai = aiFromConfig(loadConfig({ ...base, AI_PROVIDER_BASE_URL: 'https://ai.example/v1', AI_MODEL_CHAT: 'c', AI_MODEL_VISION: 'v', AI_MODEL_EMBEDDING: 'e' }));
    expect(ai?.models).toEqual({ chat: 'c', vision: 'v', embedding: 'e' });
  });

  it('keeps photos unpublished unless a blur detector is chosen', () => {
    expect(loadConfig(base).BLUR_DETECTOR).toBe('none');
    expect(loadConfig({ ...base, BLUR_DETECTOR: 'full' }).BLUR_DETECTOR).toBe('full');
    expect(() => loadConfig({ ...base, BLUR_DETECTOR: 'magic' })).toThrow('BLUR_DETECTOR');
  });
});
