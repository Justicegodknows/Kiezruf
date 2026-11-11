import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, newTotpSecret, otpauthUri, stepAt, totpAt, verifyTotp } from './totp.js';

// RFC 6238 appendix B: SHA-1 secret "12345678901234567890", 8-digit codes. The 6-digit code is the last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC test vector at %i s', (seconds, code) => {
    expect(totpAt(RFC_SECRET, stepAt(new Date(seconds * 1000)))).toBe(code);
  });

  it('round-trips base32', () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('accepts one step of drift either way, and nothing further', () => {
    const now = new Date('2026-11-11T10:00:00Z');
    const step = stepAt(now);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now, null)).toBeNull();
  });

  it('never accepts the same code twice', () => {
    const now = new Date('2026-11-11T10:00:00Z');
    const code = totpAt(RFC_SECRET, stepAt(now));
    const used = verifyTotp(RFC_SECRET, code, now, null);
    expect(used).toBe(stepAt(now));
    expect(verifyTotp(RFC_SECRET, code, now, used)).toBeNull();
  });

  it('refuses malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345', new Date(), null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', new Date(), null)).toBeNull();
  });

  it('builds an otpauth URI for authenticator apps', () => {
    expect(otpauthUri('ABC', 'anna@neukoelln.de')).toBe(
      'otpauth://totp/Kiezruf%3Aanna%40neukoelln.de?secret=ABC&issuer=Kiezruf&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('encrypts the secret at rest and detects tampering', () => {
    const stored = encryptSecret('k'.repeat(32), 'SECRET');
    expect(stored).not.toContain('SECRET');
    expect(decryptSecret('k'.repeat(32), stored)).toBe('SECRET');
    expect(() => decryptSecret('x'.repeat(32), stored)).toThrow();
  });
});
