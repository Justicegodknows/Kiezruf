// Runtime configuration from environment variables. See .env.example.
import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  // Key for hashing one-time codes. At least 32 characters; generate with `openssl rand -base64 48`.
  AUTH_SECRET: z.string().min(32),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int(),
  MAIL_FROM: z.string().min(1),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET_PRIVATE: z.string().min(1),
  // Base URL under which blurred public copies are served, e.g. http://localhost:9000/photos-public
  PUBLIC_PHOTO_BASE_URL: z.url(),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing configuration: ${fields}`);
  }
  return parsed.data;
}
