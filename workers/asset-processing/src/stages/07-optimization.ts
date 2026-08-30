import type { Stage } from '../types.js';
import { optimizeDocument, writeGLB } from '../gltf.js';

/** Runs dedup + weld + prune over the parsed Document in place. This becomes the ULTRA-quality
 * baseline that every LOD variant is derived from. */
export const optimizationStage: Stage = {
  name: 'OPTIMIZATION',
  async run(ctx) {
    const doc = ctx.data.document;
    if (!doc) {
      return { status: 'SKIPPED', details: { reason: `${ctx.data.kind} assets have no glTF document to optimize` } };
    }

    const before = await writeGLB(doc);
    await optimizeDocument(doc);
    const after = await writeGLB(doc);
    ctx.data.optimizationSavedBytes = Math.max(0, before.byteLength - after.byteLength);

    return {
      status: 'OK',
      details: { beforeBytes: before.byteLength, afterBytes: after.byteLength, savedBytes: ctx.data.optimizationSavedBytes },
    };
  },
};
