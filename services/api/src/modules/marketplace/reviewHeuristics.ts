// Review-manipulation heuristics: a pure, unit-testable risk score over one incoming review plus
// the product's recent review history. Used by `POST /products/:id/reviews` to decide whether to
// auto-flag a `ModerationItem` (refKind REVIEW) alongside accepting the review — manipulation
// suspicion never blocks the write itself, only routes it into the moderation queue.
export interface ReviewInput {
  authorId: string;
  rating: number;
  title?: string | null;
  body: string;
  verifiedPurchase: boolean;
}

export interface RecentReview {
  authorId: string;
  rating: number;
  body: string;
  createdAt: Date | string;
}

export interface ReviewRiskResult {
  score: number; // 0..100
  flags: string[];
  suspicious: boolean;
}

const SUSPICION_THRESHOLD = 50;
const BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Score a review 0 (clean) .. 100 (near-certain manipulation) against the product's recent
 * review history. Every signal is additive and capped, so the result stays interpretable.
 */
export function scoreReview(input: ReviewInput, recent: RecentReview[], now: Date = new Date()): ReviewRiskResult {
  const flags: string[] = [];
  let score = 0;

  // Not a verified purchase — the single most common manipulation vector (paid/fake reviews).
  if (!input.verifiedPurchase) {
    score += 20;
    flags.push('UNVERIFIED_PURCHASE');
  }

  // Extreme rating (1 or 5) with a very short body reads as low-effort astroturfing/brigading.
  const bodyLen = input.body.trim().length;
  if ((input.rating === 1 || input.rating === 5) && bodyLen < 20) {
    score += 15;
    flags.push('EXTREME_RATING_LOW_EFFORT');
  }

  // Same author reviewing the same product again — one review per purchase is expected.
  const sameAuthor = recent.filter((r) => r.authorId === input.authorId);
  if (sameAuthor.length > 0) {
    score += 25;
    flags.push('DUPLICATE_AUTHOR');
  }

  // A burst of reviews (from anyone) in a short window suggests a coordinated campaign rather
  // than organic, spread-out feedback.
  const nowMs = now.getTime();
  const burst = recent.filter((r) => nowMs - new Date(r.createdAt).getTime() <= BURST_WINDOW_MS);
  if (burst.length >= 5) {
    score += 20;
    flags.push('REVIEW_BURST');
  }

  // Near-duplicate text against any recent review — a copy-pasted template is a strong fake signal.
  const nearDuplicate = recent.some((r) => jaccardSimilarity(r.body, input.body) >= 0.8);
  if (nearDuplicate) {
    score += 30;
    flags.push('NEAR_DUPLICATE_TEXT');
  }

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, flags, suspicious: clamped >= SUSPICION_THRESHOLD };
}
