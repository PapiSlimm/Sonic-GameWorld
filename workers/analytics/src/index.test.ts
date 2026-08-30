import { MemoryEventBus } from '@sonic-gameworld/events';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';
import { processRollupJob, resolveWindow } from './index.js';
import { createFakePrisma } from './test/fakePrisma.js';
import type { RollupJobPayload } from './types.js';

const window = { start: new Date('2026-01-01T10:00:00Z'), end: new Date('2026-01-01T11:00:00Z') };

function seedWorld(stores: ReturnType<typeof createFakePrisma>['stores']) {
  stores.creatorProfile.seed([{ id: 'creator-1', deletedAt: null }]);
  stores.product.seed([{ id: 'prod-1', refKind: 'ASSET', refId: 'asset-1', creatorId: 'creator-1', createdAt: new Date('2026-01-01T10:15:00Z') }]);
  stores.asset.seed([{ id: 'asset-1', creatorId: 'creator-1' }]);
  stores.order.seed([{ id: 'order-1', status: 'PAID', totalCents: 1000, subtotalCents: 1000, paidAt: new Date('2026-01-01T10:20:00Z'), refundedAt: null, buyerId: 'user-1' }]);
  stores.orderItem.seed([{ orderId: 'order-1', productId: 'prod-1', quantity: 1, unitPriceCents: 1000, feeCents: 150, royaltyCents: 700 }]);
  stores.review.seed([{ productId: 'prod-1', rating: 5, creatorReplyBody: null, createdAt: new Date('2026-01-01T10:25:00Z') }]);
  stores.assetPassport.seed([{ assetId: 'asset-1', data: { source: 'ORIGINAL' } }]);
  stores.gameSession.seed([{ id: 'session-1', gameId: 'game-1', startedAt: new Date('2026-01-01T10:00:00Z'), endedAt: null }]);
  stores.gameSessionPlayer.seed([{ sessionId: 'session-1', userId: 'user-1', joinedAt: new Date('2026-01-01T10:05:00Z'), leftAt: new Date('2026-01-01T10:35:00Z') }]);
  stores.analyticsEvent.seed([{ name: 'asset_view', userId: 'user-1', productId: null, timestamp: new Date('2026-01-01T10:10:00Z'), props: { assetId: 'asset-1' } }]);
  stores.user.seed([{ id: 'user-2', createdAt: new Date('2026-01-01T10:40:00Z') }]);
}

describe('processRollupJob', () => {
  it('computes and persists every metric family, and recomputes creator reputation', async () => {
    const { prisma, stores } = createFakePrisma();
    seedWorld(stores);
    const bus = new MemoryEventBus();
    const config = loadConfig({ REPUTATION_LOOKBACK_DAYS: '90' } as NodeJS.ProcessEnv);

    const payload: RollupJobPayload = { periodStart: window.start.toISOString(), periodEnd: window.end.toISOString() };
    const result = await processRollupJob(payload, { prisma, bus, config });

    expect(result.playerMetrics).toBe(1);
    expect(result.gameMetrics).toBe(1);
    expect(result.assetMetrics).toBe(1);
    expect(result.creatorMetrics).toBe(1);
    expect(result.marketplaceMetric.ordersCount).toBe(1);
    expect(result.marketplaceMetric.grossRevenueCents).toBe(1000);
    expect(result.marketplaceMetric.newProducts).toBe(1);
    expect(result.marketplaceMetric.newUsers).toBe(1);

    expect(stores.playerMetric.rows).toHaveLength(1);
    expect(stores.gameMetric.rows).toHaveLength(1);
    expect(stores.assetMetric.rows[0]).toMatchObject({ assetId: 'asset-1', purchases: 1, views: 1 });
    expect(stores.creatorMetric.rows[0]).toMatchObject({ creatorId: 'creator-1', salesCount: 1 });
    expect(stores.marketplaceMetric.rows).toHaveLength(1);

    // Reputation recompute wrote real numbers back onto CreatorProfile (§14, cast by
    // schema.prisma's own comment as "recomputed by analytics workers").
    const creator = stores.creatorProfile.rows[0]!;
    expect(typeof creator.repScore).toBe('number');
    expect(creator.repComputedAt).toBeInstanceOf(Date);

    expect(bus.history.some((e) => e.type === 'ANALYTICS_EVENT')).toBe(true);
  });

  it('is idempotent: running the same window twice upserts rather than duplicating rows', async () => {
    const { prisma, stores } = createFakePrisma();
    seedWorld(stores);
    const bus = new MemoryEventBus();
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const payload: RollupJobPayload = { periodStart: window.start.toISOString(), periodEnd: window.end.toISOString() };

    await processRollupJob(payload, { prisma, bus, config });
    await processRollupJob(payload, { prisma, bus, config });

    expect(stores.playerMetric.rows).toHaveLength(1);
    expect(stores.marketplaceMetric.rows).toHaveLength(1);
  });

  it('produces an empty-but-valid rollup for a quiet hour with no activity', async () => {
    const { prisma } = createFakePrisma();
    const bus = new MemoryEventBus();
    const config = loadConfig({} as NodeJS.ProcessEnv);
    const payload: RollupJobPayload = { periodStart: window.start.toISOString(), periodEnd: window.end.toISOString() };

    const result = await processRollupJob(payload, { prisma, bus, config });
    expect(result.playerMetrics).toBe(0);
    expect(result.marketplaceMetric.ordersCount).toBe(0);
  });
});

describe('resolveWindow', () => {
  it('uses the explicit period when provided', () => {
    const w = resolveWindow({ periodStart: '2026-01-01T10:00:00.000Z', periodEnd: '2026-01-01T11:00:00.000Z' });
    expect(w.start.toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });

  it('defaults to the last fully-completed hour', () => {
    const now = new Date('2026-01-01T14:22:00.000Z');
    const w = resolveWindow({}, now);
    expect(w.start.toISOString()).toBe('2026-01-01T13:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });
});
