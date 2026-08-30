import { describe, expect, it } from 'vitest';
import { computeQualityScore, type QualityMetrics } from './quality.js';

const BASELINE: QualityMetrics = {
  cleanGeometryRatio: 0.5,
  missingTextureCount: 4,
  variantsGenerated: 2,
  hasThumbnail: false,
  licenseStatus: 'YELLOW',
  compatibleEngineCount: 2,
  tagCount: 2,
  triangleCount: 1000,
};

describe('computeQualityScore', () => {
  it('is bounded to [0, 100]', () => {
    const score = computeQualityScore(BASELINE);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores a maximally-good asset at (or very near) 100', () => {
    const score = computeQualityScore({
      cleanGeometryRatio: 1,
      missingTextureCount: 0,
      variantsGenerated: 6,
      hasThumbnail: true,
      licenseStatus: 'GREEN',
      compatibleEngineCount: 4,
      tagCount: 12,
      triangleCount: 5000,
    });
    expect(score).toBe(100);
  });

  it('scores a maximally-bad asset at (or very near) 0', () => {
    const score = computeQualityScore({
      cleanGeometryRatio: 0,
      missingTextureCount: 50,
      variantsGenerated: 0,
      hasThumbnail: false,
      licenseStatus: 'RED',
      compatibleEngineCount: 0,
      tagCount: 0,
      triangleCount: 0,
    });
    expect(score).toBe(0);
  });

  // Monotonicity contract from quality.ts: improving any single metric in the "better" direction
  // must never decrease the score, holding every other metric fixed.
  const improvements: { field: keyof QualityMetrics; worse: unknown; better: unknown }[] = [
    { field: 'cleanGeometryRatio', worse: 0.2, better: 0.9 },
    { field: 'missingTextureCount', worse: 8, better: 0 },
    { field: 'variantsGenerated', worse: 0, better: 6 },
    { field: 'hasThumbnail', worse: false, better: true },
    { field: 'licenseStatus', worse: 'RED', better: 'GREEN' },
    { field: 'compatibleEngineCount', worse: 0, better: 4 },
    { field: 'tagCount', worse: 0, better: 10 },
    { field: 'triangleCount', worse: 0, better: 5000 },
  ];

  for (const { field, worse, better } of improvements) {
    it(`is monotonic in ${field}`, () => {
      const worseScore = computeQualityScore({ ...BASELINE, [field]: worse });
      const betterScore = computeQualityScore({ ...BASELINE, [field]: better });
      expect(betterScore).toBeGreaterThanOrEqual(worseScore);
    });
  }

  it('is monotonic across a random walk of increasing cleanGeometryRatio', () => {
    const ratios = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1];
    const scores = ratios.map((cleanGeometryRatio) => computeQualityScore({ ...BASELINE, cleanGeometryRatio }));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]!);
    }
  });

  it('is deterministic (same input -> same output)', () => {
    expect(computeQualityScore(BASELINE)).toBe(computeQualityScore({ ...BASELINE }));
  });
});
