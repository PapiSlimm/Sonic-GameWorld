// Anti-fraud module: payment risk scoring, purchase-anomaly + refund-abuse + fake-engagement
// detection, and the write-side that turns a high score into a `FRAUD_SIGNAL` event + a payout
// hold. Every *score*/*detect* function here is pure (plain numbers/arrays in, a verdict out) so
// the heuristics are unit-testable without touching the database; `assessOrderRisk` /
// `assessRefundAbuse` / `placePayoutHold` are the thin DB/bus-touching orchestration around them,
// called from `orders/fulfillment.ts` on payment and on refund.
import { createEvent } from '@sonic-gameworld/events';
import type { FastifyInstance } from 'fastify';

export interface RiskResult {
  score: number; // 0..100
  signals: string[];
  risky: boolean;
}

// 40, not a rounder 50/60: the lightest single strong signal this module raises on its own
// (detectRefundAbuse's REFUND_BURST) scores exactly 40, and two-moderate-signal combinations
// elsewhere (e.g. BRAND_NEW_ACCOUNT + AMOUNT_FAR_ABOVE_HISTORY, or HIGH_ORDER_VELOCITY +
// REPEATED_PAYMENT_FAILURES) land at 55 — both are meant to cross the line into "risky" on their
// own, without requiring a third corroborating signal. See fraud.test.ts for the exact cases this
// threshold is pinned against.
const RISK_THRESHOLD = 40;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function toRisk(score: number, signals: string[]): RiskResult {
  const clamped = clamp(score);
  return { score: clamped, signals, risky: clamped >= RISK_THRESHOLD };
}

// ---- Payment risk score ----
export interface PaymentRiskInput {
  accountAgeHours: number;
  orderAmountCents: number;
  buyerAvgOrderCents: number; // historical average for this buyer; 0 if no history
  ordersInLast24h: number;
  failedPaymentsInLast24h: number;
}

/** Composite payment-risk score for a single order at checkout time. */
export function computePaymentRiskScore(input: PaymentRiskInput): RiskResult {
  const signals: string[] = [];
  let score = 0;

  if (input.accountAgeHours < 1) {
    score += 30;
    signals.push('BRAND_NEW_ACCOUNT');
  } else if (input.accountAgeHours < 24) {
    score += 15;
    signals.push('NEW_ACCOUNT');
  }

  if (input.buyerAvgOrderCents > 0 && input.orderAmountCents > input.buyerAvgOrderCents * 5) {
    score += 25;
    signals.push('AMOUNT_FAR_ABOVE_HISTORY');
  }

  if (input.ordersInLast24h >= 5) {
    score += 25;
    signals.push('HIGH_ORDER_VELOCITY');
  } else if (input.ordersInLast24h >= 3) {
    score += 10;
    signals.push('ELEVATED_ORDER_VELOCITY');
  }

  if (input.failedPaymentsInLast24h >= 3) {
    score += 30;
    signals.push('REPEATED_PAYMENT_FAILURES');
  }

  return toRisk(score, signals);
}

// ---- Purchase anomaly ----
export interface PurchaseAnomalyInput {
  buyerId: string;
  creatorUserId: string; // the seller behind the product being purchased
  orderAmountCents: number;
  buyerCreatorOrderCountLast30d: number; // how many times this buyer has bought from this creator recently
}

/** Flags self-dealing / wash-trading patterns: a buyer repeatedly purchasing from the same
 * creator (most suspiciously, the creator buying their own product). */
export function detectPurchaseAnomaly(input: PurchaseAnomalyInput): RiskResult {
  const signals: string[] = [];
  let score = 0;

  if (input.buyerId === input.creatorUserId) {
    score += 90;
    signals.push('SELF_PURCHASE');
  }
  if (input.buyerCreatorOrderCountLast30d >= 5) {
    score += 40;
    signals.push('REPEAT_BUYER_SAME_CREATOR');
  } else if (input.buyerCreatorOrderCountLast30d >= 3) {
    score += 20;
    signals.push('ELEVATED_REPEAT_BUYER_SAME_CREATOR');
  }

  return toRisk(score, signals);
}

// ---- Refund abuse ----
export interface RefundAbuseInput {
  totalOrders: number;
  refundedOrders: number;
  refundsInLast24h: number;
}

/** Flags a buyer whose refund rate or refund velocity looks like abuse (serial "buy, use, refund"). */
export function detectRefundAbuse(input: RefundAbuseInput): RiskResult {
  const signals: string[] = [];
  let score = 0;

  const rate = input.totalOrders > 0 ? input.refundedOrders / input.totalOrders : 0;
  if (input.totalOrders >= 3 && rate >= 0.5) {
    score += 50;
    signals.push('HIGH_REFUND_RATE');
  } else if (input.totalOrders >= 3 && rate >= 0.3) {
    score += 25;
    signals.push('ELEVATED_REFUND_RATE');
  }

  if (input.refundsInLast24h >= 3) {
    score += 40;
    signals.push('REFUND_BURST');
  }

  return toRisk(score, signals);
}

// ---- Fake engagement (reviews / ratings) ----
export interface FakeEngagementInput {
  reviewCount: number;
  reviewsInLast24h: number;
  verifiedPurchaseRatio: number; // 0..1 across the product's reviews
  averageRating: number; // 0..5
  distinctReviewerRatio: number; // 0..1 — unique authors / total reviews
}

/** Flags a product whose review/rating pattern looks manufactured rather than organic. */
export function detectFakeEngagement(input: FakeEngagementInput): RiskResult {
  const signals: string[] = [];
  let score = 0;

  if (input.reviewCount >= 10 && input.reviewsInLast24h / input.reviewCount >= 0.5) {
    score += 30;
    signals.push('REVIEW_VELOCITY_SPIKE');
  }
  if (input.reviewCount >= 5 && input.verifiedPurchaseRatio < 0.2) {
    score += 25;
    signals.push('LOW_VERIFIED_PURCHASE_RATIO');
  }
  if (input.reviewCount >= 5 && input.averageRating >= 4.8) {
    score += 15;
    signals.push('IMPLAUSIBLY_PERFECT_RATING');
  }
  if (input.reviewCount >= 5 && input.distinctReviewerRatio < 0.5) {
    score += 30;
    signals.push('LOW_DISTINCT_REVIEWER_RATIO');
  }

  return toRisk(score, signals);
}

// ---- Orchestration (DB + bus) ----

/** Record a fraud signal + publish FRAUD_SIGNAL. Call after any `detect*`/`compute*` above comes
 * back `risky`. */
export async function raiseFraudSignal(
  app: FastifyInstance,
  // NOTE: `ModerationRefKind` (prisma/schema.prisma) has no `ORDER` value — an order-level signal
  // is always filed against the *buyer* (`refKind: 'USER'`, `refId: userId`) instead; `orderId` is
  // still accepted (and threaded into the FRAUD_SIGNAL event payload below) purely for
  // traceability in logs/events, never as the ModerationItem's refKind/refId.
  input: { userId?: string; orderId?: string; result: RiskResult; refKind?: 'USER' | 'PRODUCT' | 'REVIEW'; refId?: string },
): Promise<void> {
  const item = await app.db.moderationItem.create({
    data: {
      refKind: input.refKind ?? 'USER',
      refId: input.refId ?? input.userId ?? input.orderId ?? 'unknown',
      stage: 'FRAUD',
      status: 'PENDING',
      severity: input.result.score >= 85 ? 'CRITICAL' : input.result.score >= 70 ? 'HIGH' : 'MEDIUM',
      reason: `Fraud risk score ${input.result.score}: ${input.result.signals.join(', ') || 'no specific signal'}`,
      aiVerdictLabel: 'FRAUD_RISK',
      aiVerdictConfidence: input.result.score / 100,
    },
  });
  await app.bus.publish(
    createEvent({
      type: 'FRAUD_SIGNAL',
      payload: { signalId: item.id, userId: input.userId, orderId: input.orderId, score: input.result.score, signals: input.result.signals },
    }),
  );
}

/** Place a payout hold on a creator (by their User id) — a `ModerationItem` a finance/admin
 * reviewer must resolve before any pending/future payout for this creator should be released.
 * NOTE (cross-package): `creator/index.ts`'s `POST /creators/me/payouts` does not currently check
 * for an open PAYOUT_HOLD item before processing a payout — that gate should be added there (or a
 * shared helper hoisted) in a follow-up pass; this module only owns detection + recording. */
export async function placePayoutHold(app: FastifyInstance, creatorUserId: string, reason: string): Promise<void> {
  await app.db.moderationItem.create({
    data: {
      refKind: 'USER',
      refId: creatorUserId,
      stage: 'PAYOUT_HOLD',
      status: 'ESCALATED',
      severity: 'HIGH',
      reason,
    },
  });
}

/** True when the creator (by User id) currently has an unresolved payout hold. Exported so other
 * modules (payouts, admin tooling) can gate on it without duplicating the query shape. */
export async function hasActivePayoutHold(app: FastifyInstance, creatorUserId: string): Promise<boolean> {
  const hold = await app.db.moderationItem.findFirst({
    where: { refKind: 'USER', refId: creatorUserId, stage: 'PAYOUT_HOLD', status: { in: ['PENDING', 'IN_REVIEW', 'ESCALATED'] } },
  });
  return Boolean(hold);
}
