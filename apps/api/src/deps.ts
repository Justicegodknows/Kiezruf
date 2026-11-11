import type { Db } from './db/client.js';
import type { Mailer } from './mail/mailer.js';
import type { PhotoStorage } from './storage/photos.js';

/** Everything the API talks to. Tests pass fakes for mail and storage and a real database. */
export interface AppDeps {
  db: Db;
  mailer: Mailer;
  storage: PhotoStorage;
  /** Key for hashing one-time codes (AUTH_SECRET). */
  authSecret: string;
  /** Base URL of the public bucket with blurred photos. */
  publicPhotoBaseUrl: string;
  /** Base URL of the web app, for links in invite and forwarding emails. */
  webBaseUrl: string;
  /** Current time. Tests and Gherkin scenarios fix it; defaults to the system clock. */
  clock?: () => Date;
  /** Per-IP and per-account request limits. On by default; integration tests turn them off. */
  rateLimits?: boolean;
}
