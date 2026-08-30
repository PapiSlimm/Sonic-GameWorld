import { describe, expect, it } from 'vitest';
import { computeCreatorReputation, type CreatorSignals } from './reputation.js';

const BASELINE: CreatorSignals = {
  avgRating: 3,
  refundRatePct: 0.1,
  totalSales: 100,
  versionsPerProductPerYear: 2,
  reviewCountRecent: 10,
  replyRatePct: 0.3,
  originalRatioPct: 0.7,
  complianceViolations: 1,
  totalListings: 10,
};

describe('computeCreatorReputation', () => {
  it('is bounded to [0, 100]', () => {
    const { repScore } = computeCreatorReputation(BASELINE);
    expect(repScore).toBeGreaterThanOrEqual(0);
    expect(repScore).toBeLessThanOrEqual(100);
  });

  it('scores a maximally-good creator at 100', () => {
    const { repScore } = computeCreatorReputation({
      avgRating: 5,
      refundRatePct: 0,
      totalSales: 5000,
      versionsPerProductPerYear: 12,
      reviewCountRecent: 200,
      replyRatePct: 1,
      originalRatioPct: 1,
      complianceViolations: 0,
      totalListings: 20,
    });
    expect(repScore).toBe(100);
  });

  it('scores a maximally-bad creator at 0', () => {
    const { repScore } = computeCreatorReputation({
      avgRating: 0,
      refundRatePct: 1,
      totalSales: 0,
      versionsPerProductPerYear: 0,
      reviewCountRecent: 0,
      replyRatePct: 0,
      originalRatioPct: 0,
      complianceViolations: 20,
      totalListings: 10,
    });
    expect(repScore).toBe(0);
  });

  it('gives a brand-new creator with zero listings a neutral-to-good compliance score, not zero', () => {
    const { repCompliance } = computeCreatorReputation({ ...BASELINE, complianceViolations: 0, totalListings: 0 });
    expect(repCompliance).toBe(100);
  });

  it('is deterministic', () => {
    expect(computeCreatorReputation(BASELINE)).toEqual(computeCreatorReputation({ ...BASELINE }));
  });

  const improvements: { field: keyof CreatorSignals; worse: number; better: number }[] = [
    { field: 'avgRating', worse: 1, better: 5 },
    { field: 'refundRatePct', worse: 0.5, better: 0 },
    { field: 'totalSales', worse: 0, better: 1000 },
    { field: 'versionsPerProductPerYear', worse: 0, better: 10 },
    { field: 'reviewCountRecent', worse: 0, better: 100 },
    { field: 'replyRatePct', worse: 0, better: 1 },
    { field: 'originalRatioPct', worse: 0, better: 1 },
  ];
  for (const { field, worse, better } of improvements) {
    it(`repScore is monotonic in ${field}`, () => {
      const worseScore = computeCreatorReputation({ ...BASELINE, [field]: worse }).repScore;
      const betterScore = computeCreatorReputation({ ...BASELINE, [field]: better }).repScore;
      expect(betterScore).toBeGreaterThanOrEqual(worseScore);
    });
  }

  it('repScore is monotonic (decreasing) in complianceViolations', () => {
    const fewer = computeCreatorReputation({ ...BASELINE, complianceViolations: 0 }).repScore;
    const more = computeCreatorReputation({ ...BASELINE, complianceViolations: 8 }).repScore;
    expect(more).toBeLessThanOrEqual(fewer);
  });
});
