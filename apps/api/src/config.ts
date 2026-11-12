// Runtime configuration from environment variables. See .env.example.
import { z } from 'zod';
import { openAiCompatibleProvider, type AiCallLog, type AiProvider } from './ai/provider.js';

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
  S3_BUCKET_PUBLIC: z.string().min(1).default('photos-public'),
  // Base URL under which blurred public copies are served, e.g. http://localhost:9000/photos-public
  PUBLIC_PHOTO_BASE_URL: z.url(),
  // The web app (citizen pages and console), for links in emails.
  WEB_BASE_URL: z.url(),
  // AI provider (vlincta.com, D-13, D-15), OpenAI-compatible. Empty base URL: no AI (suggestions answer null,
  // duplicates rank by distance, briefings fall back to the top reports).
  AI_PROVIDER_BASE_URL: z.union([z.url(), z.literal('')]).default(''),
  AI_PROVIDER_API_KEY: z.string().default(''),
  AI_MODEL_CHAT: z.string().default(''),
  AI_MODEL_VISION: z.string().default(''),
  AI_MODEL_EMBEDDING: z.string().default(''),
  // Where to blur until vlincta's blur endpoint is known: "full" (whole photo) or "none" (photos wait).
  BLUR_DETECTOR: z.enum(['full', 'none']).default('none'),
  // Proxies whose X-Forwarded-For the API believes, e.g. the citizen web server: comma-separated IPs or CIDRs.
  // Empty: no proxy is trusted, and rate limits key on the connecting IP. Never trust every proxy: clients could
  // then fake their address to dodge the limits.
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

export type Config = z.infer<typeof Env>;

/** The AI provider for this config, or undefined when none is configured. */
export function aiFromConfig(config: Config, log?: (entry: AiCallLog) => void): AiProvider | undefined {
  if (!config.AI_PROVIDER_BASE_URL) return undefined;
  return openAiCompatibleProvider({
    baseUrl: config.AI_PROVIDER_BASE_URL,
    apiKey: config.AI_PROVIDER_API_KEY,
    chatModel: config.AI_MODEL_CHAT,
    visionModel: config.AI_MODEL_VISION,
    embeddingModel: config.AI_MODEL_EMBEDDING,
    log,
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing configuration: ${fields}`);
  }
  return parsed.data;
}
