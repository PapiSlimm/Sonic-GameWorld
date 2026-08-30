// Ranking engine (§14 of CONTRACTS.md):
//   rankProduct = relevance*.25 + quality*.15 + creatorReputation*.15 + conversion*.1
//               + retention*.1 + recency*.1 + compatibility*.1 + userPref*.05
//
// Same split as creator/reputation.ts: `rankProduct` is the pure, exhaustively-unit-tested
// formula; `RankInputs` are plain 0..100 numbers so this file has zero database/Fastify
// dependencies. The `gather*` helpers in `../marketplace/index.ts` and
// `../recommendation/index.ts` are the *policy* of how each input is derived per call site
// (search relevance score vs. purchase-history affinity), kept out of this file on purpose.
export const RANK_WEIGHTS = {
  relevance: 0.25,
  quality: 0.15,
  creatorReputation: 0.15,
  conversion: 0.1,
  retention: 0.1,
  recency: 0.1,
  compatibility: 0.1,
  userPref: 0.05,
} as const;

export type RankComponent = keyof typeof RANK_WEIGHTS;
export type RankInputs = Record<RankComponent, number>;

export interface RankBreakdown extends RankInputs {
  score: number;
  computedAt: string;
}

/** Clamp a raw component score into 0..100 (also guards NaN from empty-data divides). */
export function clampRankScore(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Pure, deterministic §14 ranking formula. No I/O — safe to unit test exhaustively. */
export function rankProduct(inputs: RankInputs, computedAt: string = new Date().toISOString()): RankBreakdown {
  const clamped = Object.fromEntries((Object.keys(RANK_WEIGHTS) as RankComponent[]).map((key) => [key, clampRankScore(inputs[key])])) as RankInputs;

  const score = (Object.keys(RANK_WEIGHTS) as RankComponent[]).reduce((sum, key) => sum + clamped[key] * RANK_WEIGHTS[key], 0);

  return { ...clamped, score: Math.round(score * 100) / 100, computedAt };
}

/** Sort a list of `{ id, ... }` items by their already-computed rank score, descending, with a
 * stable tie-break on `id` so ordering is deterministic across ties. */
export function sortByRank<T extends { id: string }>(items: T[], scoreOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a) || a.id.localeCompare(b.id));
}

// ---- Reusable component derivations (pure — no DB) ----

/** Recency component: 100 at publish time, decaying to 0 over `halfLifeDays`-scaled linear falloff. */
export function recencyScore(publishedAt: Date | string | null, now: Date = new Date(), halfLifeDays = 90): number {
  if (!publishedAt) return 0;
  const ageDays = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 100;
  return clampRankScore(100 * Math.exp(-ageDays / halfLifeDays));
}

/** Conversion component: views-to-sales ratio scaled against a healthy-conversion target. */
export function conversionScore(sales: number, views: number, target = 0.1): number {
  if (views <= 0) return sales > 0 ? 100 : 50; // no view data yet — neutral-to-generous default
  return clampRankScore((sales / views / target) * 100);
}

/** Retention component: proxy from rating + rating volume when no session-replay data exists yet. */
export function retentionScore(rating: number, ratingCount: number): number {
  if (ratingCount === 0) return 50;
  return clampRankScore((rating / 5) * 80 + Math.min(20, ratingCount / 2));
}

/** Compatibility component: 100 when the requested engine is supported, 0 when not, 60 when no
 * target engine was specified (unknown, so neither penalize nor reward). */
export function compatibilityScore(productEngines: string[], targetEngine?: string): number {
  if (!targetEngine) return 60;
  if (productEngines.includes(targetEngine)) return 100;
  return productEngines.includes('WEB') ? 70 : 0;
}

/** userPref component: overlap between the viewer's genre affinity weights (0..1 each) and the
 * product's genres. */
export function userPrefScore(productGenres: string[], genreAffinity: Record<string, number>): number {
  if (productGenres.length === 0 || Object.keys(genreAffinity).length === 0) return 50;
  const weights = productGenres.map((g) => genreAffinity[g] ?? 0);
  const best = Math.max(...weights);
  return clampRankScore(best * 100);
}
