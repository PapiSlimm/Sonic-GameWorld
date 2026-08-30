// @sonic-gameworld/worker-asset-processing — BullMQ worker for queue 'asset.process'.
//
// Runs the full asset ingestion pipeline (CONTRACTS.md §13): malware scan → validation →
// metadata extraction → license check → 3D validation → optimization → LOD generation → texture
// optimization → thumbnail hand-off → preview build → compatibility check → AI tagging →
// quality scoring → creator approval → marketplace listing. Every stage is a small, independently
// testable `Stage { name, run(ctx) }` (see src/stages/*.ts); this file only wires up
// infrastructure (Redis, Prisma, the event bus, object storage) and drives the BullMQ Worker loop.
import { PrismaClient } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { QUEUE_NAMES } from '@sonic-gameworld/world-schema';
import { loadConfig, type AssetProcessingConfig } from './env.js';
import { createLogger } from './logger.js';
import { runPipeline } from './pipeline.js';
import { createStorage, type Storage } from './storage.js';
import { PIPELINE } from './stages/index.js';
import type { JobPayload, PipelineContext, PrismaLike } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-asset-processing';
export const QUEUE_NAME = QUEUE_NAMES.ASSET_PROCESS;

export interface WorkerHandles {
  worker: Worker<JobPayload>;
  thumbnailQueue: Queue;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface BuildDeps {
  prisma: PrismaLike;
  bus: EventBus;
  storage: Storage;
  thumbnailQueue: Pick<Queue, 'add'>;
  config: AssetProcessingConfig;
}

/** Builds a fully-formed PipelineContext for one job. Exported for tests that want to drive the
 * pipeline directly against fakes without spinning up BullMQ/Redis. */
export function buildContext(job: JobPayload, deps: BuildDeps): PipelineContext {
  return {
    job,
    prisma: deps.prisma,
    bus: deps.bus,
    storage: deps.storage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thumbnailQueue: deps.thumbnailQueue as any,
    log: createLogger(WORKER_NAME, deps.config.logLevel),
    autoApproveAssets: deps.config.autoApproveAssets,
    data: { kind: 'UNKNOWN', ext: null },
  };
}

export async function processJob(job: JobPayload, deps: BuildDeps) {
  const ctx = buildContext(job, deps);
  return runPipeline(ctx, PIPELINE, job.resumeFromIndex ?? 0);
}

export function startWorker(config: AssetProcessingConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });
  const storage = createStorage(config);
  const thumbnailQueue = new Queue(QUEUE_NAMES.ASSET_THUMBNAIL, { connection });

  const worker = new Worker<JobPayload>(
    QUEUE_NAME,
    async (job: Job<JobPayload>) => {
      const result = await processJob(job.data, { prisma, bus, storage, thumbnailQueue, config });
      if (result.outcome === 'FAILED') {
        throw new Error(`Pipeline failed at ${result.failedAt}: ${result.records[result.records.length - 1]?.error ?? 'unknown error'}`);
      }
      return result;
    },
    { connection, concurrency: config.concurrency },
  );

  worker.on('completed', (job) => log.info({ jobId: job.id, assetId: job.data.assetId }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, assetId: job?.data.assetId, err: err.message }, 'job:failed'));

  log.info({ queue: QUEUE_NAME, concurrency: config.concurrency }, 'worker started');

  return {
    worker,
    thumbnailQueue,
    connection,
    bus,
    async close() {
      await worker.close();
      await thumbnailQueue.close();
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
