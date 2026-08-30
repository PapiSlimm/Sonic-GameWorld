// All Prisma reads for one rollup run, grouped here so rollups.ts/reputationSignals.ts stay pure
// and independently testable. Every fetch is scoped as tightly as the model allows (an `in` list
// of ids, or a date-range `where`) — nothing here does an unbounded `findMany({})` on a table that
// can grow without bound in production.
//
// PrismaLike's delegates are loosely typed (`Record<string, any>` rows, matching how every other
// worker in this repo treats its PrismaLike surface) so the interface stays satisfied by both the
// real generated client and simple test fakes. That means each fetch below needs an explicit cast
// to the narrower row shape rollups.ts/reputationSignals.ts actually consume — `Record<string,
// any>` is deliberately NOT structurally assignable to a specific interface in strict mode, so
// this file is the one place that makes the "trust me, the query's `where`/`select` shape matches"
// assertion, once per fetch, rather than every consumer re-asserting it.
import type { PeriodWindow, PrismaLike } from './types.js';
import type { AnalyticsEventRow, OrderItemRow, OrderRow, ProductRow, ReviewRow, SessionPlayerRow, SessionRow } from './rollups.js';
import type { AssetLite, AssetPassportLite, ModerationItemLite, OrderItemLite, OrderLite, ProductLite, ProductVersionLite, ReviewLite } from './reputationSignals.js';

function range(window: PeriodWindow) {
  return { gte: window.start, lt: window.end };
}

export async function fetchHourlyActivity(prisma: PrismaLike, window: PeriodWindow) {
  const sessionPlayers = (await prisma.gameSessionPlayer.findMany({ where: { joinedAt: range(window) } })) as unknown as SessionPlayerRow[];
  const sessionIds = [...new Set(sessionPlayers.map((sp) => sp.sessionId))];

  const [sessionsByPlayerIds, sessionsStartedOrEnded, events] = (await Promise.all([
    sessionIds.length > 0 ? prisma.gameSession.findMany({ where: { id: { in: sessionIds } } }) : Promise.resolve([]),
    prisma.gameSession.findMany({ where: { OR: [{ startedAt: range(window) }, { endedAt: range(window) }] } }),
    prisma.analyticsEvent.findMany({ where: { timestamp: range(window) } }),
  ])) as unknown as [SessionRow[], SessionRow[], AnalyticsEventRow[]];

  const sessionsById = new Map<string, SessionRow>();
  for (const s of [...sessionsByPlayerIds, ...sessionsStartedOrEnded]) sessionsById.set(s.id, s);

  return { sessionPlayers, sessions: [...sessionsById.values()], events };
}

export async function fetchPaidCommerce(prisma: PrismaLike, window: PeriodWindow) {
  const paidOrders = (await prisma.order.findMany({ where: { status: 'PAID', paidAt: range(window) } })) as unknown as OrderRow[];
  const orderIds = paidOrders.map((o) => o.id);
  const paidOrderItems = (orderIds.length > 0 ? await prisma.orderItem.findMany({ where: { orderId: { in: orderIds } } }) : []) as unknown as OrderItemRow[];
  const productIds = [...new Set(paidOrderItems.map((i) => i.productId))];
  const products = (productIds.length > 0 ? await prisma.product.findMany({ where: { id: { in: productIds } } }) : []) as unknown as ProductRow[];
  return { paidOrders, paidOrderItems, products };
}

export async function fetchRefundedOrders(prisma: PrismaLike, window: PeriodWindow): Promise<OrderRow[]> {
  const rows = await prisma.order.findMany({ where: { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] }, refundedAt: range(window) } });
  return rows as unknown as OrderRow[];
}

export async function fetchReviewsInWindow(prisma: PrismaLike, window: PeriodWindow): Promise<ReviewRow[]> {
  const rows = await prisma.review.findMany({ where: { createdAt: range(window) } });
  return rows as unknown as ReviewRow[];
}

export async function fetchMarketplaceCounts(prisma: PrismaLike, window: PeriodWindow) {
  const [newProducts, newUsers] = await Promise.all([
    prisma.product.findMany({ where: { createdAt: range(window) } }),
    prisma.user.count({ where: { createdAt: range(window) } }),
  ]);
  return { newProductsCount: newProducts.length, newUsersCount: newUsers };
}

/** Gathers everything reputationSignals.ts needs, scoped to the trailing `lookbackDays` window
 * (independent of the hourly rollup window). Every creator with at least one product or asset is
 * included, even ones with zero activity this window, so their `repScore` keeps decaying/staying
 * current rather than only updating during active hours. */
export async function fetchReputationInputs(prisma: PrismaLike, lookbackStart: Date, lookbackDays: number) {
  const creatorProfiles = await prisma.creatorProfile.findMany({ where: { deletedAt: null } });
  const creatorIds = creatorProfiles.map((c) => c.id as string);
  if (creatorIds.length === 0) {
    return {
      creatorProfiles,
      products: [] as ProductLite[],
      assets: [] as AssetLite[],
      orders: [] as OrderLite[],
      orderItems: [] as OrderItemLite[],
      reviews: [] as ReviewLite[],
      productVersions: [] as ProductVersionLite[],
      assetPassports: [] as AssetPassportLite[],
      moderationItems: [] as ModerationItemLite[],
      lookbackYears: lookbackDays / 365,
    };
  }

  const products = (await prisma.product.findMany({ where: { creatorId: { in: creatorIds } } })) as unknown as ProductLite[];
  const rawAssets = (await prisma.asset.findMany({ where: { creatorId: { in: creatorIds } } })) as unknown as AssetLite[];
  const assets: AssetLite[] = rawAssets.map((a) => ({ id: a.id, creatorId: a.creatorId }));
  const productIds = products.map((p) => p.id);
  const assetIds = assets.map((a) => a.id);

  const [orderItems, reviews, productVersions, assetPassportsRaw, moderationItems] = (await Promise.all([
    productIds.length > 0 ? prisma.orderItem.findMany({ where: { productId: { in: productIds } } }) : Promise.resolve([]),
    productIds.length > 0 ? prisma.review.findMany({ where: { productId: { in: productIds }, createdAt: { gte: lookbackStart } } }) : Promise.resolve([]),
    productIds.length > 0 ? prisma.productVersion.findMany({ where: { productId: { in: productIds }, createdAt: { gte: lookbackStart } } }) : Promise.resolve([]),
    assetIds.length > 0 ? prisma.assetPassport.findMany({ where: { assetId: { in: assetIds } } }) : Promise.resolve([]),
    [...productIds, ...assetIds].length > 0
      ? prisma.moderationItem.findMany({ where: { refId: { in: [...productIds, ...assetIds] }, createdAt: { gte: lookbackStart } } })
      : Promise.resolve([]),
  ])) as unknown as [OrderItemLite[], ReviewLite[], ProductVersionLite[], { assetId: string; data?: { source?: string } }[], ModerationItemLite[]];

  const orderIds = [...new Set(orderItems.map((i) => i.orderId))];
  const orders = (orderIds.length > 0 ? await prisma.order.findMany({ where: { id: { in: orderIds } } }) : []) as unknown as OrderLite[];

  const assetPassports: AssetPassportLite[] = assetPassportsRaw.map((ap) => ({ assetId: ap.assetId, source: ap.data?.source ?? null }));

  return { creatorProfiles, products, assets, orders, orderItems, reviews, productVersions, assetPassports, moderationItems, lookbackYears: lookbackDays / 365 };
}
