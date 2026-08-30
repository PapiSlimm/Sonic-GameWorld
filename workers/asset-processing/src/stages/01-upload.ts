import type { Stage } from '../types.js';
import { extensionOf } from '../gltf.js';

/** Confirms the previously-presigned upload actually landed in object storage, fetches it into
 * memory for the rest of the pipeline, and cross-checks its size against what the client
 * declared at upload-url time (a mismatch usually means a truncated/corrupted upload). */
export const uploadStage: Stage = {
  name: 'UPLOAD',
  async run(ctx) {
    const buffer = await ctx.storage.getObject(ctx.job.fileKey);
    ctx.data.buffer = buffer;
    ctx.data.ext = extensionOf(ctx.job.fileName);

    const sizeMismatch = ctx.job.sizeBytes > 0 && Math.abs(buffer.byteLength - ctx.job.sizeBytes) > 0;
    if (sizeMismatch) {
      return {
        status: 'FAILED',
        error: `Uploaded object size (${buffer.byteLength}) does not match declared size (${ctx.job.sizeBytes})`,
      };
    }

    return { status: 'OK', details: { sizeBytes: buffer.byteLength, extension: ctx.data.ext } };
  },
};
