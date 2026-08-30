import { describe, expect, it } from 'vitest';
import { computeAssetMetrics, computeCreatorMetrics, computeGameMetrics, computeMarketplaceMetric, computePlayerMetrics } from './rollups.js';
import type { PeriodWindow } from './types.js';

const window: PeriodWindow = { start: new Date('2026-01-01T10:00:00Z'), end: new Date('2026-01-01T11:00:00Z') };

describe('computePlayerMetrics', () => {
  it('aggregates playtime, games played, and event counts per user', () => {
    const sessions = [{ id: 's1', gameId: 'game-1', startedAt: null, endedAt: null }];
    const sessionPlayers = [
      { sessionId: 's1', userId: 'user-1', joinedAt: new Date('2026-01-01T10:05:00Z'), leftAt: new Date('2026-01-01T10:35:00Z') },
    ];
    const events = [
      { name: 'jump', userId: 'user-1', productId: null, props: null },
      { name: 'jump', userId: 'user-1', productId: null, props: null },
    ];
    const result = computePlayerMetrics(sessionPlayers, sessions, events, window);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ userId: 'user-1', sessionsJoined: 1, gamesPlayed: 1, playtimeMinutes: 30, eventsCount: 2 });
  });

  it('clips playtime to the window end when leftAt is null (still-active session)', () => {
    const sessions = [{ id: 's1', gameId: 'game-1', startedAt: null, endedAt: null }];
    const sessionPlayers = [{ sessionId: 's1', userId: 'user-1', joinedAt: new Date('2026-01-01T10:45:00Z'), leftAt: null }];
    const result = computePlayerMetrics(sessionPlayers, sessions, [], window);
    expect(result[0]!.playtimeMinutes).toBe(15);
  });

  it('ignores session-joins outside the window', () => {
    const sessionPlayers = [{ sessionId: 's1', userId: 'user-1', joinedAt: new Date('2026-01-01T09:00:00Z'), leftAt: new Date('2026-01-01T09:30:00Z') }];
    const result = computePlayerMetrics(sessionPlayers, [], [], window);
    expect(result).toHaveLength(0);
  });
});

describe('computeGameMetrics', () => {
  it('aggregates per game across all its players', () => {
    const sessions = [{ id: 's1', gameId: 'game-1', startedAt: new Date('2026-01-01T10:00:00Z'), endedAt: null }];
    const sessionPlayers = [
      { sessionId: 's1', userId: 'user-1', joinedAt: new Date('2026-01-01T10:00:00Z'), leftAt: new Date('2026-01-01T10:20:00Z') },
      { sessionId: 's1', userId: 'user-2', joinedAt: new Date('2026-01-01T10:10:00Z'), leftAt: new Date('2026-01-01T10:30:00Z') },
    ];
    const result = computeGameMetrics(sessionPlayers, sessions, window);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ gameId: 'game-1', sessionsStarted: 1, uniquePlayers: 2, playtimeMinutes: 40 });
  });
});

describe('computeAssetMetrics', () => {
  it('attributes purchase revenue only to ASSET-kind products, and counts asset_view events by props.assetId', () => {
    const products = [
      { id: 'prod-1', refKind: 'ASSET', refId: 'asset-1', creatorId: 'creator-1', createdAt: new Date() },
      { id: 'prod-2', refKind: 'WORLD', refId: 'world-1', creatorId: 'creator-1', createdAt: new Date() },
    ];
    const orderItems = [
      { orderId: 'o1', productId: 'prod-1', quantity: 2, unitPriceCents: 500, feeCents: 100, royaltyCents: 350 },
      { orderId: 'o2', productId: 'prod-2', quantity: 1, unitPriceCents: 1000, feeCents: 150, royaltyCents: 700 },
    ];
    const events = [{ name: 'asset_view', userId: 'u1', productId: null, props: { assetId: 'asset-1' } }];
    const result = computeAssetMetrics(orderItems, products, events, window);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assetId: 'asset-1', purchases: 2, revenueCents: 1000, views: 1 });
  });
});

describe('computeCreatorMetrics', () => {
  it('aggregates sales, revenue, and reviews per creator and attaches the reputation snapshot', () => {
    const products = [{ id: 'prod-1', refKind: 'ASSET', refId: 'asset-1', creatorId: 'creator-1', createdAt: new Date() }];
    const orderItems = [{ orderId: 'o1', productId: 'prod-1', quantity: 1, unitPriceCents: 1000, feeCents: 150, royaltyCents: 700 }];
    const reviews = [{ productId: 'prod-1', rating: 4, createdAt: new Date() }];
    const repMap = new Map([['creator-1', 88]]);
    const result = computeCreatorMetrics(orderItems, products, reviews, window, repMap);
    expect(result).toEqual([
      { creatorId: 'creator-1', periodStart: window.start, periodEnd: window.end, salesCount: 1, grossRevenueCents: 1000, royaltyCents: 700, reviewsReceived: 1, avgRating: 4, repScoreSnapshot: 88 },
    ]);
  });

  it('still emits a row for a creator with zero sales this hour, so repScoreSnapshot stays fresh', () => {
    const repMap = new Map([['quiet-creator', 42]]);
    const result = computeCreatorMetrics([], [], [], window, repMap);
    expect(result).toEqual([{ creatorId: 'quiet-creator', periodStart: window.start, periodEnd: window.end, salesCount: 0, grossRevenueCents: 0, royaltyCents: 0, reviewsReceived: 0, avgRating: 0, repScoreSnapshot: 42 }]);
  });
});

describe('computeMarketplaceMetric', () => {
  it('sums platform-wide totals', () => {
    const paidOrders = [{ id: 'o1', status: 'PAID', totalCents: 1000, paidAt: new Date(), refundedAt: null }];
    const paidOrderItems = [{ orderId: 'o1', productId: 'p1', quantity: 1, unitPriceCents: 1000, feeCents: 150, royaltyCents: 700 }];
    const refunded = [{ id: 'o2', status: 'REFUNDED', totalCents: 500, paidAt: null, refundedAt: new Date() }];
    const result = computeMarketplaceMetric(paidOrders, paidOrderItems, refunded, 3, 5, 7, window);
    expect(result).toEqual({ periodStart: window.start, periodEnd: window.end, ordersCount: 1, grossRevenueCents: 1000, platformFeeCents: 150, refundsCents: 500, newProducts: 3, newUsers: 5, activeSessions: 7 });
  });
});
