import { createEvent } from '@sonic-gameworld/events';
import type { ModerationStage } from '../types.js';

/** Reached only when nothing rejected the content (LICENSE didn't RED, and HUMAN_REVIEW either
 * auto-cleared it or a moderator approved it). Publishes MODERATION_RESOLVED so search/marketplace
 * and the reporting UI can react. Note: for the *human-approved* path, `POST
 * /moderation/:id/resolve` in services/api already publishes its own MODERATION_RESOLVED at
 * resolution time — this is a deliberate, documented duplicate (see this package's README) rather
 * than a bug, since consumers key off `itemId`/`refId` and treat the event as idempotent. */
export const publishStage: ModerationStage = {
  name: 'PUBLISH',
  async run(ctx) {
    await ctx.bus.publish(
      createEvent({
        type: 'MODERATION_RESOLVED',
        payload: { itemId: ctx.data.itemId ?? null, refKind: ctx.job.refKind, refId: ctx.job.refId, resolution: 'APPROVED', auto: Boolean(ctx.data.autoCleared) },
      }),
    );
    return { status: 'OK', details: { refKind: ctx.job.refKind, refId: ctx.job.refId, auto: Boolean(ctx.data.autoCleared) } };
  },
};
