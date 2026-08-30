import type { Stage } from '../types.js';
import { computeQualityScore } from '../quality.js';

export const qualityScoreStage: Stage = {
  name: 'QUALITY_SCORE',
  async run(ctx) {
    const score = computeQualityScore({
      cleanGeometryRatio: 1 - (ctx.data.degenerateTriangleRatio ?? 0),
      missingTextureCount: ctx.data.missingTextureCount ?? 0,
      variantsGenerated: Object.keys(ctx.data.variantFiles ?? {}).length,
      hasThumbnail: Boolean(ctx.data.variantFiles), // thumbnail enqueue always follows a successful variant pass
      licenseStatus: ctx.data.licenseStatus ?? 'UNKNOWN',
      compatibleEngineCount: (ctx.data.compatibility ?? []).filter((c) => c.compatible).length,
      tagCount: ctx.data.tags?.length ?? 0,
      triangleCount: ctx.data.metrics?.triangleCount ?? 1, // non-3D assets aren't penalized for having 0 triangles
    });

    ctx.data.qualityScore = score;
    await ctx.prisma.asset.update({ where: { id: ctx.job.assetId }, data: { qualityScore: score } });

    return { status: 'OK', details: { score } };
  },
};
