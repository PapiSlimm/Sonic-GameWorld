// Turns the raw rows queries.ts fetches (already scoped to the reputation lookback window, plus
// each creator's full product/asset catalog for the "totalListings"/"originality" denominators)
// into the per-creator CreatorSignals reputation.ts's pure formula consumes. Kept separate from
// reputation.ts so the scoring formula and the "how do we gather its inputs from our schema" glue
// can be tested independently.
import type { CreatorSignals } from './reputation.js';

export interface ProductLite {
  id: string;
  creatorId: string;
}
export interface AssetLite {
  id: string;
  creatorId: string;
}
export interface OrderItemLite {
  orderId: string;
  productId: string;
  quantity: number;
}
export interface OrderLite {
  id: string;
  status: string;
}
export interface ReviewLite {
  productId: string;
  rating: number;
  creatorReplyBody: string | null;
}
export interface ProductVersionLite {
  productId: string;
}
export interface AssetPassportLite {
  assetId: string;
  source: string | null;
}
export interface ModerationItemLite {
  refKind: string;
  refId: string;
  severity: string;
}

export interface ReputationInputs {
  products: ProductLite[];
  assets: AssetLite[];
  orders: OrderLite[];
  orderItems: OrderItemLite[];
  reviews: ReviewLite[];
  productVersions: ProductVersionLite[];
  assetPassports: AssetPassportLite[];
  moderationItems: ModerationItemLite[];
  lookbackYears: number;
}

const VIOLATION_SEVERITIES = new Set(['MEDIUM', 'HIGH', 'CRITICAL']);

export function buildCreatorSignalsMap(input: ReputationInputs): Map<string, CreatorSignals> {
  const productsByCreator = new Map<string, ProductLite[]>();
  for (const p of input.products) {
    const arr = productsByCreator.get(p.creatorId) ?? [];
    arr.push(p);
    productsByCreator.set(p.creatorId, arr);
  }
  const assetsByCreator = new Map<string, AssetLite[]>();
  for (const a of input.assets) {
    const arr = assetsByCreator.get(a.creatorId) ?? [];
    arr.push(a);
    assetsByCreator.set(a.creatorId, arr);
  }
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const assetPassportBySource = new Map(input.assetPassports.map((ap) => [ap.assetId, ap.source]));

  const creatorIds = new Set<string>([...productsByCreator.keys(), ...assetsByCreator.keys()]);
  const map = new Map<string, CreatorSignals>();

  for (const creatorId of creatorIds) {
    const products = productsByCreator.get(creatorId) ?? [];
    const assets = assetsByCreator.get(creatorId) ?? [];
    const productIds = new Set(products.map((p) => p.id));
    const assetIds = new Set(assets.map((a) => a.id));

    const myOrderItems = input.orderItems.filter((oi) => productIds.has(oi.productId));
    const myOrders = new Map<string, OrderLite>();
    for (const oi of myOrderItems) {
      const order = orderById.get(oi.orderId);
      if (order) myOrders.set(order.id, order);
    }
    const totalOrders = myOrders.size;
    const refundedOrders = [...myOrders.values()].filter((o) => o.status === 'REFUNDED' || o.status === 'PARTIALLY_REFUNDED').length;

    const myReviews = input.reviews.filter((r) => productIds.has(r.productId));
    const avgRating = myReviews.length > 0 ? myReviews.reduce((sum, r) => sum + r.rating, 0) / myReviews.length : 0;
    const repliedCount = myReviews.filter((r) => r.creatorReplyBody).length;

    const myVersions = input.productVersions.filter((v) => productIds.has(v.productId));
    const versionsPerProductPerYear = products.length > 0 ? myVersions.length / products.length / Math.max(input.lookbackYears, 1 / 365) : 0;

    const originalCount = assets.filter((a) => assetPassportBySource.get(a.id) === 'ORIGINAL').length;
    const originalRatioPct = assets.length > 0 ? originalCount / assets.length : 1; // no assets yet -> no evidence against originality

    const violations = input.moderationItems.filter(
      (m) => VIOLATION_SEVERITIES.has(m.severity) && ((m.refKind === 'PRODUCT' && productIds.has(m.refId)) || (m.refKind === 'ASSET' && assetIds.has(m.refId))),
    ).length;

    map.set(creatorId, {
      avgRating,
      refundRatePct: totalOrders > 0 ? refundedOrders / totalOrders : 0,
      totalSales: myOrderItems.reduce((sum, oi) => sum + oi.quantity, 0),
      versionsPerProductPerYear,
      reviewCountRecent: myReviews.length,
      replyRatePct: myReviews.length > 0 ? repliedCount / myReviews.length : 0,
      originalRatioPct,
      complianceViolations: violations,
      totalListings: products.length,
    });
  }

  return map;
}
