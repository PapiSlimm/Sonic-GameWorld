import type { Stage } from '../types.js';
import { findDegenerateGeometry, findMissingTextures } from '../gltf.js';

/** Bounds a "reasonable" GameWorld asset should fit within: 1mm to 10km along any axis. Wildly
 * outside this range usually means the exporter used the wrong unit scale. */
const MIN_DIMENSION_M = 0.001;
const MAX_DIMENSION_M = 10_000;
const MAX_DEGENERATE_RATIO = 0.5; // fail if over half the triangles are degenerate

export const threeDValidationStage: Stage = {
  name: '3D_VALIDATION',
  async run(ctx) {
    const doc = ctx.data.document;
    if (!doc) {
      return { status: 'SKIPPED', details: { reason: `${ctx.data.kind} assets are not validated as 3D geometry` } };
    }

    const degenerate = findDegenerateGeometry(doc);
    const missing = findMissingTextures(doc);
    const ratio = degenerate.totalTriangles > 0 ? degenerate.degenerateTriangles / degenerate.totalTriangles : 0;
    ctx.data.degenerateTriangleRatio = ratio;
    ctx.data.missingTextureCount = missing.missingCount;

    if (degenerate.nanVertices > 0) {
      return { status: 'FAILED', error: `Mesh contains ${degenerate.nanVertices} non-finite (NaN/Infinity) vertex components` };
    }
    if (degenerate.totalTriangles === 0) {
      return { status: 'FAILED', error: 'Model has no triangle geometry (0 primitives with TRIANGLES mode)' };
    }
    if (ratio > MAX_DEGENERATE_RATIO) {
      return { status: 'FAILED', error: `${(ratio * 100).toFixed(1)}% of triangles are degenerate (zero-area), exceeding the ${MAX_DEGENERATE_RATIO * 100}% threshold` };
    }

    const bounds = ctx.data.metrics?.bounds;
    let scaleWarning: string | undefined;
    if (bounds) {
      const size = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
      const maxDim = Math.max(...size);
      const minDim = Math.min(...size.filter((d) => d > 0), Infinity);
      if (maxDim > MAX_DIMENSION_M) {
        scaleWarning = `Model bounding box spans ${maxDim.toFixed(1)}m on an axis — likely a unit-scale (cm/mm) export error`;
      } else if (Number.isFinite(minDim) && minDim < MIN_DIMENSION_M) {
        scaleWarning = `Model bounding box is ${minDim.toFixed(5)}m on an axis — suspiciously small, check export scale`;
      }
      ctx.data.scaleWarning = scaleWarning;
    }

    return {
      status: 'OK',
      details: {
        degenerateTriangles: degenerate.degenerateTriangles,
        totalTriangles: degenerate.totalTriangles,
        degenerateRatio: ratio,
        missingTextures: missing.missingCount,
        missingTextureDetails: missing.details,
        scaleWarning,
      },
    };
  },
};
