import { checkLicenseCompatibility } from '@sonic-gameworld/world-schema';
import type { ModerationStage } from '../types.js';

/** Only ASSET/PRODUCT refs carry license terms. Mirrors worker-asset-processing's ingestion
 * intent baseline (commercial + multiplayer-safe marketplace distribution) — a hard RED here
 * blocks the listing outright rather than merely escalating, because an incompatible license is
 * an objective, not-a-judgment-call fact, unlike the fuzzier AI_SAFETY/CONTENT_POLICY findings. */
const INGESTION_INTENT = { commercial: true, multiplayer: true, redistribute: false, modify: true } as const;

export const licenseStage: ModerationStage = {
  name: 'LICENSE',
  async run(ctx) {
    if (ctx.job.refKind !== 'ASSET' && ctx.job.refKind !== 'PRODUCT') {
      ctx.data.licenseStatus = 'NOT_APPLICABLE';
      return { status: 'SKIPPED', details: { reason: `${ctx.job.refKind} refs do not carry license terms` } };
    }
    const licenses = ctx.job.licenses;
    if (!licenses || licenses.length === 0) {
      return { status: 'SKIPPED', details: { reason: 'No license record supplied with this job' } };
    }

    const result = checkLicenseCompatibility(licenses, INGESTION_INTENT);
    ctx.data.licenseStatus = result.status;
    ctx.data.licenseReasons = result.reasons;

    if (result.status === 'RED') {
      return { status: 'FAILED', error: `License incompatible with marketplace listing: ${result.reasons.join('; ')}` };
    }
    return { status: 'OK', details: { status: result.status, reasons: result.reasons } };
  },
};
