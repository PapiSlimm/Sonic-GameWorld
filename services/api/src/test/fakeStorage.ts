// In-memory `StorageService` test double (mirrors fakeQueues.ts's role for `Queues`): returns
// deterministic fake presigned URLs instead of touching the real AWS SDK / network, which isn't
// available (and is occasionally flaky when it falls back to the async credential provider
// chain) in the test environment. See src/storage.ts's `getStorage`/`setStorageForTests`.
import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import type { PresignedUpload, StorageService } from '../storage.js';

export interface FakeStorage extends StorageService {
  /** Every `deleteObject` call, for assertions. */
  deleted: string[];
}

function buildKey(fileName: string, prefix = 'uploads'): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeName.includes('.') ? safeName.slice(safeName.lastIndexOf('.')) : '';
  return `${prefix}/${randomUUID()}${ext}`;
}

/** Never actually constructed (no `.send()` ever called on it) — only present so `FakeStorage`
 * structurally satisfies `StorageService.client: S3Client` without instantiating a real one, and
 * with zero AWS SDK config resolution (region, credential chain, ...) at construction time. */
const NOOP_CLIENT = Object.create(S3Client.prototype) as S3Client;

export function createFakeStorage(): FakeStorage {
  const deleted: string[] = [];

  return {
    bucket: 'fake-test-bucket',
    client: NOOP_CLIENT,
    buildKey,
    deleted,
    async getUploadUrl(input): Promise<PresignedUpload> {
      const fileKey = buildKey(input.fileName, input.prefix);
      return {
        uploadUrl: `https://fake-test-bucket.storage.test/${fileKey}?X-Fake-Presigned=1`,
        method: 'PUT',
        headers: { 'Content-Type': input.contentType },
        fileKey,
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        maxSizeBytes: 5 * 1024 * 1024 * 1024,
      };
    },
    async getDownloadUrl(fileKey: string): Promise<string> {
      return `https://fake-test-bucket.storage.test/${fileKey}?X-Fake-Presigned=1`;
    },
    async deleteObject(fileKey: string): Promise<void> {
      deleted.push(fileKey);
    },
    publicUrl(): string | undefined {
      return undefined;
    },
  };
}
