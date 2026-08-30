// Creator reputation scoring — CONTRACTS.md §14:
//   creatorScore = weighted(quality .2, reliability .15, sales .15, updates .1, reviews .15,
//                            support .1, originality .1, compliance .05) -> 0..100
// `CreatorProfile`'s schema comment calls this out explicitly: "Cached reputation breakdown (§14)
// — recomputed by analytics workers." This module is that computation: pure, deterministic, and
// unit-tested (per §14's "deterministic, unit-tested" requirement) — src/index.ts is the only
// place that touches Prisma to gather the raw signals and write the result back.
export interface CreatorSignals {
  /** Average product rating across the creator's listings, 0..5 (0 when no reviews exist yet). */
  avgRating: number;
  /** Fraction of the creator's orders that were refunded/partially refunded, 0..1. */
  refundRatePct: number;
  /** Total lifetime unit sales across the creator's products. */
  totalSales: number;
  /** Product version publish rate, in versions per product per year (update cadence). */
  versionsPerProductPerYear: number;
  /** Review volume within the reputation lookback window. */
  reviewCountRecent: number;
  /** Fraction of reviews the creator replied to, 0..1. */
  replyRatePct: number;
  /** Fraction of the creator's assets whose passport.source is ORIGINAL (vs IMPORTED/REMIX), 0..1. */
  originalRatioPct: number;
  /** Count of MEDIUM+ severity ModerationItems against the creator's listings within the lookback window. */
  complianceViolations: number;
  /** Total listings (products) the compliance violation count is normalized against. */
  totalListings: number;
}

export interface ReputationBreakdown {
  repQuality: number;
  repReliability: number;
  repSales: number;
  repUpdates: number;
  repReviews: number;
  repSupport: number;
  repOriginality: number;
  repCompliance: number;
  repScore: number;
}

const WEIGHTS = { quality: 0.2, reliability: 0.15, sales: 0.15, updates: 0.1, reviews: 0.15, support: 0.1, originality: 0.1, compliance: 0.05 } as const;

// Saturation points: the signal value at which that sub-score hits 100. Chosen to reward growth
// without requiring implausibly large numbers from a single creator to max out.
const SALES_SATURATION = 500;
const UPDATES_SATURATION_PER_YEAR = 6;
const REVIEWS_SATURATION = 50;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function computeCreatorReputation(signals: CreatorSignals): ReputationBreakdown {
  const repQuality = clamp((signals.avgRating / 5) * 100);
  const repReliability = clamp((1 - clamp(signals.refundRatePct, 0, 1)) * 100);
  const repSales = clamp((signals.totalSales / SALES_SATURATION) * 100);
  const repUpdates = clamp((signals.versionsPerProductPerYear / UPDATES_SATURATION_PER_YEAR) * 100);
  const repReviews = clamp((signals.reviewCountRecent / REVIEWS_SATURATION) * 100);
  const repSupport = clamp(clamp(signals.replyRatePct, 0, 1) * 100);
  const repOriginality = clamp(clamp(signals.originalRatioPct, 0, 1) * 100);
  // Each compliance violation costs twice its share of total listings, so a creator with several
  // upheld violations against a small catalog is penalized meaningfully rather than negligibly.
  const repCompliance = signals.totalListings > 0 ? clamp(100 - (signals.complianceViolations / signals.totalListings) * 200) : 100;

  const repScore = Math.round(
    repQuality * WEIGHTS.quality +
      repReliability * WEIGHTS.reliability +
      repSales * WEIGHTS.sales +
      repUpdates * WEIGHTS.updates +
      repReviews * WEIGHTS.reviews +
      repSupport * WEIGHTS.support +
      repOriginality * WEIGHTS.originality +
      repCompliance * WEIGHTS.compliance,
  );

  return {
    repQuality: Math.round(repQuality),
    repReliability: Math.round(repReliability),
    repSales: Math.round(repSales),
    repUpdates: Math.round(repUpdates),
    repReviews: Math.round(repReviews),
    repSupport: Math.round(repSupport),
    repOriginality: Math.round(repOriginality),
    repCompliance: Math.round(repCompliance),
    repScore: clamp(repScore),
  };
}
