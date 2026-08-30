import { createEvent } from '@sonic-gameworld/events';
import type { Stage } from '../types.js';

/** Final stage: flips the AssetVersion + Asset to their terminal "ready to list" state and
 * publishes ASSET_PROCESSED so search/marketplace/recommendation (per CONTRACTS §7 fan-out) can
 * pick it up. */
export const marketplaceStage: Stage = {
  name: 'MARKETPLACE',
  async run(ctx) {
    await ctx.prisma.assetVersion.update({ where: { id: ctx.job.versionId }, data: { status: 'READY' } });
    await ctx.prisma.asset.update({ where: { id: ctx.job.assetId }, data: { status: 'READY', currentVersionId: ctx.job.versionId } });

    const variants = Object.keys(ctx.data.variantFiles ?? {});
    await ctx.bus.publish(
      createEvent({
        type: 'ASSET_PROCESSED',
        payload: { assetId: ctx.job.assetId, versionId: ctx.job.versionId, variants, qualityScore: ctx.data.qualityScore },
        actorId: ctx.job.creatorId,
      }),
    );

    return { status: 'OK', details: { variants, qualityScore: ctx.data.qualityScore } };
  },
};
