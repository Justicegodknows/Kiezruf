// In-memory stand-ins for email and photo storage, shared by unit, integration and Gherkin tests.
import type { Mailer, MailMessage } from '../../src/mail/mailer.js';
import type { PhotoStorage } from '../../src/storage/photos.js';

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage) {
    this.sent.push(message);
  }

  /** The 6-digit code in the latest mail to `email`. */
  lastCodeFor(email: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to.toLowerCase() === email.toLowerCase());
    const code = mail && /\b(\d{6})\b/.exec(mail.text)?.[1];
    if (!code) throw new Error(`No code was mailed to ${email}`);
    return code;
  }
}

/** Every presigned key counts as uploaded, unless the test removes it from `uploaded`. Bytes live in `objects`. */
export class FakePhotoStorage implements PhotoStorage {
  readonly uploaded = new Set<string>();
  readonly objects = new Map<string, Buffer>();
  readonly publicObjects = new Map<string, Buffer>();

  async presignUpload(key: string, _contentType: string) {
    this.uploaded.add(key);
    return { url: `https://storage.test/private/${key}?signature=test`, expiresAt: new Date(Date.now() + 600_000) };
  }

  async exists(key: string) {
    return this.uploaded.has(key) || this.objects.has(key);
  }

  async sizeOf(key: string) {
    if (this.objects.has(key)) return this.objects.get(key)!.length;
    return this.uploaded.has(key) ? 0 : null;
  }

  async read(key: string) {
    const body = this.objects.get(key);
    if (!body) throw new Error(`No object ${key}`);
    return body;
  }

  async putPublic(key: string, body: Buffer, _contentType: string) {
    this.publicObjects.set(key, body);
  }

  async putOriginal(key: string, body: Buffer, _contentType: string) {
    this.objects.set(key, body);
  }

  async presignDownload(key: string) {
    return `https://storage.test/private/${key}?signature=download`;
  }
}

import type { PushMessage, PushResult, PushSender } from '../../src/notifications/push.js';

/** Records push messages. Tokens in `unregistered` answer DeviceNotRegistered; `failNext` makes the next send fail. */
export class FakePushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  readonly unregistered = new Set<string>();
  failNext = false;

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    if (this.failNext) {
      this.failNext = false;
      return messages.map(() => ({ ok: false, unregistered: false, error: 'Expo push answered 503' }));
    }
    return messages.map((m) => {
      if (this.unregistered.has(m.to)) return { ok: false, unregistered: true, error: 'DeviceNotRegistered' };
      this.sent.push(m);
      return { ok: true };
    });
  }
}

import sharp from 'sharp';
import type { AiProvider, PhotoInsight } from '../../src/ai/provider.js';
import type { BlurDetector } from '../../src/photos/blur.js';
import type { Region } from '../../src/photos/image.js';

/**
 * A stand-in for vlincta.com. Photos get `insight`; embeddings are a small vector derived from the caption, so equal
 * captions are identical vectors. The briefing answer comes from `briefingAnswer`, which by default cites the first
 * reports of the input. Every briefing input is kept, to check what would have been sent.
 */
export class FakeAiProvider implements AiProvider {
  readonly models = { chat: 'fake-chat', vision: 'fake-vision', embedding: 'fake-embedding' };
  insight: PhotoInsight | Error = { category: 'pothole', confidence: 0.92, caption: 'A deep pothole in the road.' };
  delayMs = 0;
  readonly briefingInputs: unknown[] = [];
  briefingAnswer: (input: { reports: { publicId: string }[] }) => unknown = (input) => ({
    items: input.reports.slice(0, 7).map((r, i) => ({
      level: 'High',
      kind: i === 0 ? 'Urgent' : 'Watch',
      headline: `Punkt ${i + 1}`,
      text: `Siehe ${r.publicId}.`,
      citations: [r.publicId],
    })),
  });

  async describePhoto(_jpeg: Buffer, options: { timeoutMs?: number } = {}) {
    if (this.delayMs) {
      if (options.timeoutMs !== undefined && this.delayMs > options.timeoutMs) {
        await new Promise((r) => setTimeout(r, options.timeoutMs));
        throw new Error('timeout');
      }
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.insight instanceof Error) throw this.insight;
    return this.insight;
  }

  async embed(text: string) {
    const v = Array.from({ length: 8 }, (_, i) => Math.sin((text.length + 1) * (i + 1)) + (text.charCodeAt(i % text.length) || 0) / 1000);
    return v;
  }

  async briefing(input: unknown) {
    this.briefingInputs.push(input);
    return this.briefingAnswer(input as { reports: { publicId: string }[] });
  }
}

/** Finds the regions it was told to, or fails as often as told to. */
export class FakeDetector implements BlurDetector {
  regions: Region[] = [];
  failures = 0;
  calls = 0;

  async detect() {
    this.calls++;
    if (this.failures > 0) {
      this.failures--;
      throw new Error('blur service unavailable');
    }
    return this.regions;
  }
}

/** Where the test photo's "face" and "licence plate" are, as fractions of the image. */
export const FACE: Region = { x: 0.1, y: 0.1, width: 0.25, height: 0.35 };
export const PLATE: Region = { x: 0.55, y: 0.65, width: 0.35, height: 0.15 };

/**
 * A 400 × 300 JPEG with EXIF, grey background and two fine checkerboards standing in for a face and a licence plate.
 * Blurring them flattens their detail, which the tests measure.
 */
export async function testPhoto(): Promise<Buffer> {
  const width = 400;
  const height = 300;
  const pixels = Buffer.alloc(width * height * 3, 128);
  for (const r of [FACE, PLATE]) {
    for (let y = Math.floor(r.y * height); y < (r.y + r.height) * height; y++) {
      for (let x = Math.floor(r.x * width); x < (r.x + r.width) * width; x++) {
        const v = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 255 : 0;
        pixels.fill(v, (y * width + x) * 3, (y * width + x) * 3 + 3);
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Kiezruf', Copyright: 'citizen@example.org' } })
    .toBuffer();
}

/** Standard deviation of the grey values inside a region: high for a checkerboard, near 0 once blurred. */
export async function regionDetail(jpeg: Buffer, r: Region): Promise<number> {
  const { width = 0, height = 0 } = await sharp(jpeg).metadata();
  const inset = 0.15; // stay clear of the edges, where blur meets the background
  const left = Math.floor((r.x + r.width * inset) * width);
  const top = Math.floor((r.y + r.height * inset) * height);
  const w = Math.floor(r.width * (1 - 2 * inset) * width);
  const h = Math.floor(r.height * (1 - 2 * inset) * height);
  const { channels } = await sharp(jpeg).extract({ left, top, width: w, height: h }).greyscale().stats();
  return channels[0]!.stdev;
}
