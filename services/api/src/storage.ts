// S3-compatible object storage: presigned uploads/downloads + delete. Works against real AWS S3
// or any S3-compatible endpoint (MinIO, R2, etc.) via config.s3.endpoint.
//
// Application code should go through `getStorage(config)` rather than calling
// `createStorageService` directly, so tests can swap in an in-memory fake via
// `setStorageForTests` (see src/test/fakeStorage.ts + src/test/helpers.ts) — mirrors the
// `getPrisma`/`setPrismaForTests` pattern in src/db.ts. This matters in practice, not just for
// style: with no static S3 credentials configured (the default in dev/test), the AWS SDK v3
// falls back to its default credential provider chain, which makes real async network attempts
// (IMDS, SSO, shared config) before giving up — slow and occasionally flaky in a
// network-restricted environment. Tests must never exercise that path.
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from './config.js';

export interface PresignedUpload {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  fileKey: string;
  expiresAt: string;
  maxSizeBytes: number;
}

export interface StorageService {
  bucket: string;
  client: S3Client;
  /** Build a unique object key under a prefix, preserving the original file extension. */
  buildKey(fileName: string, prefix?: string): string;
  /** Presigned PUT URL the client uploads directly to (bypassing the API for the file bytes). */
  getUploadUrl(input: { fileName: string; contentType: string; sizeBytes: number; prefix?: string }): Promise<PresignedUpload>;
  /** Presigned GET URL for a private object, or a public CDN URL when S3_PUBLIC_URL_BASE is set. */
  getDownloadUrl(fileKey: string): Promise<string>;
  deleteObject(fileKey: string): Promise<void>;
  publicUrl(fileKey: string): string | undefined;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5GB ceiling; per-plan quotas are enforced separately.

export function createStorageService(config: AppConfig): StorageService {
  const client = new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint,
    forcePathStyle: config.s3.forcePathStyle || Boolean(config.s3.endpoint),
    credentials:
      config.s3.accessKeyId && config.s3.secretAccessKey
        ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
        : undefined,
  });

  const bucket = config.s3.bucket;

  function buildKey(fileName: string, prefix = 'uploads'): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')) : '';
    return `${prefix}/${randomUUID()}${ext}`;
  }

  function publicUrl(fileKey: string): string | undefined {
    if (!config.s3.publicUrlBase) return undefined;
    const base = config.s3.publicUrlBase.endsWith('/') ? config.s3.publicUrlBase.slice(0, -1) : config.s3.publicUrlBase;
    return `${base}/${fileKey}`;
  }

  async function getUploadUrl(input: { fileName: string; contentType: string; sizeBytes: number; prefix?: string }): Promise<PresignedUpload> {
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`File too large: ${input.sizeBytes} bytes exceeds the ${MAX_UPLOAD_BYTES} byte ceiling`);
    }
    const fileKey = buildKey(input.fileName, input.prefix);
    const command = new PutObjectCommand({ Bucket: bucket, Key: fileKey, ContentType: input.contentType });
    const ttl = config.s3.uploadUrlTtlSeconds;
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: ttl });
    return {
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      fileKey,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      maxSizeBytes: MAX_UPLOAD_BYTES,
    };
  }

  async function getDownloadUrl(fileKey: string): Promise<string> {
    const direct = publicUrl(fileKey);
    if (direct) return direct;
    const command = new GetObjectCommand({ Bucket: bucket, Key: fileKey });
    return getSignedUrl(client, command, { expiresIn: config.s3.downloadUrlTtlSeconds });
  }

  async function deleteObject(fileKey: string): Promise<void> {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
  }

  return { bucket, client, buildKey, getUploadUrl, getDownloadUrl, deleteObject, publicUrl };
}

let cached: StorageService | undefined;
let testOverride: StorageService | undefined;

/** Process-wide singleton, lazily built on first access (mirrors `getPrisma()`/`getBus()`). */
export function getStorage(config: AppConfig): StorageService {
  if (testOverride) return testOverride;
  if (!cached) cached = createStorageService(config);
  return cached;
}

/** Test hook: inject a fake StorageService (see src/test/fakeStorage.ts) so tests never touch the
 * real AWS SDK / network. Call with `undefined` to clear the override. */
export function setStorageForTests(fake: StorageService | undefined): void {
  testOverride = fake;
}
