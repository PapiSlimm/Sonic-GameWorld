import { ASSET_VARIANTS } from '@sonic-gameworld/world-schema';
import type { Stage } from '../types.js';
import { VARIANT_RATIOS, computeMetrics, cloneDocumentSafe, simplifyClone, tryLoadMeshoptSimplifier } from '../gltf.js';

/** Generates one Document per AssetVariant (ULTRA..WEB) by geometric decimation. When the real
 * `meshoptimizer` WASM decimator is available, every non-ULTRA variant is actually simplified.
 * Otherwise this stage is honest about the limitation: it records ratio-based *estimated*
 * triangle counts (no decimation performed) and reports SKIPPED_NO_DECIMATOR rather than
 * pretending geometry was reduced. */
export const lodGenerationStage: Stage = {
  name: 'LOD_GENERATION',
  async run(ctx) {
    const doc = ctx.data.document;
    if (!doc) {
      return { status: 'SKIPPED', details: { reason: `${ctx.data.kind} assets have no glTF document to decimate` } };
    }

    const baseMetrics = ctx.data.metrics ?? computeMetrics(doc);
    const simplifier = await tryLoadMeshoptSimplifier();
    const variantDocuments: NonNullable<typeof ctx.data.variantDocuments> = {};
    const estimates: Record<string, number> = {};

    for (const variant of ASSET_VARIANTS) {
      const ratio = VARIANT_RATIOS[variant];
      if (simplifier) {
        variantDocuments[variant] = ratio >= 1 ? cloneDocumentSafe(doc) : await simplifyClone(doc, ratio, simplifier);
      } else {
        estimates[variant] = Math.max(1, Math.round(baseMetrics.triangleCount * ratio));
      }
    }

    if (simplifier) {
      ctx.data.lodMethod = 'meshopt';
      ctx.data.variantDocuments = variantDocuments;
      const actualCounts: Record<string, number> = {};
      for (const [variant, vdoc] of Object.entries(variantDocuments)) {
        actualCounts[variant] = computeMetrics(vdoc).triangleCount;
      }
      return { status: 'OK', details: { method: 'meshopt', triangleCounts: actualCounts } };
    }

    ctx.data.lodMethod = 'estimated';
    return {
      status: 'SKIPPED_NO_DECIMATOR',
      details: {
        method: 'estimated',
        reason: 'meshoptimizer WASM module failed to load in this environment — geometry was NOT decimated; triangle counts below are ratio-based estimates only',
        estimatedTriangleCounts: estimates,
      },
    };
  },
};
