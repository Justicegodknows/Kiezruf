// The photo pipeline (US-13, US-14, US-16, US-31). For each new photo: strip EXIF, blur what the detector finds, store
// the blurred copy publicly, hash it, and ask the AI provider for a category and an embedding. A report is published
// ("processing" → "open") once all its photos are blurred. Blur failing 3 times holds the report for moderation; it is
// never published unblurred. Runs in the worker as the table owner, every minute.
import { sql } from 'drizzle-orm';
import type { AiProvider } from '../ai/provider.js';
import type { Db } from '../db/client.js';
import type { PhotoStorage } from '../storage/photos.js';
import { BlurUnavailable, type BlurDetector } from './blur.js';
import { blurRegions, differenceHash, forAi, MAX_PHOTO_BYTES, sanitise } from './image.js';

export const MAX_BLUR_ATTEMPTS = 3;

export interface PipelineDeps {
  db: Db;
  storage: PhotoStorage;
  detector: BlurDetector;
  /** Optional: without a provider, photos are still blurred and published, just without category or embedding. */
  ai?: AiProvider;
  log?: (entry: Record<string, unknown>) => void;
}

type PendingPhoto = { id: string; report_id: string; original_key: string; attempts: number };

export async function processPendingPhotos(deps: PipelineDeps, limit = 20): Promise<{ done: number; failed: number; waiting: number }> {
  const result = { done: 0, failed: 0, waiting: 0 };
  const photos = await deps.db.execute<PendingPhoto>(sql`
    SELECT p.id, p.report_id, p.original_key, p.attempts FROM photo p
    WHERE p.blur_status = 'pending' AND p.attempts < ${MAX_BLUR_ATTEMPTS}
    ORDER BY p.created_at LIMIT ${limit}`);

  for (const photo of photos) {
    // One transaction per photo; SKIP LOCKED lets several workers share the queue.
    const outcome = await deps.db.transaction(async (tx) => {
      const [locked] = await tx.execute(sql`SELECT 1 FROM photo WHERE id = ${photo.id} AND blur_status = 'pending' FOR UPDATE SKIP LOCKED`);
      if (!locked) return 'skipped' as const;
      try {
        const size = await deps.storage.sizeOf(photo.original_key);
        if (size === null || size > MAX_PHOTO_BYTES) {
          await failPhoto(tx, photo, size === null ? 'missing' : 'too_large', 'too_large');
          return 'failed' as const;
        }
        const clean = await sanitise(await deps.storage.read(photo.original_key));
        const regions = await deps.detector.detect(clean);
        const blurred = regions.length > 0 ? await blurRegions(clean, regions) : clean;
        const publicKey = `public/${photo.id}.jpg`;
        await deps.storage.putPublic(publicKey, blurred, 'image/jpeg');
        const phash = await differenceHash(clean);

        // The AI parts help (category, duplicates) but never hold a report back.
        let insight: { category: string | null; confidence: number | null } = { category: null, confidence: null };
        let embedding: number[] | null = null;
        if (deps.ai) {
          try {
            const described = await deps.ai.describePhoto(await forAi(blurred));
            insight = described;
            if (described.caption) embedding = await deps.ai.embed(described.caption);
          } catch (error) {
            deps.log?.({ job: 'photo', photo: photo.id, ai: 'failed', error: error instanceof Error ? error.message : 'unknown' });
          }
        }
        await tx.execute(sql`
          UPDATE photo SET blur_status = 'done', public_key = ${publicKey}, phash = ${phash},
            embedding = ${embedding ? `[${embedding.join(',')}]` : null}::vector,
            ai_category = ${insight.category}, ai_confidence = ${insight.confidence},
            attempts = attempts + 1, last_error = NULL, processed_at = now()
          WHERE id = ${photo.id}`);
        // Publish once every photo of the report is blurred.
        await tx.execute(sql`
          UPDATE report SET status = 'open', updated_at = now()
          WHERE id = ${photo.report_id} AND status = 'processing'
            AND NOT EXISTS (SELECT 1 FROM photo WHERE report_id = ${photo.report_id} AND blur_status <> 'done')`);
        return 'done' as const;
      } catch (error) {
        if (error instanceof BlurUnavailable) return 'waiting' as const;
        const message = error instanceof Error ? error.message : 'unknown';
        if (photo.attempts + 1 >= MAX_BLUR_ATTEMPTS) {
          await failPhoto(tx, photo, message, 'blur_failed');
          return 'failed' as const;
        }
        await tx.execute(sql`UPDATE photo SET attempts = attempts + 1, last_error = ${message.slice(0, 500)} WHERE id = ${photo.id}`);
        return 'retry' as const;
      }
    });
    if (outcome === 'done') result.done++;
    else if (outcome === 'failed') result.failed++;
    else if (outcome === 'waiting') result.waiting++;
  }
  return result;
}

/** Gives up on a photo: the report waits in moderation and is never published unblurred (US-31). */
async function failPhoto(tx: Parameters<Parameters<Db['transaction']>[0]>[0], photo: PendingPhoto, error: string, reason: 'blur_failed' | 'too_large') {
  await tx.execute(sql`
    UPDATE photo SET blur_status = 'failed', failure_reason = ${reason}, last_error = ${error.slice(0, 500)}, attempts = attempts + 1
    WHERE id = ${photo.id}`);
  await tx.execute(sql`UPDATE report SET status = 'in_moderation', updated_at = now() WHERE id = ${photo.report_id} AND status = 'processing'`);
}
