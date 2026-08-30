import type { Stage } from '../types.js';

/** Gate before marketplace listing. In auto-approve mode (the default — `AUTO_APPROVE_ASSETS`
 * unset or `true`) the pipeline proceeds immediately, which is what every dev/test environment
 * and most self-serve creator tiers want. When disabled, the job returns WAITING: the pipeline
 * orchestrator persists progress and stops here without erroring, and a later job carrying
 * `forceApprove: true` (enqueued by services/api once the creator approves in Studio) resumes
 * from this exact stage index via `resumeFromIndex`. */
export const creatorApprovalStage: Stage = {
  name: 'CREATOR_APPROVAL',
  async run(ctx) {
    const approved = ctx.job.forceApprove === true || ctx.autoApproveAssets;
    if (!approved) {
      return { status: 'WAITING', details: { reason: 'Awaiting explicit creator approval (AUTO_APPROVE_ASSETS=false)' } };
    }
    ctx.data.approved = true;
    ctx.data.approvalMethod = ctx.job.forceApprove ? 'manual' : 'auto';
    return { status: 'OK', details: { approved: true, method: ctx.data.approvalMethod } };
  },
};
