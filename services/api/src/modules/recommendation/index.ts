// recommendation module (§9, §14): `GET /recommendations` (purchase history + genre affinity,
// ranked by `rankProduct`) and `GET /recommendations/similar/:productId` (pgvector cosine over
// `SearchDocument.embedding` when it's populated, else tag/genre overlap). The ranking *formula*
// lives in `rank.ts` (pure, exhaustively unit-tested); this file is the policy of how each
// `RankInputs` component is derived for the "recommendations" call site specifically.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema } from '../../plugins/pagination.js';
import { serializeProduct } from '../products/index.js';
import { paginateInMemory } from '../search/productSearch.js';
import { compatibilityScore, conversionScore, rankProduct, recencyScore, retentionScore, sortByRank, userPrefScore } from './rank.js';

const RecommendationsQuerySchema = PaginationQuerySchema.extend({
  engine: z.string().optional(),
});

const SimilarQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(12),
});

/** Genre affinity weights (0..1, normalized by the most-purchased genre) from a buyer's purchased
 * products' genre tags. Empty history -> empty map (every candidate reads as neutral, see
 * `userPrefScore`'s `{}` case). */
function computeGenreAffinity(purchasedGenres: string[][]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const genres of purchasedGenres) {
    for (const g of genres) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  if (max === 0) return {};
  const affinity: Record<string, number> = {};
  for (const [g, c] of counts) affinity[g] = c / max;
  return affinity;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rankCandidate(app: FastifyInstance, product: any, genreAffinity: Record<string, number>, targetEngine?: string) {
  const creator = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
  const userPref = userPrefScore(product.genre as string[], genreAffinity);
  const breakdown = rankProduct({
    // No free-text query drives this endpoint — genre-affinity match against the buyer's own
    // history *is* the relevance signal here, unlike marketplace/search's text-relevance score.
    relevance: userPref,
    quality: (product.rating / 5) * 100,
    creatorReputation: creator?.repScore ?? 50,
    conversion: conversionScore(product.sales, 0),
    retention: retentionScore(product.rating, product.ratingCount),
    recency: recencyScore(product.publishedAt),
    compatibility: compatibilityScore(product.engines as string[], targetEngine),
    userPref,
  });
  return breakdown;
}

/** True cosine-similarity lookup via pgvector when both products have a populated `embedding`.
 * Returns `[]` (never throws) so the caller can fall back to tag/genre overlap — this covers both
 * "no embeddings generated yet" and "pgvector/the extension isn't available in this environment". */
async function embeddingSimilar(app: FastifyInstance, productId: string, limit: number): Promise<Array<{ id: string; score: number }>> {
  try {
    const rows = (await app.db.$queryRawUnsafe(
      `SELECT b."refId" as id, 1 - (a.embedding <=> b.embedding) as score
       FROM "SearchDocument" a, "SearchDocument" b
       WHERE a."refId" = $1 AND a.kind = 'product' AND b.kind = 'product' AND b."refId" != $1
         AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
       ORDER BY a.embedding <=> b.embedding
       LIMIT $2`,
      productId,
      limit,
    )) as Array<{ id: string; score: number }>;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Fallback similarity: Jaccard overlap of `tags ∪ genre`, plus a flat bonus for a matching
 * `category`. Pure and cheap enough to run over every other published product in the catalog. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tagGenreOverlapScore(target: any, candidate: any): number {
  const a = new Set<string>([...(target.tags as string[]), ...(target.genre as string[])].map((s) => s.toLowerCase()));
  const b = new Set<string>([...(candidate.tags as string[]), ...(candidate.genre as string[])].map((s) => s.toLowerCase()));
  if (a.size === 0 || b.size === 0) return candidate.category === target.category ? 0.15 : 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection += 1;
  const union = a.size + b.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;
  return jaccard + (candidate.category === target.category ? 0.15 : 0);
}

export async function registerRecommendationModule(app: FastifyInstance): Promise<void> {
  // GET /recommendations — the caller's own purchase-history-driven feed.
  app.get('/recommendations', { preHandler: [app.authenticate] }, async (request) => {
    const query = RecommendationsQuerySchema.parse(request.query ?? {});
    const buyerId = request.user!.userId;

    const paidOrders = (await app.db.order.findMany({ where: { buyerId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } })) as Array<{ id: string }>;
    const orderIds = paidOrders.map((o) => o.id);
    const purchasedItems = orderIds.length > 0 ? await app.db.orderItem.findMany({ where: { orderId: { in: orderIds } } }) : [];
    const purchasedProductIds = [...new Set((purchasedItems as Array<{ productId: string }>).map((i) => i.productId))];
    const purchasedProducts = (await Promise.all(purchasedProductIds.map((id) => app.db.product.findUnique({ where: { id } })))).filter(Boolean) as Array<{ genre: string[] }>;
    const genreAffinity = computeGenreAffinity(purchasedProducts.map((p) => p.genre));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = (await app.db.product.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, id: { notIn: purchasedProductIds } },
    })) as any[];

    const ranked = await Promise.all(
      candidates.map(async (product) => ({ product, breakdown: await rankCandidate(app, product, genreAffinity, query.engine) })),
    );
    const sorted = sortByRank(
      ranked.map((r) => ({ id: r.product.id, ...r })),
      (r) => r.breakdown.score,
    );

    const page = paginateInMemory(
      sorted.map((r) => ({ id: r.product.id, product: r.product, breakdown: r.breakdown })),
      query,
    );
    return {
      items: page.items.map((r) => ({ ...serializeProduct(r.product), rank: r.breakdown })),
      nextCursor: page.nextCursor,
    };
  });

  // GET /recommendations/similar/:productId — pgvector cosine when embeddings exist, else tag/genre overlap.
  app.get('/recommendations/similar/:productId', async (request) => {
    const { productId } = request.params as { productId: string };
    const query = SimilarQuerySchema.parse(request.query ?? {});
    const target = await app.db.product.findUnique({ where: { id: productId } });
    if (!target || target.deletedAt) throw AppError.notFound('Product', productId);

    const vecHits = await embeddingSimilar(app, productId, query.limit);
    if (vecHits.length > 0) {
      const products = await Promise.all(vecHits.map((h) => app.db.product.findUnique({ where: { id: h.id } })));
      const items = vecHits
        .map((h, i) => ({ product: products[i], score: h.score }))
        .filter((r) => r.product && !r.product.deletedAt && r.product.status === 'PUBLISHED');
      return { method: 'EMBEDDING', items: items.map((r) => ({ ...serializeProduct(r.product), similarity: r.score })) };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const others = (await app.db.product.findMany({ where: { status: 'PUBLISHED', deletedAt: null, id: { not: productId } } })) as any[];
    const scored = others
      .map((candidate) => ({ product: candidate, score: tagGenreOverlapScore(target, candidate) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.product.id.localeCompare(b.product.id))
      .slice(0, query.limit);

    return { method: 'TAG_OVERLAP', items: scored.map((r) => ({ ...serializeProduct(r.product), similarity: Math.round(r.score * 1000) / 1000 })) };
  });
}
