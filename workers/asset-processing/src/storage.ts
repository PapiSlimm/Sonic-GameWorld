// Minimal S3-compatible object store used by the pipeline to read the uploaded source file and
// write derived artifacts (LOD variants, optimized textures, previews). A `memory` driver backs
// unit tests and local dev without MinIO/S3 running.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AssetProcessingConfig } from './env.js';

export interface PutResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface Storage {
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  publicUrl(key: string): string;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Real S3-compatible backend (AWS S3, MinIO, R2, GCS interop-mode). */
export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly base: string | undefined;

  constructor(config: AssetProcessingConfig) {
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

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return streamToBuffer(res.Body);
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

  async getObject(key: string): Promise<Buffer> {
    const buf = this.objects.get(key);
    if (!buf) throw new Error(`MemoryStorage: object not found: ${key}`);
    return buf;
  }

  async putObject(key: string, body: Buffer): Promise<PutResult> {
    this.objects.set(key, body);
    return { key, url: this.publicUrl(key), sizeBytes: body.byteLength };
  }

  publicUrl(key: string): string {
    return `memory://${key}`;
  }

  seed(key: string, body: Buffer): void {
    this.objects.set(key, body);
  }
}

export function createStorage(config: AssetProcessingConfig): Storage {
  return config.storageDriver === 'memory' ? new MemoryStorage() : new S3Storage(config);
}
