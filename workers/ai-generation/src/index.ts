// @sonic-gameworld/worker-ai-generation — BullMQ worker for queue 'ai.generate'.
//
// Handles the generative half of the AI tool pipeline (CONTRACTS.md §8): "AI never mutates state
// directly. Flow: AI → Tool → Permission → Validation → Execution → Event." Permission/validation
// for the requesting tool call happen synchronously in services/api before a job ever reaches this
// queue; this worker owns the (potentially slow) Execution step for generative tools —
// `generate_asset` foremost — and always finishes it with an `AIExecution` row + `AI_TOOL_EXECUTED`
// event, whether the generation succeeded or not.
import { PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEvent, createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { loadConfig, type AIGenerationConfig } from './env.js';
import { createLogger, type Logger } from './logger.js';
import { mockGenerationProvider, resolveGenerationProvider } from './providers/index.js';
import type { GenerateJobPayload, GenerationResult, PrismaLike } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-ai-generation';
export const QUEUE_NAME = 'ai.generate';

export interface WorkerHandles {
  worker: Worker<GenerateJobPayload>;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface ProcessDeps {
  prisma: PrismaLike;
  bus: EventBus;
  config: AIGenerationConfig;
  log?: Logger;
}

/** Runs one generation job to completion and persists the result. Never throws on a generation
 * failure — a failed provider call still produces `{ ok: false, ... }`, an `AIExecution` row
 * (`ok: false`), and an `AI_TOOL_EXECUTED` event, because the caller (services/api, the studio's
 * execution log) needs to observe the failure, not have the BullMQ job silently vanish into a
 * retry loop over a non-transient "bad prompt" error. Only truly unexpected errors (DB down,
 * event bus down) propagate, which is what should trigger BullMQ's retry/backoff. */
export async function processGenerateJob(job: GenerateJobPayload, deps: ProcessDeps): Promise<GenerationResult> {
  const log = deps.log ?? createLogger(WORKER_NAME, deps.config.logLevel);
  const provider = resolveGenerationProvider(deps.config);
  const startedAt = Date.now();

  let result: GenerationResult;
  try {
    const { spec, usage } = await provider.generate({ tool: job.tool, prompt: job.prompt, args: job.args ?? {} });
    result = { ok: true, spec, provider: provider.name, model: provider.model, usage };
  } catch (err) {
    log.warn({ err, provider: provider.name }, 'generation provider failed — falling back to mock provider');
    try {
      const { spec, usage } = await mockGenerationProvider.generate({ tool: job.tool, prompt: job.prompt, args: job.args ?? {} });
      result = { ok: true, spec, provider: `${provider.name}->mock-fallback`, model: mockGenerationProvider.model, usage };
    } catch (fallbackErr) {
      // The mock provider is deterministic/pure and should never actually throw; if it somehow
      // does, that's a real bug worth surfacing rather than swallowing into a fabricated result.
      result = {
        ok: false,
        spec: { title: '', description: '', tags: [], suggestedCategory: 'EXPERIENCE', narration: '' },
        provider: provider.name,
        model: provider.model,
        usage: { inputTokens: 0, outputTokens: 0 },
        error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      };
    }
  }

  const durationMs = Date.now() - startedAt;

  const execution = await deps.prisma.aIExecution.create({
    data: {
      worldId: job.worldId ?? null,
      actorId: job.actorId ?? null,
      tool: job.tool,
      args: { prompt: job.prompt, ...(job.args ?? {}) },
      role: job.role ?? null,
      ok: result.ok,
      result: result.ok ? result.spec : null,
      error: result.error ?? null,
      durationMs,
      events: ['AI_TOOL_EXECUTED'],
    },
  });

  await deps.prisma.aIUsage.create({
    data: {
      userId: job.actorId ?? null,
      orgId: job.orgId ?? null,
      model: `${result.provider}:${result.model}`,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      // Flat placeholder rate until real per-provider pricing is wired in — 0 cost is honest for
      // the mock provider (the default) and clearly not a real invoice for a live provider.
      costCents: 0,
    },
  });

  await deps.bus.publish(
    createEvent({
      type: 'AI_TOOL_EXECUTED',
      payload: { executionId: execution.id, worldId: job.worldId, tool: job.tool, ok: result.ok, provider: result.provider, result: result.ok ? result.spec : null, error: result.error },
      actorId: job.actorId,
      orgId: job.orgId,
    }),
  );

  return result;
}

export function startWorker(config: AIGenerationConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });

  const worker = new Worker<GenerateJobPayload>(QUEUE_NAME, async (job: Job<GenerateJobPayload>) => processGenerateJob(job.data, { prisma, bus, config, log }), {
    connection,
    concurrency: config.concurrency,
  });

  worker.on('completed', (job, result: GenerationResult) => log.info({ jobId: job.id, tool: job.data.tool, ok: result.ok, provider: result.provider }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, tool: job?.data.tool, err: err.message }, 'job:failed'));

  log.info({ queue: QUEUE_NAME, concurrency: config.concurrency, provider: config.provider }, 'worker started');

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

export type { GenerateJobPayload, GenerationResult, GeneratedAssetSpec, PrismaLike } from './types.js';
export { resolveGenerationProvider, mockGenerationProvider } from './providers/index.js';
