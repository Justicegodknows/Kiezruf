// Error-code mapping: every API code from the README has a translation, and the client turns error bodies
// into codes the app knows.
import { ApiError, api, setAccessTokenProvider, setUnauthorizedHandler } from '../src/api/client';
import { API_ERROR_CODES, AppError, CLIENT_ERROR_CODES, errorCode, errorMessage } from '../src/api/errors';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import i18n from '../src/i18n';
import { mockApi } from '../src/testing/helpers';

afterEach(() => {
  setAccessTokenProvider(null);
  setUnauthorizedHandler(null);
});

describe('error codes', () => {
  test.each([...API_ERROR_CODES, ...CLIENT_ERROR_CODES])('%s has a German and an English message', (code) => {
    const deText = (de.errors as Record<string, string>)[code];
    const enText = (en.errors as Record<string, string>)[code];
    expect(deText).toBeTruthy();
    expect(enText).toBeTruthy();
    expect(deText).not.toBe(enText);
  });

  test('unknown codes fall back to the generic message', () => {
    expect(errorCode(new ApiError(418, 'teapot'))).toBe('unknown');
    expect(errorCode(new Error('boom'))).toBe('unknown');
    expect(errorCode(new AppError('location_denied'))).toBe('location_denied');
  });

  test('errorMessage translates in the current language', async () => {
    await i18n.changeLanguage('de');
    expect(errorMessage(i18n.t, new ApiError(422, 'not_on_site'))).toBe(de.errors.not_on_site);
    await i18n.changeLanguage('en');
    expect(errorMessage(i18n.t, new ApiError(422, 'not_on_site'))).toBe(en.errors.not_on_site);
    await i18n.changeLanguage('de');
  });
});

describe('api client', () => {
  test('throws ApiError with the code and details from the body', async () => {
    mockApi({ 'POST /reports': { status: 422, body: { error: 'not_live', tenant: 'Friedrichshain-Kreuzberg' } } });
    await expect(api('POST', '/reports', { body: {} })).rejects.toMatchObject({
      status: 422,
      code: 'not_live',
      details: { tenant: 'Friedrichshain-Kreuzberg' },
    });
  });

  test("Fastify's own rate-limit body becomes rate_limited", async () => {
    mockApi({ 'POST /uploads': { status: 429, body: { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded' } } });
    await expect(api('POST', '/uploads', { body: {} })).rejects.toMatchObject({ code: 'rate_limited' });
  });

  test('a failed connection is "network"', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    await expect(api('GET', '/me')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  test('sends the bearer token and reports a 401 to the auth layer', async () => {
    const calls = mockApi({ 'GET /me': { status: 401, body: { error: 'unauthorized' } } });
    const onUnauthorized = jest.fn();
    setAccessTokenProvider(async () => 'abc');
    setUnauthorizedHandler(onUnauthorized);
    await expect(api('GET', '/me')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls[0]!.headers.Authorization).toBe('Bearer abc');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('without a session no Authorization header goes out, and a 401 is not reported', async () => {
    const calls = mockApi({ 'GET /me': { status: 401, body: { error: 'unauthorized' } } });
    const onUnauthorized = jest.fn();
    setAccessTokenProvider(async () => null);
    setUnauthorizedHandler(onUnauthorized);
    await expect(api('GET', '/me')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
