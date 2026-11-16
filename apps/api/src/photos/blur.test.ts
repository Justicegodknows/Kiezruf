import { describe, expect, it } from 'vitest';
import { BlurUnavailable, detectorFromConfig, fullImageDetector, noDetector } from './blur.js';

describe('blur detectors (US-31)', () => {
  it('"full" blurs the whole photo', async () => {
    expect(detectorFromConfig('full')).toBe(fullImageDetector);
    expect(await fullImageDetector.detect(Buffer.from(''))).toEqual([{ x: 0, y: 0, width: 1, height: 1 }]);
  });

  it('"none" makes photos wait instead of failing', async () => {
    expect(detectorFromConfig('none')).toBe(noDetector);
    expect(detectorFromConfig('')).toBe(noDetector);
    await expect(noDetector.detect(Buffer.from(''))).rejects.toBeInstanceOf(BlurUnavailable);
  });

  it('refuses unknown detectors', () => {
    expect(() => detectorFromConfig('magic')).toThrow('Unknown BLUR_DETECTOR');
  });
});
