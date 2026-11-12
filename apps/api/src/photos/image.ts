// Image handling for the photo pipeline (US-16, US-31) with sharp: EXIF-free copies, blurring regions, and a
// perceptual hash for duplicate detection (US-13).
import sharp from 'sharp';

/** Larger originals are not processed: the presigned upload cannot cap size, so the pipeline does (PROGRESS.md). */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_EDGE = 2048;

/** A region to blur, in fractions of the image (0..1), as a detector returns it. */
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Upright, at most 2048 px on the long edge, re-encoded as JPEG. sharp writes no metadata unless asked, so the copy
 * carries no EXIF: no GPS, no camera, no capture time.
 */
export async function sanitise(original: Buffer): Promise<Buffer> {
  return sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/** A smaller copy for the AI provider. */
export async function forAi(image: Buffer): Promise<Buffer> {
  return sharp(image).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

/** Blurs each region strongly enough that faces and plates cannot be read, by downscaling it to a few pixels. */
export async function blurRegions(image: Buffer, regions: readonly Region[]): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const patches = await Promise.all(
    regions.map(async (r) => {
      const left = Math.max(0, Math.floor(r.x * width));
      const top = Math.max(0, Math.floor(r.y * height));
      const w = Math.max(1, Math.min(width - left, Math.ceil(r.width * width)));
      const h = Math.max(1, Math.min(height - top, Math.ceil(r.height * height)));
      // Down to roughly 8 px across, then back up: no detail survives.
      const tiny = await sharp(image)
        .extract({ left, top, width: w, height: h })
        .resize({ width: Math.max(1, Math.min(8, w)), height: Math.max(1, Math.round((Math.min(8, w) * h) / w)), fit: 'fill' })
        .toBuffer();
      const input = await sharp(tiny).resize({ width: w, height: h, fit: 'fill', kernel: 'cubic' }).blur(Math.max(0.3, Math.min(w, h) / 20)).toBuffer();
      return { input, left, top };
    }),
  );
  return sharp(image).composite(patches).jpeg({ quality: 85 }).toBuffer();
}

/** 64-bit difference hash as 16 hex digits: similar photos have hashes a few bits apart. */
export async function differenceHash(image: Buffer): Promise<string> {
  const pixels = await sharp(image).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (pixels[y * 9 + x]! > pixels[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
}
