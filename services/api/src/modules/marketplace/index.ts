// marketplace module (§9, §5, §14): the spatial-discovery surface built on top of the products
// module's data — ranked search, the spatial discovery tree, featured listings, reviews (with
// review-manipulation + fake-engagement heuristics), wishlist, and cart. Orders/checkout live in
// ../orders + ../payments; this module stops at "what's in the cart", not "how it gets paid for".
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { ENGINE_TARGETS, GENRES, PRODUCT_CATEGORIES, type EngineTarget, type Genre, type ProductCategory } from '@sonic-gameworld/world-schema';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { detectFakeEngagement, raiseFraudSignal } from '../moderation/fraud.js';
import { flagForModeration } from '../moderation/index.js';
import { serializeProduct } from '../products/index.js';
import {
  compatibilityScore,
  conversionScore,
  rankProduct,
  recencyScore,
  retentionScore,
  sortByRank,
  userPrefScore,
} from '../recommendation/rank.js';
import { findMatchingProducts, paginateInMemory } from '../search/productSearch.js';
import { scoreReview, type RecentReview } from './reviewHeuristics.js';
import { buildSpatialMap, type MapProductInput } from './spatialMap.js';

const MarketplaceSearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().max(200).optional(),
  category: z.enum(PRODUCT_CATEGORIES as [ProductCategory, ...ProductCategory[]]).optional(),
  genre: z.enum(GENRES as [Genre, ...Genre[]]).optional(),
  engine: z.enum(ENGINE_TARGETS as [EngineTarget, ...EngineTarget[]]).optional(),
});

const FeaturedQuerySchema = z.object({ limit: z.coerce.number().int().positive().max(50).default(12) });

const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().min(1).max(5000),
});

const WishlistBodySchema = z.object({ productId: z.string() });
const AddCartItemSchema = z.object({ productId: z.string(), quantity: z.number().int().positive().max(20).default(1) });

// ---- serializers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeReview(row: any) {
  return {
    id: row.id,
    productId: row.productId,
    authorId: row.authorId,
    rating: row.rating,
    title: row.title ?? null,
    body: row.body,
    verifiedPurchase: row.verifiedPurchase,
    helpful: row.helpful,
    creatorReplyBody: row.creatorReplyBody ?? null,
    creatorReplyAt: row.creatorReplyAt ? new Date(row.creatorReplyAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// ---- helpers ----

/** A relevance-normalized §14 rank for `GET /marketplace/search`: text relevance (when `q` is
 * set) scaled into 0..100 against the batch's own max score; a neutral default otherwise so
 * category/genre browsing (no free-text query) still ranks sensibly by quality/reputation/recency. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rankSearchHit(app: FastifyInstance, product: any, relevance: number, filters: { engine?: EngineTarget; genre?: Genre }) {
  const creator = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
  return rankProduct({
    relevance,
    quality: (product.rating / 5) * 100,
    creatorReputation: creator?.repScore ?? 50,
    conversion: conversionScore(product.sales, 0),
    retention: retentionScore(product.rating, product.ratingCount),
    recency: recencyScore(product.publishedAt),
    compatibility: compatibilityScore(product.engines as string[], filters.engine),
    userPref: filters.genre ? userPrefScore(product.genre as string[], { [filters.genre]: 1 }) : 50,
  });
}

async function getOrCreateCart(app: FastifyInstance, userId: string) {
  const existing = await app.db.cart.findUnique({ where: { userId } });
  if (existing) return existing;
  return app.db.cart.create({ data: { userId, discountCents: 0, taxCents: 0 } });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serializeCart(app: FastifyInstance, cart: any) {
  const items = (await app.db.cartItem.findMany({ where: { cartId: cart.id } })) as Array<{
    id: string;
    productId: string;
    versionId: string | null;
    quantity: number;
    unitPriceCents: number;
  }>;
  const products = await Promise.all(items.map((i) => app.db.product.findUnique({ where: { id: i.productId } })));
  const lineItems = items.map((item, i) => {
    const product = products[i];
    return {
      id: item.id,
      productId: item.productId,
      product: product ? { id: product.id, slug: product.slug, name: product.name, thumbnailUrl: product.thumbnailUrl ?? null, priceCents: product.priceCents } : null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.unitPriceCents * item.quantity,
    };
  });
  const subtotalCents = lineItems.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const totalCents = Math.max(0, subtotalCents - cart.discountCents + cart.taxCents);
  return {
    id: cart.id,
    userId: cart.userId,
    items: lineItems,
    subtotalCents,
    discountCents: cart.discountCents,
    taxCents: cart.taxCents,
    totalCents,
    couponCode: cart.couponCode ?? null,
  };
}

/** Recompute Product.rating/ratingCount as a running mean including the just-created review. */
async function bumpProductRating(app: FastifyInstance, productId: string, newRating: number): Promise<void> {
  const product = await app.db.product.findUnique({ where: { id: productId } });
  if (!product) return;
  const nextCount = product.ratingCount + 1;
  const nextRating = (product.rating * product.ratingCount + newRating) / nextCount;
  await app.db.product.update({ where: { id: productId }, data: { rating: Math.round(nextRating * 100) / 100, ratingCount: nextCount } });
}

/** Best-effort fake-engagement scan over a product's whole review history, run after each new
 * review. Non-blocking: a scoring/DB hiccup here must never fail the review write itself. */
async function assessFakeEngagement(app: FastifyInstance, productId: string): Promise<void> {
  try {
    const reviews = (await app.db.review.findMany({ where: { productId } })) as Array<{ authorId: string; verifiedPurchase: boolean; rating: number; createdAt: Date | string }>;
    if (reviews.length < 5) return;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const reviewsInLast24h = reviews.filter((r) => new Date(r.createdAt).getTime() >= dayAgo).length;
    const verifiedPurchaseRatio = reviews.filter((r) => r.verifiedPurchase).length / reviews.length;
    const averageRating = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const distinctReviewerRatio = new Set(reviews.map((r) => r.authorId)).size / reviews.length;

    const result = detectFakeEngagement({ reviewCount: reviews.length, reviewsInLast24h, verifiedPurchaseRatio, averageRating, distinctReviewerRatio });
    if (result.risky) {
      await raiseFraudSignal(app, { result, refKind: 'PRODUCT', refId: productId });
    }
  } catch (err) {
    app.log.warn({ err, productId }, 'fake-engagement assessment failed (non-blocking)');
  }
}

export async function registerMarketplaceModule(app: FastifyInstance): Promise<void> {
  // ---- GET /marketplace/search — ranked (§14) search over the shared candidate resolver. ----
  app.get('/marketplace/search', async (request) => {
    const query = MarketplaceSearchQuerySchema.parse(request.query ?? {});
    const matches = await findMatchingProducts(app, query);
    const maxScore = Math.max(1e-9, ...matches.map((m) => m.score));
    const hasQuery = Boolean(query.q && query.q.trim().length > 0);

    const ranked = await Promise.all(
      matches.map(async (m) => ({
        product: m.product,
        breakdown: await rankSearchHit(app, m.product, hasQuery ? (m.score / maxScore) * 100 : 70, { engine: query.engine, genre: query.genre }),
      })),
    );
    const sorted = sortByRank(
      ranked.map((r) => ({ id: r.product.id, ...r })),
      (r) => r.breakdown.score,
    );

    const page = paginateInMemory(sorted, query);
    return { items: page.items.map((r) => ({ ...serializeProduct(r.product), rank: r.breakdown })), nextCursor: page.nextCursor };
  });

  // ---- GET /marketplace/map — the spatial discovery tree (§5 taxonomy). ----
  app.get('/marketplace/map', async () => {
    const products = (await app.db.product.findMany({ where: { status: 'PUBLISHED', deletedAt: null } })) as Array<{
      id: string;
      slug: string;
      name: string;
      refKind: string;
      genre: Genre[];
      priceCents: number;
      thumbnailUrl: string | null;
      rating: number;
      sales: number;
    }>;
    const input: MapProductInput[] = products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      refKind: p.refKind,
      genre: p.genre,
      priceCents: p.priceCents,
      thumbnailUrl: p.thumbnailUrl,
      rating: p.rating,
      sales: p.sales,
    }));
    return { buckets: buildSpatialMap(input) };
  });

  // ---- GET /marketplace/featured ----
  app.get('/marketplace/featured', async (request) => {
    const query = FeaturedQuerySchema.parse(request.query ?? {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = (await app.db.product.findMany({ where: { status: 'PUBLISHED', deletedAt: null, featured: true } })) as any[];
    const ranked = await Promise.all(products.map(async (product) => ({ product, breakdown: await rankSearchHit(app, product, 70, {}) })));
    const sorted = sortByRank(
      ranked.map((r) => ({ id: r.product.id, ...r })),
      (r) => r.breakdown.score,
    ).slice(0, query.limit);
    return { items: sorted.map((r) => ({ ...serializeProduct(r.product), rank: r.breakdown })) };
  });

  // ---- Reviews ----
  app.post('/products/:id/reviews', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: productId } = request.params as { id: string };
    const product = await app.db.product.findUnique({ where: { id: productId } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', productId);

    const body = CreateReviewSchema.parse(request.body);
    const authorId = request.user!.userId;

    const existing = await app.db.review.findFirst({ where: { productId, authorId } });
    if (existing) throw AppError.conflict('You have already reviewed this product');

    const paidItems = (await app.db.orderItem.findMany({ where: { productId } })) as Array<{ orderId: string }>;
    let verifiedPurchase = false;
    for (const item of paidItems) {
      const order = await app.db.order.findUnique({ where: { id: item.orderId } });
      if (order && order.buyerId === authorId && (order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED')) {
        verifiedPurchase = true;
        break;
      }
    }

    const recentRows = (await app.db.review.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: 50 })) as Array<{
      authorId: string;
      body: string;
      createdAt: Date;
    }>;
    const recent: RecentReview[] = recentRows.map((r) => ({ authorId: r.authorId, rating: 0, body: r.body, createdAt: r.createdAt }));
    const risk = scoreReview({ authorId, rating: body.rating, title: body.title, body: body.body, verifiedPurchase }, recent);

    const review = await app.db.review.create({
      data: { productId, authorId, rating: body.rating, title: body.title ?? null, body: body.body, verifiedPurchase, helpful: 0 },
    });
    await bumpProductRating(app, productId, body.rating);
    await app.bus.publish(createEvent({ type: 'REVIEW_CREATED', payload: { reviewId: review.id, productId, authorId, rating: body.rating, verifiedPurchase } }));

    // Every review body gets scanned (workers/moderation, queue `moderation.scan`), independent
    // of the immediate review-manipulation flag below — that heuristic is about fake-engagement
    // risk scoring, this is content moderation on the review text itself.
    await app.queues.moderationScan.add('scan', {
      refKind: 'REVIEW',
      refId: review.id,
      content: { text: [body.title, body.body].filter(Boolean).join('\n') },
    });

    if (risk.suspicious) {
      await flagForModeration(app, {
        refKind: 'REVIEW',
        refId: review.id,
        stage: 'REVIEW_MANIPULATION',
        reason: `Review risk score ${risk.score}: ${risk.flags.join(', ')}`,
        severity: risk.score >= 80 ? 'HIGH' : 'MEDIUM',
        reporterId: undefined,
      });
    }
    await assessFakeEngagement(app, productId);

    reply.status(201);
    return { ...serializeReview(review), riskScore: risk.score, riskFlags: risk.flags };
  });

  app.get('/products/:id/reviews', async (request) => {
    const { id: productId } = request.params as { id: string };
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = await app.db.review.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializeReview), query);
  });

  // ---- Wishlist ----
  app.post('/wishlist', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = WishlistBodySchema.parse(request.body);
    const userId = request.user!.userId;
    const product = await app.db.product.findUnique({ where: { id: body.productId } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', body.productId);

    const existing = await app.db.wishlistItem.findFirst({ where: { userId, productId: body.productId } });
    const item = existing ?? (await app.db.wishlistItem.create({ data: { userId, productId: body.productId, addedAt: new Date() } }));
    if (!existing) reply.status(201);
    return { id: item.id, userId: item.userId, productId: item.productId, addedAt: new Date(item.addedAt).toISOString() };
  });

  app.get('/wishlist', { preHandler: [app.authenticate] }, async (request) => {
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = (await app.db.wishlistItem.findMany({ where: { userId: request.user!.userId }, orderBy: { addedAt: 'desc' }, ...toPrismaPageArgs(query) })) as Array<{
      id: string;
      userId: string;
      productId: string;
      addedAt: Date;
    }>;
    const products = await Promise.all(rows.map((r) => app.db.product.findUnique({ where: { id: r.productId } })));
    return toPage(
      rows.map((r, i) => ({
        id: r.id,
        productId: r.productId,
        product: products[i] ? serializeProduct(products[i]) : null,
        addedAt: new Date(r.addedAt).toISOString(),
      })),
      query,
    );
  });

  app.delete('/wishlist/:productId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const existing = await app.db.wishlistItem.findFirst({ where: { userId: request.user!.userId, productId } });
    if (existing) await app.db.wishlistItem.delete({ where: { id: existing.id } });
    reply.status(204);
    return null;
  });

  // ---- Cart ----
  app.get('/cart', { preHandler: [app.authenticate] }, async (request) => {
    const cart = await getOrCreateCart(app, request.user!.userId);
    return serializeCart(app, cart);
  });

  app.post('/cart/items', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = AddCartItemSchema.parse(request.body);
    const userId = request.user!.userId;
    const product = await app.db.product.findUnique({ where: { id: body.productId } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', body.productId);
    if (product.status !== 'PUBLISHED') throw AppError.badRequest(`Product '${product.name}' is not currently available for purchase`);

    const cart = await getOrCreateCart(app, userId);
    const existing = await app.db.cartItem.findFirst({ where: { cartId: cart.id, productId: body.productId } });
    if (existing) {
      await app.db.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + body.quantity, unitPriceCents: product.priceCents } });
    } else {
      await app.db.cartItem.create({ data: { cartId: cart.id, productId: body.productId, quantity: body.quantity, unitPriceCents: product.priceCents, addedAt: new Date() } });
    }
    await app.db.cart.update({ where: { id: cart.id }, data: {} }); // bump updatedAt

    reply.status(201);
    return serializeCart(app, cart);
  });

  app.delete('/cart/items/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await app.db.cartItem.findUnique({ where: { id } });
    if (!item) throw AppError.notFound('Cart item', id);
    const cart = await app.db.cart.findUnique({ where: { id: item.cartId } });
    if (!cart || cart.userId !== request.user!.userId) throw AppError.forbidden();

    await app.db.cartItem.delete({ where: { id } });
    reply.status(200);
    return serializeCart(app, cart);
  });
}
