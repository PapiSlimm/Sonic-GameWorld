import sharp from 'sharp';
import type { Stage } from '../types.js';
import { computeMetrics, isGltfExtension, loadDocument } from '../gltf.js';

/** Real GLB/glTF introspection via @gltf-transform/core for 3D models; sharp metadata probing
 * for images. Audio/video/archives get their raw size recorded — deeper media introspection
 * (waveform/codec analysis) is out of scope for the asset pipeline. */
export const metadataExtractionStage: Stage = {
  name: 'METADATA_EXTRACTION',
  async run(ctx) {
    const { buffer, ext, kind } = ctx.data;
    if (!buffer || !ext) return { status: 'FAILED', error: 'Missing file buffer/extension' };

    if (kind === 'MODEL_3D' && isGltfExtension(ext)) {
      const doc = await loadDocument(buffer, ext);
      ctx.data.document = doc;
      const metrics = computeMetrics(doc);
      ctx.data.metrics = metrics;
      return { status: 'OK', details: { ...metrics } };
    }

    if (kind === 'MODEL_3D') {
      // FBX/OBJ/USD/BLEND: no in-process parser available in this worker. Record what we can
      // (file size) honestly rather than fabricating mesh statistics.
      return { status: 'SKIPPED', details: { reason: `No in-process parser for .${ext} — only GLB/GLTF get full metadata extraction`, sizeBytes: buffer.byteLength } };
    }

    if (kind === 'IMAGE') {
      const meta = await sharp(buffer).metadata();
      return { status: 'OK', details: { width: meta.width, height: meta.height, format: meta.format, channels: meta.channels, hasAlpha: meta.hasAlpha } };
    }

    return { status: 'SKIPPED', details: { reason: `${kind} assets do not carry 3D/image metadata`, sizeBytes: buffer.byteLength } };
  },
};
