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
