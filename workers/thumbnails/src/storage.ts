// Minimal S3-compatible object store: writes the rendered PNG card (and, in future, whatever a
// GPU Renderer produces) to object storage. A `memory` driver backs unit tests and local dev
// without MinIO/S3 running.
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ThumbnailsConfig } from './env.js';

export interface PutResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface Storage {
  putObject(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  publicUrl(key: string): string;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly base: string | undefined;

  constructor(config: ThumbnailsConfig) {
    this.client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      credentials:
        config.s3.accessKeyId && config.s3.secretAccessKey
          ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey }
          : undefined,
    });
    this.bucket = config.s3.bucket;
    this.base = config.s3.publicUrlBase;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<PutResult> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    return { key, url: this.publicUrl(key), sizeBytes: body.byteLength };
  }

  publicUrl(key: string): string {
    if (this.base) return `${this.base.replace(/\/$/, '')}/${key}`;
    return `s3://${this.bucket}/${key}`;
  }
}

/** In-memory backend for tests and local dev without object storage running. */
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<PutResult> {
    this.objects.set(key, body);
    return { key, url: this.publicUrl(key), sizeBytes: body.byteLength };
  }

  publicUrl(key: string): string {
    return `memory://${key}`;
  }
}

export function createStorage(config: ThumbnailsConfig): Storage {
  return config.storageDriver === 'memory' ? new MemoryStorage() : new S3Storage(config);
}
