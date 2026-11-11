import { buildApp } from './app.js';
import { createDb } from './db/client.js';
import { loadConfig } from './config.js';
import { smtpMailer } from './mail/mailer.js';
import { s3PhotoStorage } from './storage/photos.js';

const config = loadConfig();

const app = await buildApp(
  {
    db: createDb(config.DATABASE_URL),
    mailer: smtpMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, from: config.MAIL_FROM }),
    storage: s3PhotoStorage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
      bucket: config.S3_BUCKET_PRIVATE,
    }),
    authSecret: config.AUTH_SECRET,
    publicPhotoBaseUrl: config.PUBLIC_PHOTO_BASE_URL,
    webBaseUrl: config.WEB_BASE_URL.replace(/\/$/, ''),
  },
  // Never log request bodies or headers: they carry email addresses, codes and tokens.
  {
    logger: { redact: ['req.headers.authorization'] },
    ...(config.TRUST_PROXY.length > 0 ? { trustProxy: config.TRUST_PROXY } : {}),
  },
);

await app.listen({ port: config.PORT, host: '0.0.0.0' });
