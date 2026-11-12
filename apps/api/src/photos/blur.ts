// Where to blur (US-31). D-15: vlincta.com finds faces and licence plates; until its blur endpoint is known (E-01),
// the detector is chosen by configuration (BLUR_DETECTOR):
//   full  blur the whole photo. Safe (nothing readable is ever public) but the photo shows little. For development.
//   none  no detector: photos wait unprocessed and reports stay unpublished. Nothing unblurred is ever public.
import type { Region } from './image.js';

export interface BlurDetector {
  /** Regions to blur. Throws BlurUnavailable when no detector is configured: the photo then simply waits. */
  detect(jpeg: Buffer): Promise<Region[]>;
}

export class BlurUnavailable extends Error {
  constructor() {
    super('No blur detector configured');
  }
}

export const fullImageDetector: BlurDetector = {
  async detect() {
    return [{ x: 0, y: 0, width: 1, height: 1 }];
  },
};

export const noDetector: BlurDetector = {
  async detect() {
    throw new BlurUnavailable();
  },
};

export function detectorFromConfig(name: string): BlurDetector {
  if (name === 'full') return fullImageDetector;
  if (name === 'none' || name === '') return noDetector;
  throw new Error(`Unknown BLUR_DETECTOR "${name}"`);
}
