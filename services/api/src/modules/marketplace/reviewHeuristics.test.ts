import { describe, expect, it } from 'vitest';
import { scoreReview } from './reviewHeuristics.js';

describe('scoreReview', () => {
  it('is clean for a normal, verified, detailed review with no history', () => {
    const result = scoreReview(
      { authorId: 'u1', rating: 4, body: 'Solid asset, worked great in my scene after some tweaking of the materials.', verifiedPurchase: true },
      [],
    );
    expect(result.suspicious).toBe(false);
    expect(result.flags).toHaveLength(0);
  });

  it('flags an unverified, low-effort extreme rating', () => {
    const result = scoreReview({ authorId: 'u1', rating: 1, body: 'bad', verifiedPurchase: false }, []);
    expect(result.flags).toEqual(expect.arrayContaining(['UNVERIFIED_PURCHASE', 'EXTREME_RATING_LOW_EFFORT']));
  });

  it('flags the same author reviewing again', () => {
    const recent = [{ authorId: 'u1', rating: 5, body: 'great', createdAt: new Date() }];
    const result = scoreReview({ authorId: 'u1', rating: 5, body: 'also great', verifiedPurchase: true }, recent);
    expect(result.flags).toContain('DUPLICATE_AUTHOR');
  });

  it('flags a burst of five or more recent reviews', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const recent = Array.from({ length: 5 }, (_, i) => ({ authorId: `u${i}`, rating: 5, body: `review ${i}`, createdAt: new Date(now.getTime() - i * 60_000) }));
    const result = scoreReview({ authorId: 'u_new', rating: 5, body: 'me too', verifiedPurchase: true }, recent, now);
    expect(result.flags).toContain('REVIEW_BURST');
  });

  it('flags near-duplicate copy-pasted text', () => {
    const recent = [{ authorId: 'u1', rating: 5, body: 'This is an amazing product that changed my whole workflow forever', createdAt: new Date() }];
    const result = scoreReview(
      { authorId: 'u2', rating: 5, body: 'This is an amazing product that changed my whole workflow forever!', verifiedPurchase: true },
      recent,
    );
    expect(result.flags).toContain('NEAR_DUPLICATE_TEXT');
  });

  it('crosses the suspicion threshold when multiple signals stack', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const recent = [
      { authorId: 'u9', rating: 5, body: 'x', createdAt: now },
      { authorId: 'u9', rating: 5, body: 'x', createdAt: now },
    ];
    const result = scoreReview({ authorId: 'u9', rating: 1, body: 'bad', verifiedPurchase: false }, recent, now);
    expect(result.suspicious).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('clamps the score at 100 regardless of how many signals fire', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const recent = Array.from({ length: 6 }, () => ({ authorId: 'u1', rating: 5, body: 'copy pasted spam text here', createdAt: now }));
    const result = scoreReview({ authorId: 'u1', rating: 1, body: 'copy pasted spam text here', verifiedPurchase: false }, recent, now);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
