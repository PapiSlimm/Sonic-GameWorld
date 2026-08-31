// BullMQ job producers (CONTRACTS.md §13): this service only ever *enqueues* — the six worker
// packages under workers/ own consumption. Decorated as `app.queues`; see src/types.ts for the
// FastifyInstance augmentation.
//
// Payload shapes below are hand-mirrored from each worker's `src/types.ts` rather than imported
// from the worker package: none of the worker packages emit `.d.ts` output (their
// `tsconfig.json` sets `declaration: false` and nothing overrides it back in `tsconfig.build.
// json`), and none declare a `types`/`exports` field pointing at source — so `import type
// { GenerateJobPayload } from '@sonic-gameworld/worker-ai-generation'` has nothing to resolve
// against and does not typecheck. Keep each interface below in sync with its worker's
// `src/types.ts` by hand.
import fp from 'fastify-plugin';
import { Queue, type JobsOptions } from 'bullmq';
import { QUEUE_NAMES, type EngineTarget, type LicenseRecord, type WorldDocument } from '@sonic-gameworld/world-schema';
import type { AIAgentRole, AIToolName } from '@sonic-gameworld/ai-sdk';
import type { FastifyInstance } from 'fastify';

// ---- Payload shapes (mirrors workers/*/src/types.ts) ----

/** Mirrors workers/asset-processing/src/types.ts `JobPayload`. */
export interface AssetProcessJobPayload {
  assetId: string;
  versionId: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  creatorId?: string;
  resumeFromIndex?: number;
  forceApprove?: boolean;
}

/** Mirrors workers/ai-generation/src/types.ts `GenerateJobPayload`. */
export interface AiGenerateJobPayload {
  worldId?: string;
  actorId?: string;
  orgId?: string;
  tool: AIToolName;
  role?: AIAgentRole;
  prompt: string;
  args?: Record<string, unknown>;
}

/** Mirrors workers/builds/src/types.ts `BuildJobPayload`. */
export interface BuildCompileJobPayload {
  gameId: string;
  gameVersionId: string;
  worldId: string;
  worldVersionId?: string;
  worldDocument?: WorldDocument;
  engines: EngineTarget[];
  requestedBy?: string;
}

/** Mirrors workers/moderation/src/types.ts `ModerationJobPayload`. */
export interface ModerationScanJobPayload {
  refKind: 'ASSET' | 'PRODUCT' | 'WORLD' | 'GAME' | 'REVIEW' | 'USER' | 'NPC';
  refId: string;
  reporterId?: string;
  reason?: string;
  content?: { text?: string; fileKey?: string; fileName?: string };
  licenses?: LicenseRecord[];
  itemId?: string;
  resumeFromIndex?: number;
  resolution?: 'APPROVED' | 'REJECTED';
}

/** Mirrors workers/analytics/src/types.ts `RollupJobPayload`. */
export interface AnalyticsRollupJobPayload {
  periodStart?: string;
  periodEnd?: string;
}

/** The position of `HUMAN_REVIEW` in `MODERATION_STAGE_NAMES`
 * (workers/moderation/src/types.ts) — used to resume a paused moderation job after
 * `POST /moderation/:id/resolve`. Kept as a named constant here rather than a magic `4` at every
 * call site. */
export const MODERATION_HUMAN_REVIEW_STAGE_INDEX = 4;

// ---- The decorator surface ----

/** Narrow producer-only surface of a BullMQ `Queue<T>` — just `.add()`. Deliberately not the
 * concrete `Queue<T>` class type: BullMQ's `Queue` has private/protected members, so a plain test
 * double could never structurally satisfy it. Every route only ever needs `.add()`, and a real
 * `Queue<T>` instance satisfies this interface structurally, so `buildQueues()` below can hand one
 * out unchanged. */
export interface QueueLike<T> {
  add(name: string, data: T, opts?: JobsOptions): Promise<{ id?: string; name: string; data: T }>;
}

export interface Queues {
  assetProcess: QueueLike<AssetProcessJobPayload>;
  aiGenerate: QueueLike<AiGenerateJobPayload>;
  buildCompile: QueueLike<BuildCompileJobPayload>;
  moderationScan: QueueLike<ModerationScanJobPayload>;
  analyticsRollup: QueueLike<AnalyticsRollupJobPayload>;
}

let testOverride: Queues | undefined;

/** Test hook (mirrors `setPrismaForTests`/`setBusForTests`): inject a fake `Queues` so unit tests
 * never open a real Redis connection. Call with `undefined` to clear the override. */
export function setQueuesForTests(fake: Queues | undefined): void {
  testOverride = fake;
}

function buildQueues(app: FastifyInstance): Queues {
  const connection = app.redis;
  return {
    assetProcess: new Queue<AssetProcessJobPayload>(QUEUE_NAMES.ASSET_PROCESS, { connection }),
    aiGenerate: new Queue<AiGenerateJobPayload>(QUEUE_NAMES.AI_GENERATE, { connection }),
    buildCompile: new Queue<BuildCompileJobPayload>(QUEUE_NAMES.BUILD_COMPILE, { connection }),
    moderationScan: new Queue<ModerationScanJobPayload>(QUEUE_NAMES.MODERATION_SCAN, { connection }),
    analyticsRollup: new Queue<AnalyticsRollupJobPayload>(QUEUE_NAMES.ANALYTICS_ROLLUP, { connection }),
  };
}

/** One handler per queue, run in-process instead of dispatched through Redis/BullMQ. Each handler
 * is the same `process*Job(payload, deps)` function the corresponding `workers/*` package exports
 * — see `@sonic-gameworld/desktop` (the Electron shell), which is the only caller that constructs
 * one of these, since it's the only place that can import all six worker packages directly without
 * services/api itself taking a dependency on them. */
export interface LocalQueueHandlers {
  assetProcess(payload: AssetProcessJobPayload): Promise<unknown>;
  aiGenerate(payload: AiGenerateJobPayload): Promise<unknown>;
  buildCompile(payload: BuildCompileJobPayload): Promise<unknown>;
  moderationScan(payload: ModerationScanJobPayload): Promise<unknown>;
  analyticsRollup(payload: AnalyticsRollupJobPayload): Promise<unknown>;
}

/** Builds a `QueueLike<T>` that runs `handler` immediately in the background instead of enqueueing
 * to Redis. Mirrors real BullMQ semantics closely enough for desktop use: `.add()` resolves right
 * away (the caller never awaits job completion, same as a real `Queue.add()`), and the handler's
 * own failure is caught and logged rather than left as an unhandled rejection. A `repeat` option
 * (only ever used for the hourly analytics rollup — see app.ts) is honored as a plain hourly
 * `setInterval` rather than parsing the actual cron pattern: desktop mode only ever needs "runs
 * about once an hour," not exact cron semantics. */
function createLocalQueue<T>(name: string, handler: (payload: T) => Promise<unknown>): QueueLike<T> {
  let nextId = 1;
  function run(data: T): void {
    handler(data).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[local-queue:${name}] job failed:`, err instanceof Error ? err.message : err);
    });
  }
  return {
    // eslint-disable-next-line @typescript-eslint/require-await
    async add(jobName: string, data: T, opts?: JobsOptions) {
      const id = `local-${name}-${nextId++}`;
      if (opts?.repeat) {
        run(data);
        setInterval(() => run(data), 60 * 60 * 1000).unref();
      } else {
        run(data);
      }
      return { id, name: jobName, data };
    },
  };
}

/** Builds a full `Queues` decorator surface from in-process handlers — the desktop-mode
 * alternative to `buildQueues()`'s real BullMQ `Queue` instances. See `LocalQueueHandlers`. */
export function createLocalQueues(handlers: LocalQueueHandlers): Queues {
  return {
    assetProcess: createLocalQueue('asset-process', handlers.assetProcess),
    aiGenerate: createLocalQueue('ai-generate', handlers.aiGenerate),
    buildCompile: createLocalQueue('build-compile', handlers.buildCompile),
    moderationScan: createLocalQueue('moderation-scan', handlers.moderationScan),
    analyticsRollup: createLocalQueue('analytics-rollup', handlers.analyticsRollup),
  };
}

let desktopHandlersOverride: LocalQueueHandlers | undefined;

/** Production (non-test) hook for desktop mode: `@sonic-gameworld/desktop` calls this once, before
 * the API's Fastify app is built, so `queuesPlugin` below runs every job in-process instead of
 * requiring a real Redis connection. Call with `undefined` to clear it (mirrors
 * `setQueuesForTests`, which still takes precedence over this when both are set). */
export function setDesktopQueueHandlers(handlers: LocalQueueHandlers | undefined): void {
  desktopHandlersOverride = handlers;
}

// NOTE: must be registered after `app.decorate('redis', ...)` has run (see src/app.ts) — real
// `Queue` construction below reads `app.redis` eagerly, once. Precedence: an explicit test double
// wins over desktop-mode local handlers, which win over the real Redis-backed queues.
async function queuesPlugin(app: FastifyInstance): Promise<void> {
  const queues = testOverride ?? (desktopHandlersOverride ? createLocalQueues(desktopHandlersOverride) : buildQueues(app));
  app.decorate('queues', queues);
}

export default fp(queuesPlugin, { name: 'queues' });
