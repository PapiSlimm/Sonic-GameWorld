// @sonic-gameworld/worker-builds — BullMQ worker for queue 'build.compile'.
//
// Compiles a WorldDocument into a Web runtime bundle (JSON manifest + variant selection) and
// Unity/Unreal export packages (manifest + a generated C#/C++ loader stub from src/templates),
// zips each with archiver, uploads to storage, and records the result on GameVersion.buildRef.
import { PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEvent, createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { validateWorld, type EngineTarget, type WorldDocument } from '@sonic-gameworld/world-schema';
import { compileEnginePackage, variantCounts } from './compile.js';
import { loadConfig, type BuildsConfig } from './env.js';
import { createLogger, type Logger } from './logger.js';
import { createStorage, type Storage } from './storage.js';
import type { BuildArtifact, BuildFailure, BuildJobPayload, BuildResult, PrismaLike } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-builds';
export const QUEUE_NAME = 'build.compile';

export interface WorkerHandles {
  worker: Worker<BuildJobPayload>;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface ProcessDeps {
  prisma: PrismaLike;
  bus: EventBus;
  storage: Storage;
  config: BuildsConfig;
  log?: Logger;
}

function extension(engine: EngineTarget): string {
  return engine.toLowerCase();
}

async function resolveWorldDocument(job: BuildJobPayload, prisma: PrismaLike): Promise<WorldDocument> {
  if (job.worldDocument) return job.worldDocument;
  if (!job.worldVersionId) throw new Error('Job carries neither worldDocument nor worldVersionId — nothing to compile');
  const version = await prisma.worldVersion.findUnique({ where: { id: job.worldVersionId } });
  if (!version) throw new Error(`WorldVersion ${job.worldVersionId} not found`);
  const result = validateWorld(version.document);
  if (!result.ok || !result.document) {
    throw new Error(`WorldVersion ${job.worldVersionId} failed schema validation: ${result.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`);
  }
  return result.document;
}

/** Compiles every requested engine target for one job. A failure on one engine does not abort the
 * others — a broken Unreal export shouldn't block shipping the Web build — so `failures` can be
 * non-empty alongside a non-empty `artifacts`; `ok` is true only when every requested engine
 * succeeded. */
export async function processBuildJob(job: BuildJobPayload, deps: ProcessDeps): Promise<BuildResult> {
  const log = deps.log ?? createLogger(WORKER_NAME, deps.config.logLevel);
  const doc = await resolveWorldDocument(job, deps.prisma);

  const validation = validateWorld(doc);
  if (!validation.ok) {
    const message = `World document failed validation: ${validation.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`;
    return { ok: false, gameId: job.gameId, gameVersionId: job.gameVersionId, worldId: job.worldId, artifacts: [], failures: job.engines.map((engine) => ({ engine, error: message })) };
  }

  const artifacts: BuildArtifact[] = [];
  const failures: BuildFailure[] = [];

  for (const engine of job.engines) {
    try {
      const compiled = await compileEnginePackage(doc, engine);
      const key = `builds/${job.gameId}/${job.gameVersionId}/${extension(engine)}.zip`;
      const put = await deps.storage.putObject(key, compiled.buffer, 'application/zip');
      artifacts.push({ engine, key: put.key, url: put.url, sizeBytes: put.sizeBytes, entityCount: compiled.manifest.entities.length, variantCounts: variantCounts(compiled.manifest) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ engine, err: message }, 'engine build failed');
      failures.push({ engine, error: message });
    }
  }

  const buildRef = {
    builtAt: new Date().toISOString(),
    requestedBy: job.requestedBy ?? null,
    artifacts: artifacts.map((a) => ({ engine: a.engine, url: a.url, sizeBytes: a.sizeBytes, entityCount: a.entityCount, variantCounts: a.variantCounts })),
    failures,
  };
  await deps.prisma.gameVersion.update({ where: { id: job.gameVersionId }, data: { buildRef } });

  // 'BUILD_COMPILED' is not (yet) one of CONTRACTS.md §7's fixed EventType members — see this
  // package's README for the proposed addition. createEvent's generic-string overload supports
  // publishing it today without waiting on that contract change.
  await deps.bus.publish(
    createEvent({
      type: 'BUILD_COMPILED',
      payload: { gameId: job.gameId, gameVersionId: job.gameVersionId, worldId: job.worldId, engines: artifacts.map((a) => a.engine), failedEngines: failures.map((f) => f.engine) },
      actorId: job.requestedBy,
    }),
  );

  return { ok: failures.length === 0, gameId: job.gameId, gameVersionId: job.gameVersionId, worldId: job.worldId, artifacts, failures };
}

export function startWorker(config: BuildsConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });
  const storage = createStorage(config);

  const worker = new Worker<BuildJobPayload>(
    QUEUE_NAME,
    async (job: Job<BuildJobPayload>) => {
      const result = await processBuildJob(job.data, { prisma, bus, storage, config, log });
      if (!result.ok) throw new Error(`Build failed for engines: ${result.failures.map((f) => `${f.engine} (${f.error})`).join('; ')}`);
      return result;
    },
    { connection, concurrency: config.concurrency },
  );

  worker.on('completed', (job, result: BuildResult) => log.info({ jobId: job.id, gameId: job.data.gameId, engines: result.artifacts.map((a) => a.engine) }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, gameId: job?.data.gameId, err: err.message }, 'job:failed'));

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

export type { BuildJobPayload, BuildResult, BuildArtifact, BuildFailure, PrismaLike } from './types.js';
export { compileEnginePackage } from './compile.js';
export { compileManifest } from './manifest.js';
export { pickVariant } from './variant.js';
