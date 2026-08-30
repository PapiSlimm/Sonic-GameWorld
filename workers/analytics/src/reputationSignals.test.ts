import { describe, expect, it } from 'vitest';
import { buildCreatorSignalsMap } from './reputationSignals.js';

describe('buildCreatorSignalsMap', () => {
  it('computes per-creator signals from raw rows', () => {
    const map = buildCreatorSignalsMap({
      products: [{ id: 'prod-1', creatorId: 'creator-1' }],
      assets: [
        { id: 'asset-1', creatorId: 'creator-1' },
        { id: 'asset-2', creatorId: 'creator-1' },
      ],
      orders: [
        { id: 'order-1', status: 'PAID' },
        { id: 'order-2', status: 'REFUNDED' },
      ],
      orderItems: [
        { orderId: 'order-1', productId: 'prod-1', quantity: 2 },
        { orderId: 'order-2', productId: 'prod-1', quantity: 1 },
      ],
      reviews: [
        { productId: 'prod-1', rating: 5, creatorReplyBody: 'Thanks!' },
        { productId: 'prod-1', rating: 3, creatorReplyBody: null },
      ],
      productVersions: [{ productId: 'prod-1' }, { productId: 'prod-1' }],
      assetPassports: [
        { assetId: 'asset-1', source: 'ORIGINAL' },
        { assetId: 'asset-2', source: 'IMPORTED' },
      ],
      moderationItems: [{ refKind: 'PRODUCT', refId: 'prod-1', severity: 'HIGH' }],
      lookbackYears: 1,
    });

    const signals = map.get('creator-1')!;
    expect(signals.totalSales).toBe(3);
    expect(signals.refundRatePct).toBeCloseTo(0.5);
    expect(signals.avgRating).toBe(4);
    expect(signals.replyRatePct).toBeCloseTo(0.5);
    expect(signals.originalRatioPct).toBeCloseTo(0.5);
    expect(signals.versionsPerProductPerYear).toBe(2);
    expect(signals.complianceViolations).toBe(1);
    expect(signals.totalListings).toBe(1);
  });

  it('gives a creator with no assets yet full originality credit (no evidence against them)', () => {
    const map = buildCreatorSignalsMap({
      products: [{ id: 'prod-1', creatorId: 'creator-2' }],
      assets: [],
      orders: [],
      orderItems: [],
      reviews: [],
      productVersions: [],
      assetPassports: [],
      moderationItems: [],
      lookbackYears: 1,
    });
    expect(map.get('creator-2')!.originalRatioPct).toBe(1);
  });

  it('returns an empty map when there are no products or assets at all', () => {
    const map = buildCreatorSignalsMap({ products: [], assets: [], orders: [], orderItems: [], reviews: [], productVersions: [], assetPassports: [], moderationItems: [], lookbackYears: 1 });
    expect(map.size).toBe(0);
  });
});
