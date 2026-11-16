// MapLibre GL 6 builds its worker URL from its own module URL. Once Next bundles the library into a chunk, that
// points at /_next/static/chunks/maplibre-gl-worker.mjs, which does not exist, and every map fails with
// "Worker failed to load". This copies the worker into public/, where src/lib/maplibre.ts points MapLibre at it.
// Runs before `dev` and `build` (package.json), so the copy always matches the installed version.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const source = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist', 'maplibre-gl-worker.mjs');
const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maplibre', 'maplibre-gl-worker.mjs');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
