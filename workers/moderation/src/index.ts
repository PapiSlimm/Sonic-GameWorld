// @sonic-gameworld/worker-moderation — BullMQ worker for queue 'moderation.scan'.
//
// Runs the moderation pipeline (CONTRACTS.md §13): MALWARE -> AI_SAFETY -> LICENSE ->
// CONTENT_POLICY -> HUMAN_REVIEW (when needed) -> PUBLISH. Every stage is a small, independently
// testable `ModerationStage { name, run(ctx) }` (see src/stages/*.ts); this file only wires up
// infrastructure and drives the BullMQ Worker loop.
import { PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { QUEUE_NAMES } from '@sonic-gameworld/world-schema';
import { loadConfig, type ModerationConfig } from './env.js';
import { createLogger } from './logger.js';
import { runModerationPipeline } from './pipeline.js';
import { MODERATION_PIPELINE } from './stages/index.js';
import { createStorage, type Storage } from './storage.js';
import type { ModerationJobPayload, ModerationPipelineContext, ModerationRunResult, PrismaLike } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-moderation';
export const QUEUE_NAME = QUEUE_NAMES.MODERATION_SCAN;

export interface WorkerHandles {
  worker: Worker<ModerationJobPayload>;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface BuildDeps {
  prisma: PrismaLike;
  bus: EventBus;
  storage: Storage;
  config: ModerationConfig;
}

/** Builds a fully-formed ModerationPipelineContext for one job. Exported for tests that want to
 * drive the pipeline directly against fakes without spinning up BullMQ/Redis. */
export function buildContext(job: ModerationJobPayload, deps: BuildDeps): ModerationPipelineContext {
  return {
    job,
    prisma: deps.prisma,
    bus: deps.bus,
    storage: deps.storage,
    log: createLogger(WORKER_NAME, deps.config.logLevel),
    anthropicApiKey: deps.config.anthropicApiKey,
    requireHumanReviewForLowSeverity: deps.config.requireHumanReviewForLowSeverity,
    data: {},
  };
}

export async function processJob(job: ModerationJobPayload, deps: BuildDeps): Promise<ModerationRunResult> {
  const ctx = buildContext(job, deps);
  return runModerationPipeline(ctx, MODERATION_PIPELINE, job.resumeFromIndex ?? 0);
}

export function startWorker(config: ModerationConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });
  const storage = createStorage(config);

  const worker = new Worker<ModerationJobPayload>(
    QUEUE_NAME,
    async (job: Job<ModerationJobPayload>) => {
      const result = await processJob(job.data, { prisma, bus, storage, config });
      if (result.outcome === 'FAILED') {
        throw new Error(`Moderation pipeline failed at ${result.failedAt}: ${result.records[result.records.length - 1]?.error ?? 'unknown error'}`);
      }
      return result;
    },
    { connection, concurrency: config.concurrency },
  );

  worker.on('completed', (job) => log.info({ jobId: job.id, refKind: job.data.refKind, refId: job.data.refId }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, refId: job?.data.refId, err: err.message }, 'job:failed'));

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

export type { ModerationJobPayload, ModerationRunResult, PrismaLike, ModerationPipelineContext } from './types.js';
export { MODERATION_PIPELINE } from './stages/index.js';
export { scanTextSafetyHeuristics, resolveSafetyProvider } from './textPolicy.js';
export { scanContentPolicy } from './contentPolicy.js';
