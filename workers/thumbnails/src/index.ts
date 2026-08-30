// @sonic-gameworld/worker-thumbnails — BullMQ worker for queue 'asset.thumbnail'.
//
// Consumes the hand-off enqueued by worker-asset-processing's THUMBNAILS pipeline stage, renders
// a marketplace-grid PNG card (name/category/poly count) via sharp (see card.ts), uploads it to
// object storage, and writes the result back onto Asset.thumbnailUrl. See renderer.ts for the
// documented (not-yet-implemented) GPU 3D-preview render path this is factored to accept later.
import { PrismaClient } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { QUEUE_NAMES } from '@sonic-gameworld/world-schema';
import { renderCardPng } from './card.js';
import { loadConfig, type ThumbnailsConfig } from './env.js';
import { createLogger, type Logger } from './logger.js';
import { resolveRenderer } from './renderer.js';
import { createStorage, type Storage } from './storage.js';
import type { PrismaLike, ThumbnailJobPayload, ThumbnailResult } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-thumbnails';
export const QUEUE_NAME = QUEUE_NAMES.ASSET_THUMBNAIL;

export interface WorkerHandles {
  worker: Worker<ThumbnailJobPayload>;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface ProcessDeps {
  prisma: PrismaLike;
  storage: Storage;
  config: ThumbnailsConfig;
  log?: Logger;
}

function thumbnailKey(assetId: string, versionId: string): string {
  return `assets/${assetId}/versions/${versionId}/thumbnail.png`;
}

/** Renders + uploads + persists one thumbnail. Exported for tests to drive directly against
 * fakes without BullMQ/Redis. GPU render is attempted first (when configured/available); any
 * failure — including "not configured" — falls back to the sharp card renderer, which never
 * fails on a well-formed payload. */
export async function processThumbnailJob(job: ThumbnailJobPayload, deps: ProcessDeps): Promise<ThumbnailResult> {
  const log = deps.log ?? createLogger(WORKER_NAME, deps.config.logLevel);
  const size = deps.config.cardSizePx;

  let png: Buffer;
  let method: ThumbnailResult['method'] = 'CARD';
  const gpuRenderer = await resolveRenderer();
  if (gpuRenderer && job.sourceKey) {
    try {
      const rendered = await gpuRenderer.render({ modelBytes: Buffer.alloc(0), widthPx: size, heightPx: size, camera: 'AUTO', background: 'STUDIO_GRADIENT' });
      png = rendered.png;
      method = 'GPU_RENDER';
    } catch (err) {
      log.warn({ err }, 'GPU renderer failed, falling back to card renderer');
      png = await renderCardPng({ name: job.name, category: job.category, polyCount: job.polyCount, sizePx: size });
    }
  } else {
    png = await renderCardPng({ name: job.name, category: job.category, polyCount: job.polyCount, sizePx: size });
  }

  const key = thumbnailKey(job.assetId, job.versionId);
  const put = await deps.storage.putObject(key, png, 'image/png');
  await deps.prisma.asset.update({ where: { id: job.assetId }, data: { thumbnailUrl: put.url } });

  return { key: put.key, url: put.url, sizeBytes: put.sizeBytes, widthPx: size, heightPx: size, method };
}

export function startWorker(config: ThumbnailsConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });
  const storage = createStorage(config);

  const worker = new Worker<ThumbnailJobPayload>(
    QUEUE_NAME,
    async (job: Job<ThumbnailJobPayload>) => processThumbnailJob(job.data, { prisma, storage, config, log }),
    { connection, concurrency: config.concurrency },
  );

  worker.on('completed', (job, result: ThumbnailResult) => log.info({ jobId: job.id, assetId: job.data.assetId, url: result.url, method: result.method }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, assetId: job?.data.assetId, err: err.message }, 'job:failed'));

  log.info({ queue: QUEUE_NAME, concurrency: config.concurrency }, 'worker started');

  return {
    worker,
    connection,
    bus,
    async close() {
      await worker.close();
      await bus.close();
      connection.disconnect();
    },
  };
}

// Only boot the real worker when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const handles = startWorker();
  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[${WORKER_NAME}] received ${signal}, shutting down...`);
    await handles.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// New Queue instance builder for services/api or other workers that need to enqueue onto
// `asset.thumbnail` without importing bullmq wiring details.
export function createThumbnailQueue(connection: Redis): Queue<ThumbnailJobPayload> {
  return new Queue<ThumbnailJobPayload>(QUEUE_NAME, { connection });
}

export type { ThumbnailJobPayload, ThumbnailResult, PrismaLike } from './types.js';
export { renderCardPng, formatPolyCount } from './card.js';
export type { Renderer, RenderSceneOptions, RenderSceneResult } from './renderer.js';
