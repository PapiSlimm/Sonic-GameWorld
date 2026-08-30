import { describe, expect, it } from 'vitest';
import { PLAN, type PlanTier } from '@sonic-gameworld/world-schema';
import { computeRoyaltySplit } from './split.js';

describe('computeRoyaltySplit', () => {
  const TIERS: PlanTier[] = ['STARTER', 'CREATOR', 'PRO', 'STUDIO', 'ENTERPRISE'];

  it('applies each tier\'s exact fee % from §4', () => {
    for (const tier of TIERS) {
      const result = computeRoyaltySplit(10_000, tier);
      expect(result.feePct).toBe(PLAN[tier].feePct);
      expect(result.feeCents).toBe(Math.round((10_000 * PLAN[tier].feePct) / 100));
      expect(result.royaltyCents).toBe(10_000 - result.feeCents);
    }
  });

  it('creator share equals 100 - feePct percent of gross', () => {
    const result = computeRoyaltySplit(20_000, 'CREATOR'); // feePct 15
    expect(result.royaltyCents).toBe(17_000);
    expect(result.feeCents).toBe(3_000);
  });

  it('STARTER (20% fee) keeps the creator at 80%', () => {
    const result = computeRoyaltySplit(1_000, 'STARTER');
    expect(result.feeCents).toBe(200);
    expect(result.royaltyCents).toBe(800);
  });

  it('STUDIO and ENTERPRISE both default to a 10% fee (90% creator share)', () => {
    expect(computeRoyaltySplit(1_000, 'STUDIO').royaltyCents).toBe(900);
    expect(computeRoyaltySplit(1_000, 'ENTERPRISE').royaltyCents).toBe(900);
  });

  it('fee + royalty always reconstitutes the gross exactly (no cent lost to rounding)', () => {
    for (const tier of TIERS) {
      for (const gross of [1, 3, 7, 99, 1999, 123_456]) {
        const result = computeRoyaltySplit(gross, tier);
        expect(result.feeCents + result.royaltyCents).toBe(gross);
      }
    }
  });

  it('zero gross splits to zero/zero', () => {
    const result = computeRoyaltySplit(0, 'PRO');
    expect(result.feeCents).toBe(0);
    expect(result.royaltyCents).toBe(0);
  });
});
