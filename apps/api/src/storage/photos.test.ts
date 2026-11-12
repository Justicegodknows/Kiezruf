import { describe, expect, it } from 'vitest';
import { s3PhotoStorage } from './photos.js';

// Presigning is computed locally (no request to the storage server), so it can be tested without MinIO.
const storage = s3PhotoStorage({
  endpoint: 'http://localhost:9000',
  region: 'eu-central-1',
  accessKeyId: 'test',
  secretAccessKey: 'test-secret',
  bucket: 'photos-private',
});

describe('s3PhotoStorage', () => {
  it('presigns an upload of one original for 10 minutes', async () => {
    const { url, expiresAt } = await storage.presignUpload('originals/a/b.jpg', 'image/jpeg');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('http://localhost:9000/photos-private/originals/a/b.jpg');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(590_000);
  });

  it('presigns a staff download of an original for 5 minutes', async () => {
    const parsed = new URL(await storage.presignDownload('originals/a/b.jpg'));
    expect(parsed.pathname).toBe('/photos-private/originals/a/b.jpg');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to publish without a public bucket', async () => {
    await expect(storage.putPublic('public/x.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow('No public bucket configured');
  });
});
