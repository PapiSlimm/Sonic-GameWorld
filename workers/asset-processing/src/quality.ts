// Pure, deterministic quality scoring (0-100). Kept dependency-free and side-effect-free so it's
// trivially unit-testable and so the pipeline can call it repeatedly (e.g. speculative re-scoring)
// without any I/O. Monotonicity contract: improving any single input metric (in the direction that
// intuitively means "better asset") must never decrease the score, all else held equal.
export interface QualityMetrics {
  /** 0..1 — fraction of triangles that are NOT degenerate. 1 = perfectly clean mesh. */
  cleanGeometryRatio: number;
  /** Count of texture references with missing image data. 0 is ideal. */
  missingTextureCount: number;
  /** How many LOD/variant files were successfully produced (0..6). */
  variantsGenerated: number;
  /** Whether a marketplace thumbnail was generated. */
  hasThumbnail: boolean;
  /** License compatibility verdict for the asset's declared license(s). */
  licenseStatus: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  /** Count of engine targets (of 4) the asset is compatible with. */
  compatibleEngineCount: number;
  /** Number of distinct AI/keyword tags extracted. More context = more discoverable. */
  tagCount: number;
  /** Triangle count of the ULTRA/original variant — extremely large or zero meshes are penalized. */
  triangleCount: number;
}

const WEIGHTS = {
  cleanGeometry: 25,
  textures: 15,
  variants: 20,
  thumbnail: 5,
  license: 15,
  compatibility: 12,
  tags: 5,
  scale: 3,
} as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Computes a 0-100 quality score from independent, additive sub-scores. Every sub-score is a
 * non-decreasing function of its inputs in the "better" direction, so the sum is monotonic too. */
export function computeQualityScore(metrics: QualityMetrics): number {
  const cleanGeometryScore = clamp01(metrics.cleanGeometryRatio) * WEIGHTS.cleanGeometry;

  // Missing textures: 0 missing = full marks, decays smoothly, floors at 0.
  const textureScore = WEIGHTS.textures * clamp01(1 - metrics.missingTextureCount / 8);

  // Variants: 6 possible (ULTRA..WEB); linear credit.
  const variantScore = WEIGHTS.variants * clamp01(metrics.variantsGenerated / 6);

  const thumbnailScore = metrics.hasThumbnail ? WEIGHTS.thumbnail : 0;

  const licenseScore =
    metrics.licenseStatus === 'GREEN' ? WEIGHTS.license : metrics.licenseStatus === 'YELLOW' ? WEIGHTS.license * 0.6 : metrics.licenseStatus === 'RED' ? 0 : WEIGHTS.license * 0.4;

  const compatibilityScore = WEIGHTS.compatibility * clamp01(metrics.compatibleEngineCount / 4);

  const tagScore = WEIGHTS.tags * clamp01(metrics.tagCount / 5);

  // Scale sanity: a mesh with a non-zero, non-absurd triangle count gets full marks; an empty
  // mesh (0 triangles) or a wildly oversized one loses points, but never below 0.
  const scaleScore = metrics.triangleCount > 0 ? WEIGHTS.scale : 0;

  const total = cleanGeometryScore + textureScore + variantScore + thumbnailScore + licenseScore + compatibilityScore + tagScore + scaleScore;
  return Math.round(clamp01(total / 100) * 100);
}
