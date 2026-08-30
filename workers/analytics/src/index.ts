// @sonic-gameworld/worker-analytics — BullMQ worker for queue 'analytics.rollup'.
//
// Runs hourly rollups into PlayerMetric/GameMetric/AssetMetric/CreatorMetric/MarketplaceMetric
// (CONTRACTS.md §13; see types.ts's header comment for the schema-gap note these five models
// require) and recomputes each CreatorProfile's cached §14 reputation breakdown — the schema
// comment on CreatorProfile.repScore says exactly that: "recomputed by analytics workers."
import { PrismaClient } from '@prisma/client';
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { createEvent, createEventBusFromEnv, type EventBus } from '@sonic-gameworld/events';
import { loadConfig, type AnalyticsConfig } from './env.js';
import { createLogger, type Logger } from './logger.js';
import { fetchHourlyActivity, fetchMarketplaceCounts, fetchPaidCommerce, fetchRefundedOrders, fetchReputationInputs, fetchReviewsInWindow } from './queries.js';
import { computeCreatorReputation, type ReputationBreakdown } from './reputation.js';
import { buildCreatorSignalsMap } from './reputationSignals.js';
import { computeAssetMetrics, computeCreatorMetrics, computeGameMetrics, computeMarketplaceMetric, computePlayerMetrics } from './rollups.js';
import type { PeriodWindow, PrismaLike, RollupJobPayload, RollupResult } from './types.js';

export const WORKER_NAME = '@sonic-gameworld/worker-analytics';
export const QUEUE_NAME = 'analytics.rollup';

export interface WorkerHandles {
  worker: Worker<RollupJobPayload>;
  connection: Redis;
  bus: EventBus;
  close(): Promise<void>;
}

export interface ProcessDeps {
  prisma: PrismaLike;
  bus: EventBus;
  config: AnalyticsConfig;
  log?: Logger;
}

/** Resolves the job's window to "the last fully-completed hour" when not specified, so a plain
 * hourly cron trigger with an empty payload does the right thing. */
export function resolveWindow(payload: RollupJobPayload, now = new Date()): PeriodWindow {
  if (payload.periodStart && payload.periodEnd) {
    return { start: new Date(payload.periodStart), end: new Date(payload.periodEnd) };
  }
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  return { start, end };
}

async function recomputeReputations(prisma: PrismaLike, config: AnalyticsConfig, log: Logger): Promise<Map<string, ReputationBreakdown>> {
  const lookbackStart = new Date(Date.now() - config.reputationLookbackDays * 24 * 60 * 60 * 1000);
  const inputs = await fetchReputationInputs(prisma, lookbackStart, config.reputationLookbackDays);
  const signalsByCreator = buildCreatorSignalsMap(inputs);

  const breakdowns = new Map<string, ReputationBreakdown>();
  for (const profile of inputs.creatorProfiles) {
    const signals = signalsByCreator.get(profile.id);
    const breakdown = computeCreatorReputation(
      signals ?? { avgRating: 0, refundRatePct: 0, totalSales: 0, versionsPerProductPerYear: 0, reviewCountRecent: 0, replyRatePct: 0, originalRatioPct: 1, complianceViolations: 0, totalListings: 0 },
    );
    breakdowns.set(profile.id, breakdown);
    try {
      await prisma.creatorProfile.update({ where: { id: profile.id }, data: { ...breakdown, repComputedAt: new Date() } });
    } catch (err) {
      log.warn({ err, creatorId: profile.id }, 'failed to persist recomputed reputation for creator');
    }
  }
  return breakdowns;
}

/** Runs one hourly rollup end-to-end: fetch -> compute -> upsert every metric sink -> recompute
 * creator reputations -> publish a summary event. Every metric family is independent — a failure
 * fetching/computing one (caught individually) does not prevent the others from completing, since
 * a partial hourly rollup is far more useful to a dashboard than none at all. */
export async function processRollupJob(payload: RollupJobPayload, deps: ProcessDeps): Promise<RollupResult> {
  const log = deps.log ?? createLogger(WORKER_NAME, deps.config.logLevel);
  const window = resolveWindow(payload);
  log.info({ start: window.start.toISOString(), end: window.end.toISOString() }, 'rollup:start');

  const [{ sessionPlayers, sessions, events }, { paidOrders, paidOrderItems, products }, refundedOrders, reviews, { newProductsCount, newUsersCount }, repBreakdowns] = await Promise.all([
    fetchHourlyActivity(deps.prisma, window),
    fetchPaidCommerce(deps.prisma, window),
    fetchRefundedOrders(deps.prisma, window),
    fetchReviewsInWindow(deps.prisma, window),
    fetchMarketplaceCounts(deps.prisma, window),
    recomputeReputations(deps.prisma, deps.config, log),
  ]);

  const repScoreByCreator = new Map<string, number>([...repBreakdowns.entries()].map(([id, b]) => [id, b.repScore]));
  const activeSessions = new Set(sessionPlayers.map((sp) => sp.sessionId)).size;

  const playerMetrics = computePlayerMetrics(sessionPlayers, sessions, events, window);
  const gameMetrics = computeGameMetrics(sessionPlayers, sessions, window);
  const assetMetrics = computeAssetMetrics(paidOrderItems, products, events, window);
  const creatorMetrics = computeCreatorMetrics(paidOrderItems, products, reviews, window, repScoreByCreator);
  const marketplaceMetric = computeMarketplaceMetric(paidOrders, paidOrderItems, refundedOrders, newProductsCount, newUsersCount, activeSessions, window);

  await Promise.all([
    ...playerMetrics.map((row) =>
      deps.prisma.playerMetric.upsert({ where: { userId_periodStart: { userId: row.userId, periodStart: row.periodStart } }, create: row, update: row }),
    ),
    ...gameMetrics.map((row) =>
      deps.prisma.gameMetric.upsert({ where: { gameId_periodStart: { gameId: row.gameId, periodStart: row.periodStart } }, create: row, update: row }),
    ),
    ...assetMetrics.map((row) =>
      deps.prisma.assetMetric.upsert({ where: { assetId_periodStart: { assetId: row.assetId, periodStart: row.periodStart } }, create: row, update: row }),
    ),
    ...creatorMetrics.map((row) =>
      deps.prisma.creatorMetric.upsert({ where: { creatorId_periodStart: { creatorId: row.creatorId, periodStart: row.periodStart } }, create: row, update: row }),
    ),
    deps.prisma.marketplaceMetric.upsert({ where: { periodStart: marketplaceMetric.periodStart }, create: marketplaceMetric, update: marketplaceMetric }),
  ]);

  await deps.bus.publish(
    createEvent({
      type: 'ANALYTICS_EVENT',
      payload: {
        kind: 'HOURLY_ROLLUP_COMPLETED',
        periodStart: window.start.toISOString(),
        periodEnd: window.end.toISOString(),
        playerMetrics: playerMetrics.length,
        gameMetrics: gameMetrics.length,
        assetMetrics: assetMetrics.length,
        creatorMetrics: creatorMetrics.length,
        marketplace: marketplaceMetric,
      },
    }),
  );

  log.info({ playerMetrics: playerMetrics.length, gameMetrics: gameMetrics.length, assetMetrics: assetMetrics.length, creatorMetrics: creatorMetrics.length }, 'rollup:done');

  return { window, playerMetrics: playerMetrics.length, gameMetrics: gameMetrics.length, assetMetrics: assetMetrics.length, creatorMetrics: creatorMetrics.length, marketplaceMetric };
}

export function startWorker(config: AnalyticsConfig = loadConfig()): WorkerHandles {
  const log = createLogger(WORKER_NAME, config.logLevel);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient() as unknown as PrismaLike;
  const bus = createEventBusFromEnv(process.env, { driver: config.eventBusDriver });

  const worker = new Worker<RollupJobPayload>(QUEUE_NAME, async (job: Job<RollupJobPayload>) => processRollupJob(job.data, { prisma, bus, config, log }), {
    connection,
    concurrency: config.concurrency,
  });

  worker.on('completed', (job, result: RollupResult) => log.info({ jobId: job.id, playerMetrics: result.playerMetrics, gameMetrics: result.gameMetrics }, 'job:completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, err: err.message }, 'job:failed'));

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

export type { RollupJobPayload, RollupResult, PrismaLike } from './types.js';
export { computeCreatorReputation } from './reputation.js';
