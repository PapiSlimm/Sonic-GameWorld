import { describe, expect, it } from 'vitest';
import { clampScore, computeCreatorScore, REPUTATION_WEIGHTS } from './reputation.js';

describe('REPUTATION_WEIGHTS', () => {
  it('sums to 1 (§14 of CONTRACTS.md)', () => {
    const total = Object.values(REPUTATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('clampScore', () => {
  it('clamps into [0, 100]', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(42)).toBe(42);
  });
  it('treats NaN/Infinity as 0', () => {
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(Infinity)).toBe(0);
    expect(clampScore(-Infinity)).toBe(0);
  });
});

describe('computeCreatorScore', () => {
  it('scores a perfect creator at exactly 100', () => {
    const result = computeCreatorScore({
      quality: 100,
      reliability: 100,
      sales: 100,
      updates: 100,
      reviews: 100,
      support: 100,
      originality: 100,
      compliance: 100,
    });
    expect(result.score).toBe(100);
  });

  it('scores a creator with no history at exactly 0', () => {
    const result = computeCreatorScore({
      quality: 0,
      reliability: 0,
      sales: 0,
      updates: 0,
      reviews: 0,
      support: 0,
      originality: 0,
      compliance: 0,
    });
    expect(result.score).toBe(0);
  });

  it('applies the exact §14 weights', () => {
    // Isolate each component at 100 with the rest at 0 — the resulting score must equal that
    // component's weight * 100.
    for (const [component, weight] of Object.entries(REPUTATION_WEIGHTS)) {
      const inputs = {
        quality: 0,
        reliability: 0,
        sales: 0,
        updates: 0,
        reviews: 0,
        support: 0,
        originality: 0,
        compliance: 0,
        [component]: 100,
      };
      const result = computeCreatorScore(inputs as Parameters<typeof computeCreatorScore>[0]);
      expect(result.score).toBeCloseTo(weight * 100, 10);
    }
  });

  it('clamps out-of-range inputs before weighting', () => {
    const result = computeCreatorScore({
      quality: 500,
      reliability: -10,
      sales: 50,
      updates: 50,
      reviews: 50,
      support: 50,
      originality: 50,
      compliance: 50,
    });
    expect(result.quality).toBe(100);
    expect(result.reliability).toBe(0);
    // 100*.2 + 0*.15 + 50*(.15+.1+.15+.1+.1+.05) = 20 + 50*0.65 = 52.5
    expect(result.score).toBeCloseTo(52.5, 10);
  });

  it('matches a realistic mixed profile by hand-computed weighted sum', () => {
    const inputs = { quality: 80, reliability: 90, sales: 40, updates: 60, reviews: 75, support: 85, originality: 55, compliance: 100 };
    const expected =
      80 * 0.2 + 90 * 0.15 + 40 * 0.15 + 60 * 0.1 + 75 * 0.15 + 85 * 0.1 + 55 * 0.1 + 100 * 0.05;
    const result = computeCreatorScore(inputs);
    expect(result.score).toBeCloseTo(expected, 10);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('is deterministic for the same inputs', () => {
    const inputs = { quality: 33, reliability: 66, sales: 12, updates: 88, reviews: 44, support: 77, originality: 21, compliance: 99 };
    const a = computeCreatorScore(inputs, '2026-01-01T00:00:00.000Z');
    const b = computeCreatorScore(inputs, '2026-01-01T00:00:00.000Z');
    expect(a).toEqual(b);
  });
});
