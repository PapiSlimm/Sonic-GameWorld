// Creator reputation (§14 of CONTRACTS.md):
//   creatorScore = weighted(quality .2, reliability .15, sales .15, updates .1,
//                           reviews .15, support .1, originality .1, compliance .05)  → 0..100
//
// `computeCreatorScore` is the pure, unit-tested formula. `gatherReputationInputs` derives the
// eight 0..100 component scores from the database — it encodes the *policy* of what "quality"
// or "support" means in terms of our schema, and is intentionally kept separate so the math
// itself stays trivially testable without a database.
import type { PrismaLike } from '../../db.js';

export const REPUTATION_WEIGHTS = {
  quality: 0.2,
  reliability: 0.15,
  sales: 0.15,
  updates: 0.1,
  reviews: 0.15,
  support: 0.1,
  originality: 0.1,
  compliance: 0.05,
} as const;

export type ReputationComponent = keyof typeof REPUTATION_WEIGHTS;

export type ReputationInputs = Record<ReputationComponent, number>;

export interface ReputationBreakdown extends ReputationInputs {
  score: number;
  computedAt: string;
}

/** Clamp a raw component score into the valid 0..100 range (also guards NaN from empty-data divides). */
export function clampScore(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Pure, deterministic reputation formula from §14. No I/O — safe to unit test exhaustively. */
export function computeCreatorScore(inputs: ReputationInputs, computedAt: string = new Date().toISOString()): ReputationBreakdown {
  const clamped = Object.fromEntries(
    (Object.keys(REPUTATION_WEIGHTS) as ReputationComponent[]).map((key) => [key, clampScore(inputs[key])]),
  ) as ReputationInputs;

  const score = (Object.keys(REPUTATION_WEIGHTS) as ReputationComponent[]).reduce(
    (sum, key) => sum + clamped[key] * REPUTATION_WEIGHTS[key],
    0,
  );

  return { ...clamped, score: Math.round(score * 100) / 100, computedAt };
}

const SALES_TARGET = 200; // sales count that maps to a full 100-point sales score
const UPDATES_TARGET = 10; // product-version count that maps to a full 100-point updates score

/** Derive the eight component inputs for a creator from the database. Every branch degrades to a
 * neutral-to-generous default when there isn't enough data yet (new creators shouldn't be
 * penalized for having no history). */
export async function gatherReputationInputs(prisma: PrismaLike, creatorId: string): Promise<ReputationInputs> {
  const products = (await prisma.product.findMany({ where: { creatorId } })) as Array<{
    id: string;
    rating: number;
    ratingCount: number;
    sales: number;
    status: string;
  }>;
  const productIds = products.map((p) => p.id);

  const totalSales = products.reduce((sum, p) => sum + p.sales, 0);
  const ratedProducts = products.filter((p) => p.ratingCount > 0);
  const avgRating = ratedProducts.length > 0 ? ratedProducts.reduce((sum, p) => sum + p.rating, 0) / ratedProducts.length : undefined;
  const totalRatingCount = products.reduce((sum, p) => sum + p.ratingCount, 0);

  const versionCount =
    productIds.length > 0
      ? await prisma.productVersion.count({ where: { productId: { in: productIds } } })
      : 0;

  const reviews =
    productIds.length > 0 ? ((await prisma.review.findMany({ where: { productId: { in: productIds } } })) as Array<{ creatorReplyBody: string | null }>) : [];
  const respondedCount = reviews.filter((r) => r.creatorReplyBody !== null).length;

  const payouts = (await prisma.payout.findMany({ where: { creatorId } })) as Array<{ status: string }>;
  const resolvedPayouts = payouts.filter((p) => p.status === 'SENT' || p.status === 'FAILED' || p.status === 'CANCELLED');
  const successfulPayouts = payouts.filter((p) => p.status === 'SENT').length;

  const moderationHits =
    productIds.length > 0
      ? await prisma.moderationItem.count({ where: { refKind: 'PRODUCT', refId: { in: productIds }, status: 'REJECTED' } })
      : 0;

  // quality: average published-product rating (0..5) rescaled to 0..100; neutral 70 for brand-new creators.
  const quality = avgRating !== undefined ? clampScore(avgRating * 20) : 70;

  // reliability: share of requested payouts that were actually sent (not failed/cancelled); no
  // payout history yet is treated as fully reliable (nothing has gone wrong).
  const reliability = resolvedPayouts.length > 0 ? clampScore((successfulPayouts / resolvedPayouts.length) * 100) : 100;

  // sales: total unit sales across all products, scaled against a target volume.
  const sales = clampScore((totalSales / SALES_TARGET) * 100);

  // updates: how actively the creator ships new versions, scaled against a target cadence.
  const updates = clampScore((versionCount / UPDATES_TARGET) * 100);

  // reviews: blends satisfaction (avg rating) with engagement volume (rating count), capped.
  const reviewsScore = avgRating !== undefined ? clampScore((avgRating / 5) * 70 + Math.min(30, totalRatingCount)) : 50;

  // support: how often the creator replies to reviews; generous default when there's nothing to reply to yet.
  const support = reviews.length > 0 ? clampScore((respondedCount / reviews.length) * 100) : 80;

  // originality: no first-class signal yet at this layer (would come from AssetPassport.source
  // across the creator's asset-backed products) — default to a neutral score until the asset
  // pipeline (owned by another module) exposes it here.
  const originality = 70;

  // compliance: start at 100, lose 15 points per rejected/removed product, floor at 0.
  const compliance = clampScore(100 - moderationHits * 15);

  return { quality, reliability, sales, updates, reviews: reviewsScore, support, originality, compliance };
}
