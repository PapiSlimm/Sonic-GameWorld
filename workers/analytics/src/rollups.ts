// Pure aggregation functions — every one takes already-fetched rows (plain objects shaped like
// the Prisma rows CONTRACTS.md §10's schema already defines) plus the [start, end) window, and
// returns the computed metric rows. Kept free of Prisma calls so they're trivially unit-testable
// with plain fixtures; src/queries.ts does the fetching, src/index.ts does the fetch -> compute ->
// persist orchestration.
import type { AssetMetricRow, CreatorMetricRow, GameMetricRow, MarketplaceMetricRow, PeriodWindow, PlayerMetricRow } from './types.js';

export interface SessionPlayerRow {
  sessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
}
export interface SessionRow {
  id: string;
  gameId: string;
  startedAt: Date | null;
  endedAt: Date | null;
}
export interface AnalyticsEventRow {
  name: string;
  userId: string | null;
  productId: string | null;
  props: Record<string, unknown> | null;
}
export interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  paidAt: Date | null;
  refundedAt: Date | null;
}
export interface OrderItemRow {
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  feeCents: number;
  royaltyCents: number;
}
export interface ProductRow {
  id: string;
  refKind: string;
  refId: string;
  creatorId: string;
  createdAt: Date;
}
export interface ReviewRow {
  productId: string;
  rating: number;
  createdAt: Date;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 60_000);
}

function clipToWindow(joinedAt: Date, leftAt: Date | null, window: PeriodWindow): number {
  const end = leftAt && leftAt < window.end ? leftAt : window.end;
  const start = joinedAt > window.start ? joinedAt : window.start;
  return minutesBetween(start, end);
}

/** Player-minutes and session-join counts are attributed to the hour a player's session-segment
 * *joined* in — a session spanning an hour boundary is not split across both hourly rows. This is
 * a documented simplification, not a bug: it keeps the join simple and is accurate to within one
 * session's length, which is acceptable for hourly analytics dashboards. */
export function computePlayerMetrics(sessionPlayers: SessionPlayerRow[], sessions: SessionRow[], events: AnalyticsEventRow[], window: PeriodWindow): PlayerMetricRow[] {
  const gameIdBySession = new Map(sessions.map((s) => [s.id, s.gameId]));
  const byUser = new Map<string, { minutes: number; games: Set<string>; sessions: number }>();

  for (const sp of sessionPlayers) {
    if (sp.joinedAt < window.start || sp.joinedAt >= window.end) continue;
    const entry = byUser.get(sp.userId) ?? { minutes: 0, games: new Set<string>(), sessions: 0 };
    entry.minutes += clipToWindow(sp.joinedAt, sp.leftAt, window);
    entry.sessions += 1;
    const gameId = gameIdBySession.get(sp.sessionId);
    if (gameId) entry.games.add(gameId);
    byUser.set(sp.userId, entry);
  }

  const eventCountByUser = new Map<string, number>();
  for (const e of events) {
    if (!e.userId) continue;
    eventCountByUser.set(e.userId, (eventCountByUser.get(e.userId) ?? 0) + 1);
  }
  for (const userId of eventCountByUser.keys()) {
    if (!byUser.has(userId)) byUser.set(userId, { minutes: 0, games: new Set(), sessions: 0 });
  }

  return [...byUser.entries()].map(([userId, v]) => ({
    userId,
    periodStart: window.start,
    periodEnd: window.end,
    sessionsJoined: v.sessions,
    gamesPlayed: v.games.size,
    playtimeMinutes: Math.round(v.minutes * 100) / 100,
    eventsCount: eventCountByUser.get(userId) ?? 0,
  }));
}

export function computeGameMetrics(sessionPlayers: SessionPlayerRow[], sessions: SessionRow[], window: PeriodWindow): GameMetricRow[] {
  const gameIdBySession = new Map(sessions.map((s) => [s.id, s.gameId]));
  const byGame = new Map<string, { minutes: number; players: Set<string>; started: number; ended: number }>();

  const ensure = (gameId: string) => {
    const entry = byGame.get(gameId) ?? { minutes: 0, players: new Set<string>(), started: 0, ended: 0 };
    byGame.set(gameId, entry);
    return entry;
  };

  for (const s of sessions) {
    if (s.startedAt && s.startedAt >= window.start && s.startedAt < window.end) ensure(s.gameId).started += 1;
    if (s.endedAt && s.endedAt >= window.start && s.endedAt < window.end) ensure(s.gameId).ended += 1;
  }
  for (const sp of sessionPlayers) {
    if (sp.joinedAt < window.start || sp.joinedAt >= window.end) continue;
    const gameId = gameIdBySession.get(sp.sessionId);
    if (!gameId) continue;
    const entry = ensure(gameId);
    entry.minutes += clipToWindow(sp.joinedAt, sp.leftAt, window);
    entry.players.add(sp.userId);
  }

  return [...byGame.entries()].map(([gameId, v]) => ({
    gameId,
    periodStart: window.start,
    periodEnd: window.end,
    sessionsStarted: v.started,
    sessionsEnded: v.ended,
    uniquePlayers: v.players.size,
    playtimeMinutes: Math.round(v.minutes * 100) / 100,
    avgSessionMinutes: v.players.size > 0 ? Math.round((v.minutes / v.players.size) * 100) / 100 : 0,
  }));
}

/** Assumes `orders`/`orderItems` are already filtered to PAID orders whose `paidAt` falls in the
 * window (see queries.ts) — this function just attributes revenue/purchases to the ASSET-kind
 * product each item belongs to, plus tallies `asset_view` analytics events (convention:
 * `props.assetId` on the event, since AnalyticsEvent has no dedicated assetId column). */
export function computeAssetMetrics(orderItems: OrderItemRow[], products: ProductRow[], events: AnalyticsEventRow[], window: PeriodWindow): AssetMetricRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const byAsset = new Map<string, { views: number; purchases: number; revenueCents: number }>();
  const ensure = (assetId: string) => {
    const entry = byAsset.get(assetId) ?? { views: 0, purchases: 0, revenueCents: 0 };
    byAsset.set(assetId, entry);
    return entry;
  };

  for (const item of orderItems) {
    const product = productById.get(item.productId);
    if (!product || product.refKind !== 'ASSET') continue;
    const entry = ensure(product.refId);
    entry.purchases += item.quantity;
    entry.revenueCents += item.unitPriceCents * item.quantity;
  }
  for (const e of events) {
    if (e.name !== 'asset_view') continue;
    const assetId = typeof e.props?.assetId === 'string' ? e.props.assetId : undefined;
    if (!assetId) continue;
    ensure(assetId).views += 1;
  }

  return [...byAsset.entries()].map(([assetId, v]) => ({ assetId, periodStart: window.start, periodEnd: window.end, ...v }));
}

/** Same PAID/window-filtered `orders`/`orderItems` precondition as computeAssetMetrics. */
export function computeCreatorMetrics(
  orderItems: OrderItemRow[],
  products: ProductRow[],
  reviews: ReviewRow[],
  window: PeriodWindow,
  repScoreByCreator: Map<string, number>,
): CreatorMetricRow[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const byCreator = new Map<string, { sales: number; gross: number; royalty: number; reviewSum: number; reviewCount: number }>();
  const ensure = (creatorId: string) => {
    const entry = byCreator.get(creatorId) ?? { sales: 0, gross: 0, royalty: 0, reviewSum: 0, reviewCount: 0 };
    byCreator.set(creatorId, entry);
    return entry;
  };

  for (const item of orderItems) {
    const product = productById.get(item.productId);
    if (!product) continue;
    const entry = ensure(product.creatorId);
    entry.sales += item.quantity;
    entry.gross += item.unitPriceCents * item.quantity;
    entry.royalty += item.royaltyCents;
  }
  for (const review of reviews) {
    const product = productById.get(review.productId);
    if (!product) continue;
    const entry = ensure(product.creatorId);
    entry.reviewSum += review.rating;
    entry.reviewCount += 1;
  }
  // Creators active only via reputation recompute (no sales/reviews this hour) still get a row so
  // repScoreSnapshot stays fresh even during a quiet hour.
  for (const creatorId of repScoreByCreator.keys()) ensure(creatorId);

  return [...byCreator.entries()].map(([creatorId, v]) => ({
    creatorId,
    periodStart: window.start,
    periodEnd: window.end,
    salesCount: v.sales,
    grossRevenueCents: v.gross,
    royaltyCents: v.royalty,
    reviewsReceived: v.reviewCount,
    avgRating: v.reviewCount > 0 ? Math.round((v.reviewSum / v.reviewCount) * 100) / 100 : 0,
    repScoreSnapshot: repScoreByCreator.get(creatorId) ?? 0,
  }));
}

export function computeMarketplaceMetric(
  paidOrders: OrderRow[],
  paidOrderItems: OrderItemRow[],
  refundedOrders: OrderRow[],
  newProducts: number,
  newUsers: number,
  activeSessions: number,
  window: PeriodWindow,
): MarketplaceMetricRow {
  const grossRevenueCents = paidOrders.reduce((sum, o) => sum + o.totalCents, 0);
  const platformFeeCents = paidOrderItems.reduce((sum, i) => sum + i.feeCents, 0);
  const refundsCents = refundedOrders.reduce((sum, o) => sum + o.totalCents, 0);

  return {
    periodStart: window.start,
    periodEnd: window.end,
    ordersCount: paidOrders.length,
    grossRevenueCents,
    platformFeeCents,
    refundsCents,
    newProducts,
    newUsers,
    activeSessions,
  };
}
