import type { Stage } from '../types.js';

/** Hands off to the dedicated `worker-thumbnails` package via the `asset.thumbnail` BullMQ queue
 * rather than rendering here — thumbnail generation is a distinct concern (2D card rendering)
 * with its own scaling characteristics. This stage's job is just a reliable, idempotent enqueue. */
export const thumbnailsStage: Stage = {
  name: 'THUMBNAILS',
  async run(ctx) {
    const asset = await ctx.prisma.asset.findUnique({ where: { id: ctx.job.assetId } });
    const webVariant = ctx.data.variantFiles?.WEB ?? ctx.data.variantFiles?.ULTRA;
    const polyCount = ctx.data.metrics?.triangleCount ?? webVariant?.polyCount;

    const job = await ctx.thumbnailQueue.add(
      'generate-thumbnail',
      {
        assetId: ctx.job.assetId,
        versionId: ctx.job.versionId,
        name: asset?.name ?? ctx.job.fileName,
        category: asset?.type ?? 'MODEL',
        polyCount,
        sourceKey: webVariant?.key ?? ctx.job.fileKey,
      },
      { jobId: `thumb-${ctx.job.versionId}`, removeOnComplete: true, removeOnFail: 50 },
    );

    return { status: 'OK', details: { enqueuedJobId: job.id } };
  },
};
