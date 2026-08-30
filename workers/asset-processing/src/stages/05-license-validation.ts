import { checkLicenseCompatibility, type LicenseRecord } from '@sonic-gameworld/world-schema';
import type { Stage } from '../types.js';

/** Marketplace-listing intent baseline: an asset going through the pipeline is being prepared
 * for commercial, multiplayer-safe distribution on the platform, with the creator's declared
 * license permitting derivative variants (LOD/texture optimization counts as modification). We
 * do not check `redistribute` here — that's evaluated per-purchase against the *buyer's* intent
 * by the licensing module in services/api, not at ingestion time. */
const INGESTION_INTENT = { commercial: true, multiplayer: true, redistribute: false, modify: true } as const;

export const licenseValidationStage: Stage = {
  name: 'LICENSE_VALIDATION',
  async run(ctx) {
    const passport = await ctx.prisma.assetPassport.findUnique({ where: { assetId: ctx.job.assetId } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const license = (passport?.data as any)?.license as LicenseRecord | undefined;

    if (!license) {
      return { status: 'SKIPPED', details: { reason: 'No AssetPassport license record found yet — will be validated again at publish time' } };
    }

    const result = checkLicenseCompatibility([license], INGESTION_INTENT);
    ctx.data.licenseStatus = result.status;
    ctx.data.licenseReasons = result.reasons;

    if (result.status === 'RED') {
      return { status: 'FAILED', error: `License incompatible with marketplace ingestion: ${result.reasons.join('; ')}` };
    }
    return { status: 'OK', details: { status: result.status, reasons: result.reasons } };
  },
};
