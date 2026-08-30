// Minimal S3-compatible object store, used only by the MALWARE stage to fetch a file's bytes when
// a job carries `content.fileKey` (e.g. a user-uploaded avatar, a product gallery image outside
// the asset pipeline). Most moderation jobs are pure text and never touch storage.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ModerationConfig } from './env.js';

export interface Storage {
  getObject(key: string): Promise<Buffer>;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array) return Buffer.from(body);
  const chunks: Buffer[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ModerationConfig) {
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
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return streamToBuffer(res.Body);
  }
}

export class MemoryStorage implements Storage {
  readonly objects = new Map<string, Buffer>();
  async getObject(key: string): Promise<Buffer> {
    const buf = this.objects.get(key);
    if (!buf) throw new Error(`MemoryStorage: object not found: ${key}`);
    return buf;
  }
  seed(key: string, body: Buffer): void {
    this.objects.set(key, body);
  }
}

export function createStorage(config: ModerationConfig): Storage {
  return config.storageDriver === 'memory' ? new MemoryStorage() : new S3Storage(config);
}
