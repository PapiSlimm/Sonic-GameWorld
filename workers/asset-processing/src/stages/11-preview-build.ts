import type { Stage } from '../types.js';

/** The "preview" artifact is the lightest usable representation for marketplace product pages
 * and search-result cards — we reuse the already-generated WEB variant rather than building a
 * separate bespoke preview format, since it's already texture- and geometry-optimized for
 * bandwidth-constrained rendering. */
export const previewBuildStage: Stage = {
  name: 'PREVIEW_BUILD',
  async run(ctx) {
    const preview = ctx.data.variantFiles?.WEB ?? ctx.data.variantFiles?.MOBILE ?? ctx.data.variantFiles?.LOW;
    if (!preview) {
      return { status: 'SKIPPED', details: { reason: 'No web-tier variant available to use as a preview (non-3D/non-image asset, or LOD generation produced nothing)' } };
    }
    ctx.data.previewUrl = preview.url;
    await ctx.prisma.asset.update({ where: { id: ctx.job.assetId }, data: { previewUrl: preview.url } });
    return { status: 'OK', details: { previewUrl: preview.url } };
  },
};
