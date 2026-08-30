import { ACCEPTED_UPLOAD_EXTENSIONS } from '@sonic-gameworld/world-schema';
import type { AssetKind } from '../types.js';
import type { Stage } from '../types.js';

const MAX_SIZE_BY_KIND: Record<AssetKind, number> = {
  MODEL_3D: 1024 * 1024 * 1024, // 1 GB
  IMAGE: 256 * 1024 * 1024,
  AUDIO: 512 * 1024 * 1024,
  VIDEO: 2 * 1024 * 1024 * 1024,
  ARCHIVE: 2 * 1024 * 1024 * 1024,
  UNKNOWN: 64 * 1024 * 1024,
};

const KIND_BY_EXT: Record<string, AssetKind> = {
  GLB: 'MODEL_3D',
  GLTF: 'MODEL_3D',
  FBX: 'MODEL_3D',
  OBJ: 'MODEL_3D',
  USD: 'MODEL_3D',
  BLEND: 'MODEL_3D',
  PNG: 'IMAGE',
  JPG: 'IMAGE',
  WAV: 'AUDIO',
  MP3: 'AUDIO',
  MP4: 'VIDEO',
  ZIP: 'ARCHIVE',
};

export const fileValidationStage: Stage = {
  name: 'FILE_VALIDATION',
  async run(ctx) {
    const ext = ctx.data.ext;
    const buffer = ctx.data.buffer;
    if (!buffer) return { status: 'FAILED', error: 'No file buffer loaded' };
    if (!ext || !ACCEPTED_UPLOAD_EXTENSIONS.includes(ext)) {
      return { status: 'FAILED', error: `Unsupported file extension for "${ctx.job.fileName}"` };
    }
    if (buffer.byteLength === 0) {
      return { status: 'FAILED', error: 'File is empty (0 bytes)' };
    }

    const kind = KIND_BY_EXT[ext] ?? 'UNKNOWN';
    ctx.data.kind = kind;

    const maxSize = MAX_SIZE_BY_KIND[kind];
    if (buffer.byteLength > maxSize) {
      return { status: 'FAILED', error: `File size ${buffer.byteLength} exceeds the ${maxSize} byte limit for ${kind} assets` };
    }

    return { status: 'OK', details: { kind, ext, sizeBytes: buffer.byteLength } };
  },
};
