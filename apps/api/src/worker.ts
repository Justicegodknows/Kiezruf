// Background worker (pg-boss schedules, ENG-02). Run: pnpm --filter api worker
//   every minute: deliver notifications; recompute scores marked dirty
//   every hour:   recompute every active report's score (the score decays with age)
// Later jobs (photo processing, scoring, the Monday briefing) are added here.
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { createDb } from './db/client.js';
import { smtpMailer } from './mail/mailer.js';
import { deliverPendingNotifications } from './notifications/deliver.js';
import { expoPushSender } from './notifications/push.js';
import { recomputeScores } from './scoring/recompute.js';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string().min(1),
  WEB_BASE_URL: z.url(),
  // Optional: Expo access token when "enhanced push security" is turned on for the project.
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid or missing configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
const config = parsed.data;

const deps = {
  db: createDb(config.DATABASE_URL, { max: 2 }),
  mailer: smtpMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, from: config.MAIL_FROM }),
  push: expoPushSender({ accessToken: config.EXPO_ACCESS_TOKEN }),
  webBaseUrl: config.WEB_BASE_URL.replace(/\/$/, ''),
};

const QUEUE = 'deliver-notifications';
const boss = new PgBoss(config.DATABASE_URL);
boss.on('error', (error) => console.error('pg-boss:', error.message));
await boss.start();
await boss.createQueue(QUEUE);
await boss.schedule(QUEUE, '* * * * *');
await boss.work(QUEUE, async () => {
  const { sent, failed } = await deliverPendingNotifications(deps);
  if (sent || failed) console.log(JSON.stringify({ job: QUEUE, sent, failed }));
});
const SCORES = 'recompute-scores';
const ALL_SCORES = 'recompute-all-scores';
await boss.createQueue(SCORES);
await boss.createQueue(ALL_SCORES);
await boss.schedule(SCORES, '* * * * *');
await boss.schedule(ALL_SCORES, '0 * * * *');
await boss.work(SCORES, async () => {
  const n = await recomputeScores(deps.db);
  if (n) console.log(JSON.stringify({ job: SCORES, recomputed: n }));
});
await boss.work(ALL_SCORES, async () => {
  const n = await recomputeScores(deps.db, { all: true, limit: 100_000 });
  console.log(JSON.stringify({ job: ALL_SCORES, recomputed: n }));
});
console.log('Worker started.');
