// Guards the public surface: every runtime export of the modules is re-exported by name from
// index.ts. (`export *` would hide them from Node + tsx; see the comment in index.ts.)
import { describe, expect, it } from 'vitest';
import * as index from './index';
import * as demo from './demo';
import * as icons from './icons';
import * as kiezMap from './kiez-map';
import * as photos from './photos';
import * as score from './score';

describe('@kiezruf/shared public surface', () => {
  it('re-exports every runtime export of every module', () => {
    for (const mod of [score, demo, icons, photos, kiezMap]) {
      for (const name of Object.keys(mod)) expect(index).toHaveProperty(name);
    }
  });
});
