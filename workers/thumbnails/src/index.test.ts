import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';
import { processThumbnailJob } from './index.js';
import { MemoryStorage } from './storage.js';
import type { PrismaLike, ThumbnailJobPayload } from './types.js';

function fakePrisma(): PrismaLike & { updates: Record<string, unknown>[] } {
  const updates: Record<string, unknown>[] = [];
  return {
    updates,
    asset: {
      async findUnique() {
        return { id: 'asset-1', name: 'Cyber Katana' };
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const record = { id: where.id, ...data };
        updates.push(record);
        return record;
      },
    },
  };
}

describe('processThumbnailJob', () => {
  it('renders a PNG card, uploads it, and updates Asset.thumbnailUrl', async () => {
    const prisma = fakePrisma();
    const storage = new MemoryStorage();
    const config = loadConfig({ STORAGE_DRIVER: 'memory' } as NodeJS.ProcessEnv);

    const job: ThumbnailJobPayload = { assetId: 'asset-1', versionId: 'version-1', name: 'Cyber Katana', category: 'MODEL', polyCount: 8200 };
    const result = await processThumbnailJob(job, { prisma, storage, config });

    expect(result.method).toBe('CARD');
    expect(result.key).toBe('assets/asset-1/versions/version-1/thumbnail.png');
    expect(storage.objects.has(result.key)).toBe(true);

    const stored = storage.objects.get(result.key)!;
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(config.cardSizePx);

    expect(prisma.updates).toEqual([{ id: 'asset-1', thumbnailUrl: result.url }]);
  });

  it('is idempotent: re-running for the same asset/version overwrites the same key', async () => {
    const prisma = fakePrisma();
    const storage = new MemoryStorage();
    const config = loadConfig({ STORAGE_DRIVER: 'memory' } as NodeJS.ProcessEnv);
    const job: ThumbnailJobPayload = { assetId: 'asset-1', versionId: 'version-1', name: 'Cyber Katana', category: 'MODEL' };

    const first = await processThumbnailJob(job, { prisma, storage, config });
    const second = await processThumbnailJob(job, { prisma, storage, config });

    expect(first.key).toBe(second.key);
    expect(storage.objects.size).toBe(1);
  });
});
