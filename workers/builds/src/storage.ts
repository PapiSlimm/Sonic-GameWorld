import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { BuildsConfig } from './env.js';

export interface PutResult {
  key: string;
  url: string;
  sizeBytes: number;
}

export interface Storage {
  putObject(key: string, body: Buffer, contentType: string): Promise<PutResult>;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly base: string | undefined;

  constructor(config: BuildsConfig) {
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
    const url = this.base ? `${this.base.replace(/\/$/, '')}/${key}` : `s3://${this.bucket}/${key}`;
    return { key, url, sizeBytes: body.byteLength };
  }
}

export class MemoryStorage implements Storage {
  readonly objects = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer): Promise<PutResult> {
    this.objects.set(key, body);
    return { key, url: `memory://${key}`, sizeBytes: body.byteLength };
  }
}

export function createStorage(config: BuildsConfig): Storage {
  return config.storageDriver === 'memory' ? new MemoryStorage() : new S3Storage(config);
}
