// Background worker (pg-boss schedules, ENG-02). Run: pnpm --filter api worker
//   every minute:          process new photos; deliver notifications; recompute scores marked dirty
//   every hour:            recompute every active report's score (the score decays with age)
//   Monday 06:00 (Berlin): write the weekly briefings (US-53)
//   Monday 07:00 to 11:45: email them to tenant admins, retrying failures every 15 minutes (US-56)
// Reads the same configuration as the API (.env).
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { runBriefings, sendBriefingEmails } from './analysis/briefing.js';
import { aiFromConfig, loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { smtpMailer } from './mail/mailer.js';
import { deliverPendingNotifications } from './notifications/deliver.js';
import { expoPushSender } from './notifications/push.js';
import { detectorFromConfig } from './photos/blur.js';
import { processPendingPhotos } from './photos/process.js';
import { recomputeScores } from './scoring/recompute.js';
import { s3PhotoStorage } from './storage/photos.js';

const config = loadConfig();
// Optional: Expo access token when "enhanced push security" is turned on for the project.
const expoToken = z.string().optional().parse(process.env.EXPO_ACCESS_TOKEN);
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

const db = createDb(config.DATABASE_URL, { max: 3 });
const mailer = smtpMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, from: config.MAIL_FROM });
const webBaseUrl = config.WEB_BASE_URL.replace(/\/$/, '');
const ai = aiFromConfig(config, (entry) => log({ ai: entry }));
const storage = s3PhotoStorage({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  accessKeyId: config.S3_ACCESS_KEY,
  secretAccessKey: config.S3_SECRET_KEY,
  bucket: config.S3_BUCKET_PRIVATE,
  publicBucket: config.S3_BUCKET_PUBLIC,
});
const detector = detectorFromConfig(config.BLUR_DETECTOR);
const push = expoPushSender({ accessToken: expoToken });

const boss = new PgBoss(config.DATABASE_URL);
boss.on('error', (error) => console.error('pg-boss:', error.message));
await boss.start();

async function every(name: string, cron: string, job: () => Promise<unknown>, options: { tz?: string; missed?: 'skip' | 'once' } = {}) {
  await boss.createQueue(name);
  await boss.schedule(name, cron, null, options);
  await boss.work(name, async () => {
    const result = await job();
    if (result) log({ job: name, result });
  });
}

const berlin = { tz: 'Europe/Berlin' } as const;
await every('process-photos', '* * * * *', () => processPendingPhotos({ db, storage, detector, ai, log }));
await every('deliver-notifications', '* * * * *', () => deliverPendingNotifications({ db, mailer, push, webBaseUrl }));
await every('recompute-scores', '* * * * *', () => recomputeScores(db));
await every('recompute-all-scores', '0 * * * *', () => recomputeScores(db, { all: true, limit: 100_000 }));
// A worker that was down at 06:00 still writes the briefings once when it comes back.
await every('write-briefings', '0 6 * * 1', () => runBriefings({ db, ai, log }, new Date()), { ...berlin, missed: 'once' });
await every('send-briefings', '0,15,30,45 7-11 * * 1', () => sendBriefingEmails({ db, mailer, webBaseUrl }, new Date()), { ...berlin, missed: 'once' });
log({ worker: 'started', blur: config.BLUR_DETECTOR, ai: Boolean(ai) });
