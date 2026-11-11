import { describe, expect, it } from 'vitest';
import { scopeFromGrants, toLtreeArrayLiteral } from './scope.js';

describe('scopeFromGrants (US-42)', () => {
  it('lets a case worker read and change their own tenant', () => {
    expect(scopeFromGrants([{ path: 'de.be.bec.nk', role: 'case_worker' }])).toEqual({
      readPaths: ['de.be.bec.nk'],
      writePaths: ['de.be.bec.nk'],
    });
  });

  it('gives a viewer read access only', () => {
    expect(scopeFromGrants([{ path: 'de.be', role: 'viewer' }])).toEqual({ readPaths: ['de.be'], writePaths: [] });
  });

  it('combines several grants', () => {
    const scope = scopeFromGrants([
      { path: 'de.be', role: 'viewer' },
      { path: 'de.be.bec.sp', role: 'tenant_admin' },
    ]);
    expect(scope.readPaths).toEqual(['de.be', 'de.be.bec.sp']);
    expect(scope.writePaths).toEqual(['de.be.bec.sp']);
  });

  it('gives no access without grants', () => {
    expect(scopeFromGrants([])).toEqual({ readPaths: [], writePaths: [] });
  });
});

describe('toLtreeArrayLiteral', () => {
  it('formats paths as an ltree[] literal', () => {
    expect(toLtreeArrayLiteral(['de.be.bec.nk', 'de.be.bec.sp'])).toBe('{de.be.bec.nk,de.be.bec.sp}');
  });

  it('formats an empty scope as an empty array', () => {
    expect(toLtreeArrayLiteral([])).toBe('{}');
  });

  it.each(['', 'de..be', 'de.be,de.by', 'de.be}', 'de be', '"de"', 'de.be.'])('rejects %j', (path) => {
    expect(() => toLtreeArrayLiteral([path])).toThrow('Invalid tenant path');
  });
});
