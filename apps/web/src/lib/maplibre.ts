// Loads MapLibre GL in the browser and points it at the worker served from public/maplibre/
// (copied by scripts/copy-maplibre-worker.mjs). Without this, the bundled library looks for its worker next to
// its Next chunk, gets an HTML 404 and every map fails to load.
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

export async function loadMapLibre(): Promise<typeof import('maplibre-gl')> {
  const maplibre = await import('maplibre-gl');
  // Test doubles of the module may leave it out.
  if ('setWorkerUrl' in maplibre) maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
  return maplibre;
}
