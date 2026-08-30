import { describe, expect, it } from 'vitest';
import {
  RANK_WEIGHTS,
  clampRankScore,
  compatibilityScore,
  conversionScore,
  rankProduct,
  recencyScore,
  retentionScore,
  sortByRank,
  userPrefScore,
} from './rank.js';

describe('RANK_WEIGHTS', () => {
  it('sums to 1 (§14 of CONTRACTS.md)', () => {
    const total = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('clampRankScore', () => {
  it('clamps into [0, 100]', () => {
    expect(clampRankScore(-5)).toBe(0);
    expect(clampRankScore(150)).toBe(100);
    expect(clampRankScore(42)).toBe(42);
  });
  it('treats NaN/Infinity as 0', () => {
    expect(clampRankScore(NaN)).toBe(0);
    expect(clampRankScore(Infinity)).toBe(0);
    expect(clampRankScore(-Infinity)).toBe(0);
  });
});

describe('rankProduct', () => {
  const ZERO = { relevance: 0, quality: 0, creatorReputation: 0, conversion: 0, retention: 0, recency: 0, compatibility: 0, userPref: 0 };

  it('scores a perfect product at exactly 100', () => {
    const inputs = Object.fromEntries(Object.keys(ZERO).map((k) => [k, 100])) as typeof ZERO;
    expect(rankProduct(inputs).score).toBe(100);
  });

  it('scores a product with nothing going for it at exactly 0', () => {
    expect(rankProduct(ZERO).score).toBe(0);
  });

  it('applies the exact §14 weights', () => {
    for (const [component, weight] of Object.entries(RANK_WEIGHTS)) {
      const inputs = { ...ZERO, [component]: 100 };
      const result = rankProduct(inputs);
      expect(result.score).toBeCloseTo(weight * 100, 10);
    }
  });

  it('clamps out-of-range inputs before weighting', () => {
    const result = rankProduct({ ...ZERO, relevance: 500, quality: -10 });
    expect(result.relevance).toBe(100);
    expect(result.quality).toBe(0);
    expect(result.score).toBeCloseTo(25, 10); // relevance*.25 only
  });

  it('matches a realistic mixed profile by hand-computed weighted sum', () => {
    const inputs = { relevance: 80, quality: 90, creatorReputation: 70, conversion: 40, retention: 60, recency: 55, compatibility: 100, userPref: 30 };
    const expected =
      80 * 0.25 + 90 * 0.15 + 70 * 0.15 + 40 * 0.1 + 60 * 0.1 + 55 * 0.1 + 100 * 0.1 + 30 * 0.05;
    expect(rankProduct(inputs).score).toBeCloseTo(expected, 10);
  });

  it('is deterministic for the same inputs', () => {
    const inputs = { relevance: 33, quality: 66, creatorReputation: 12, conversion: 88, retention: 44, recency: 77, compatibility: 21, userPref: 99 };
    const a = rankProduct(inputs, '2026-01-01T00:00:00.000Z');
    const b = rankProduct(inputs, '2026-01-01T00:00:00.000Z');
    expect(a).toEqual(b);
  });

  it('ranks a higher-relevance product above a higher-quality-but-irrelevant one when relevance dominates', () => {
    const relevant = rankProduct({ ...ZERO, relevance: 100 });
    const qualityOnly = rankProduct({ ...ZERO, quality: 100 });
    expect(relevant.score).toBeGreaterThan(qualityOnly.score);
  });
});

describe('sortByRank', () => {
  it('orders descending by score with a stable id tie-break', () => {
    const items = [
      { id: 'b', score: 50 },
      { id: 'a', score: 50 },
      { id: 'c', score: 90 },
    ];
    const sorted = sortByRank(items, (i) => i.score);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('component derivations', () => {
  it('recencyScore is 100 at publish time and decays toward 0', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(recencyScore(now, now)).toBe(100);
    expect(recencyScore(null, now)).toBe(0);
    const old = recencyScore('2025-01-01T00:00:00Z', now);
    expect(old).toBeGreaterThanOrEqual(0);
    expect(old).toBeLessThan(100);
  });

  it('conversionScore rewards a healthy sales/views ratio and is neutral with no views', () => {
    expect(conversionScore(0, 0)).toBe(50);
    expect(conversionScore(5, 0)).toBe(100);
    expect(conversionScore(10, 100, 0.1)).toBe(100); // exactly at target
    expect(conversionScore(0, 100)).toBe(0);
  });

  it('retentionScore is neutral with no ratings and scales with rating + volume', () => {
    expect(retentionScore(0, 0)).toBe(50);
    expect(retentionScore(5, 100)).toBe(100);
  });

  it('compatibilityScore rewards exact engine match and WEB fallback', () => {
    expect(compatibilityScore(['UNITY'], undefined)).toBe(60);
    expect(compatibilityScore(['UNITY'], 'UNITY')).toBe(100);
    expect(compatibilityScore(['WEB'], 'UNITY')).toBe(70);
    expect(compatibilityScore(['UNREAL'], 'UNITY')).toBe(0);
  });

  it('userPrefScore reflects the strongest genre-affinity overlap', () => {
    expect(userPrefScore(['FANTASY', 'RPG'], { FANTASY: 0.9, SCIFI: 0.1 })).toBe(90);
    expect(userPrefScore(['SCIFI'], {})).toBe(50);
  });
});
