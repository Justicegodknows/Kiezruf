// Guards the public surface: every runtime export of the modules is re-exported by name from
// index.ts. (`export *` would hide them from Node + tsx; see the comment in index.ts.)
import { describe, expect, it } from 'vitest';
import * as index from './index.ts';
import * as demo from './demo.ts';
import * as icons from './icons.ts';
import * as kiezMap from './kiez-map.ts';
import * as photos from './photos.ts';
import * as score from './score.ts';

describe('@kiezruf/shared public surface', () => {
  it('re-exports every runtime export of every module', () => {
    for (const mod of [score, demo, icons, photos, kiezMap]) {
      for (const name of Object.keys(mod)) expect(index).toHaveProperty(name);
    }
  });
});
