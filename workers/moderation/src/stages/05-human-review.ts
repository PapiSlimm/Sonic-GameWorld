import { createEvent } from '@sonic-gameworld/events';
import type { ModerationSeverity, ModerationStage } from '../types.js';

const SEVERITY_RANK: Record<ModerationSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
function worseOf(a: ModerationSeverity, b: ModerationSeverity): ModerationSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * The human gate. Two very different call shapes hit this stage:
 *
 * 1. First pass (no `job.resolution`): decides whether anything upstream (AI_SAFETY,
 *    CONTENT_POLICY) warrants a human look. Nothing flagged, or only a LOW-severity finding under
 *    the permissive default posture → auto-clear straight through to PUBLISH. Anything else →
 *    create a `ModerationItem` (PENDING), publish `MODERATION_FLAGGED`, and return WAITING —
 *    mirroring worker-asset-processing's CREATOR_APPROVAL pause/resume gate. A moderator resolves
 *    the case out-of-band via `POST /moderation/:id/resolve` in services/api.
 * 2. Resume pass (`job.itemId` + `job.resolution` set, `resumeFromIndex` pointing back at this
 *    stage): trusts the human verdict already recorded on the `ModerationItem` — REJECTED stops
 *    the pipeline here (content never reaches PUBLISH); APPROVED continues.
 */
export const humanReviewStage: ModerationStage = {
  name: 'HUMAN_REVIEW',
  async run(ctx) {
    if (ctx.job.resolution) {
      ctx.data.itemId = ctx.job.itemId;
      if (ctx.job.resolution === 'REJECTED') {
        return { status: 'FAILED', error: `Rejected by human moderator (item ${ctx.job.itemId ?? 'unknown'})` };
      }
      return { status: 'OK', details: { resolution: 'APPROVED', itemId: ctx.job.itemId } };
    }

    const safety = ctx.data.safety;
    const contentPolicy = ctx.data.contentPolicy;
    const flagged = Boolean(safety?.flagged || contentPolicy?.flagged);

    if (!flagged) {
      ctx.data.autoCleared = true;
      return { status: 'OK', details: { autoCleared: true, reason: 'No AI_SAFETY or CONTENT_POLICY findings' } };
    }

    let severity: ModerationSeverity = 'LOW';
    if (safety?.flagged) severity = worseOf(severity, safety.severity);
    if (contentPolicy?.flagged) severity = worseOf(severity, contentPolicy.severity);
    ctx.data.finalSeverity = severity;

    if (severity === 'LOW' && !ctx.requireHumanReviewForLowSeverity) {
      ctx.data.autoCleared = true;
      return { status: 'OK', details: { autoCleared: true, reason: 'Only LOW-severity findings; auto-cleared per MODERATION_REQUIRE_REVIEW_FOR_LOW=false', severity } };
    }

    const categories = safety?.categories ?? [];
    const findingRules = contentPolicy?.findings.map((f) => f.rule) ?? [];
    const reason = ctx.job.reason ?? ([...categories, ...findingRules].join(', ') || 'Automated scan flagged this content for review');

    const item = await ctx.prisma.moderationItem.create({
      data: {
        refKind: ctx.job.refKind,
        refId: ctx.job.refId,
        stage: 'HUMAN_REVIEW',
        status: 'PENDING',
        severity,
        reason,
        reporterId: ctx.job.reporterId ?? null,
        aiVerdictLabel: categories[0] ?? findingRules[0] ?? null,
        aiVerdictNotes: JSON.stringify({ safety, contentPolicy }),
      },
    });
    ctx.data.itemId = item.id;

    await ctx.bus.publish(
      createEvent({ type: 'MODERATION_FLAGGED', payload: { itemId: item.id, refKind: ctx.job.refKind, refId: ctx.job.refId, stage: 'HUMAN_REVIEW', severity, reason } }),
    );

    return { status: 'WAITING', details: { itemId: item.id, severity, reason } };
  },
};
