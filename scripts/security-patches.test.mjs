// Regression tests for dependencies we patch for security (pnpm `patchedDependencies`).
// If an upgrade or reinstall drops a patch, these fail before the vulnerability ships.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

const store = join(import.meta.dirname, '..', 'node_modules', '.pnpm');

// deepmerge is only used by jest-config (mobile tests). Resolve it the way jest-config does.
function deepmergeAsUsedByJest() {
  const dir = readdirSync(store).find((d) => d.startsWith('jest-config@'));
  assert.ok(dir, 'jest-config is not installed; run pnpm install');
  const require = createRequire(join(store, dir, 'node_modules', 'jest-config', 'package.json'));
  return require('deepmerge');
}

test('deepmerge: an own "__proto__" key cannot replace the result prototype (GHSA-gcqx-w48m-w2h4)', () => {
  const deepmerge = deepmergeAsUsedByJest();
  const poisoned = JSON.parse('{"name":"config","__proto__":{"isAdmin":true}}');
  for (const merged of [deepmerge(poisoned, { extra: 1 }), deepmerge({ extra: 1 }, poisoned)]) {
    assert.equal(Object.getPrototypeOf(merged), Object.prototype);
    assert.equal(merged.isAdmin, undefined);
  }
});

test('deepmerge: ordinary merges behave as before the patch', () => {
  const deepmerge = deepmergeAsUsedByJest();
  assert.deepEqual(deepmerge({ a: 1, n: { x: 1 }, list: [1] }, { b: 2, n: { y: 2 }, list: [2] }), {
    a: 1,
    b: 2,
    n: { x: 1, y: 2 },
    list: [1, 2],
  });
});
