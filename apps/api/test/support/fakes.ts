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

/** Every presigned key counts as uploaded, unless the test removes it from `uploaded`. */
export class FakePhotoStorage implements PhotoStorage {
  readonly uploaded = new Set<string>();

  async presignUpload(key: string, _contentType: string) {
    this.uploaded.add(key);
    return { url: `https://storage.test/private/${key}?signature=test`, expiresAt: new Date(Date.now() + 600_000) };
  }

  async exists(key: string) {
    return this.uploaded.has(key);
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
