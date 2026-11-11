import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Private photo originals (US-16). Clients upload straight to the bucket with a presigned URL. */
export interface PhotoStorage {
  presignUpload(key: string, contentType: string): Promise<{ url: string; expiresAt: Date }>;
  exists(key: string): Promise<boolean>;
  /** A short-lived link to an original, for staff only (US-31: originals are never public). */
  presignDownload(key: string): Promise<string>;
}

const UPLOAD_URL_SECONDS = 10 * 60;
const DOWNLOAD_URL_SECONDS = 5 * 60;

export function s3PhotoStorage(options: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): PhotoStorage {
  const client = new S3Client({
    endpoint: options.endpoint,
    region: options.region,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    forcePathStyle: true,
  });
  return {
    async presignUpload(key, contentType) {
      const command = new PutObjectCommand({ Bucket: options.bucket, Key: key, ContentType: contentType });
      const url = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_SECONDS });
      return { url, expiresAt: new Date(Date.now() + UPLOAD_URL_SECONDS * 1000) };
    },
    async presignDownload(key) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: options.bucket, Key: key }), { expiresIn: DOWNLOAD_URL_SECONDS });
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }));
        return true;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
        throw error;
      }
    },
  };
}
