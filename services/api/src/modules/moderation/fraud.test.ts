import { describe, expect, it } from 'vitest';
import { computePaymentRiskScore, detectFakeEngagement, detectPurchaseAnomaly, detectRefundAbuse } from './fraud.js';

describe('computePaymentRiskScore', () => {
  it('is low-risk for an established buyer with normal behavior', () => {
    const result = computePaymentRiskScore({ accountAgeHours: 24 * 30, orderAmountCents: 2000, buyerAvgOrderCents: 1800, ordersInLast24h: 1, failedPaymentsInLast24h: 0 });
    expect(result.risky).toBe(false);
  });

  it('flags a brand-new account making an oversized purchase', () => {
    const result = computePaymentRiskScore({ accountAgeHours: 0.1, orderAmountCents: 50_000, buyerAvgOrderCents: 1000, ordersInLast24h: 1, failedPaymentsInLast24h: 0 });
    expect(result.signals).toContain('BRAND_NEW_ACCOUNT');
    expect(result.signals).toContain('AMOUNT_FAR_ABOVE_HISTORY');
    expect(result.risky).toBe(true);
  });

  it('flags high order velocity + repeated payment failures as risky', () => {
    const result = computePaymentRiskScore({ accountAgeHours: 1000, orderAmountCents: 1000, buyerAvgOrderCents: 1000, ordersInLast24h: 6, failedPaymentsInLast24h: 4 });
    expect(result.signals).toEqual(expect.arrayContaining(['HIGH_ORDER_VELOCITY', 'REPEATED_PAYMENT_FAILURES']));
    expect(result.risky).toBe(true);
  });
});

describe('detectPurchaseAnomaly', () => {
  it('flags a creator buying their own product at maximum severity', () => {
    const result = detectPurchaseAnomaly({ buyerId: 'user_1', creatorUserId: 'user_1', orderAmountCents: 500, buyerCreatorOrderCountLast30d: 1 });
    expect(result.signals).toContain('SELF_PURCHASE');
    expect(result.risky).toBe(true);
  });

  it('is not risky for a normal one-off purchase from a different creator', () => {
    const result = detectPurchaseAnomaly({ buyerId: 'user_1', creatorUserId: 'user_2', orderAmountCents: 500, buyerCreatorOrderCountLast30d: 1 });
    expect(result.risky).toBe(false);
  });

  it('flags repeated purchases from the same creator even without self-dealing', () => {
    const result = detectPurchaseAnomaly({ buyerId: 'user_1', creatorUserId: 'user_2', orderAmountCents: 500, buyerCreatorOrderCountLast30d: 6 });
    expect(result.signals).toContain('REPEAT_BUYER_SAME_CREATOR');
  });
});

describe('detectRefundAbuse', () => {
  it('is not risky for a buyer with a single refund among many clean orders', () => {
    const result = detectRefundAbuse({ totalOrders: 10, refundedOrders: 1, refundsInLast24h: 1 });
    expect(result.risky).toBe(false);
  });

  it('triggers on a high refund rate across enough orders to be meaningful', () => {
    const result = detectRefundAbuse({ totalOrders: 4, refundedOrders: 3, refundsInLast24h: 0 });
    expect(result.signals).toContain('HIGH_REFUND_RATE');
    expect(result.risky).toBe(true);
  });

  it('triggers on a burst of refunds in 24h regardless of lifetime rate', () => {
    const result = detectRefundAbuse({ totalOrders: 20, refundedOrders: 3, refundsInLast24h: 3 });
    expect(result.signals).toContain('REFUND_BURST');
    expect(result.risky).toBe(true);
  });

  it('does not flag a brand-new buyer with too little history to be meaningful', () => {
    // totalOrders < 3 never triggers the rate-based signal, even at 100% refunded.
    const result = detectRefundAbuse({ totalOrders: 1, refundedOrders: 1, refundsInLast24h: 1 });
    expect(result.signals).not.toContain('HIGH_REFUND_RATE');
  });
});

describe('detectFakeEngagement', () => {
  it('is clean for an organic review profile', () => {
    const result = detectFakeEngagement({ reviewCount: 20, reviewsInLast24h: 1, verifiedPurchaseRatio: 0.9, averageRating: 4.2, distinctReviewerRatio: 1 });
    expect(result.risky).toBe(false);
  });

  it('flags a burst of unverified, suspiciously-perfect, same-author-heavy reviews', () => {
    const result = detectFakeEngagement({ reviewCount: 12, reviewsInLast24h: 10, verifiedPurchaseRatio: 0.05, averageRating: 5, distinctReviewerRatio: 0.2 });
    expect(result.risky).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
  });
});
