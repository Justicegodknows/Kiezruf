import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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

  it('sends the public-read ACL with public copies only when configured', async () => {
    const seen: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      seen.push(request.headers['x-amz-acl'] as string | undefined);
      request.resume().on('end', () => response.writeHead(200).end());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const base = { endpoint, region: 'fr-par', accessKeyId: 'test', secretAccessKey: 'test-secret', bucket: 'p', publicBucket: 'q' };
    try {
      await s3PhotoStorage({ ...base, publicObjectAcl: 'public-read' }).putPublic('public/x.jpg', Buffer.from('x'), 'image/jpeg');
      await s3PhotoStorage(base).putPublic('public/y.jpg', Buffer.from('y'), 'image/jpeg');
      await s3PhotoStorage({ ...base, publicObjectAcl: 'public-read' }).putOriginal('originals/z.jpg', Buffer.from('z'), 'image/jpeg');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    expect(seen).toEqual(['public-read', undefined, undefined]);
  });

  it('refuses to publish without a public bucket', async () => {
    await expect(storage.putPublic('public/x.jpg', Buffer.from('x'), 'image/jpeg')).rejects.toThrow('No public bucket configured');
  });
});
