import sharp from 'sharp';
import { ASSET_VARIANTS, type AssetVariant } from '@sonic-gameworld/world-schema';
import type { Stage, VariantFileResult } from '../types.js';
import { VARIANT_TEXTURE_MAX_PX, computeMetrics, writeGLB } from '../gltf.js';

const RESIZABLE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function resizeTexture(image: Uint8Array, mimeType: string, maxPx: number): Promise<Uint8Array> {
  if (!RESIZABLE_MIME.has(mimeType)) return image; // leave exotic/unsupported formats untouched
  const buffer = Buffer.from(image);
  const resized = await sharp(buffer)
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .toBuffer();
  return new Uint8Array(resized);
}

function variantKey(assetId: string, versionId: string, variant: AssetVariant, ext: string): string {
  return `assets/${assetId}/versions/${versionId}/variants/${variant.toLowerCase()}.${ext}`;
}

/** For 3D models: resizes every embedded texture in each LOD-generated variant Document down to
 * that variant's max texture dimension, then serializes + uploads the finished GLB and records
 * an AssetVariantFile row. For standalone images: resizes the source image itself per variant.
 * This is where variant files actually become durable artifacts — LOD_GENERATION only produced
 * in-memory geometry. */
export const textureOptimizationStage: Stage = {
  name: 'TEXTURE_OPTIMIZATION',
  async run(ctx) {
    const { assetId, versionId } = ctx.job;
    const variantFiles: NonNullable<typeof ctx.data.variantFiles> = {};

    if (ctx.data.kind === 'MODEL_3D' && ctx.data.document) {
      const docs = ctx.data.variantDocuments;
      const sourceDocs = docs && Object.keys(docs).length > 0 ? docs : { ULTRA: ctx.data.document };

      for (const variant of ASSET_VARIANTS) {
        const vdoc = sourceDocs[variant] ?? (variant === 'ULTRA' ? ctx.data.document : undefined);
        if (!vdoc) continue; // no decimator: only ULTRA (the real, optimized document) is materialized
        const maxPx = VARIANT_TEXTURE_MAX_PX[variant];
        for (const texture of vdoc.getRoot().listTextures()) {
          const image = texture.getImage();
          if (!image) continue;
          const resized = await resizeTexture(image, texture.getMimeType(), maxPx);
          if (resized !== image) texture.setImage(resized);
        }
        const glb = await writeGLB(vdoc);
        const put = await ctx.storage.putObject(variantKey(assetId, versionId, variant, 'glb'), glb, 'model/gltf-binary');
        const metrics = computeMetrics(vdoc);
        const result: VariantFileResult = { key: put.key, url: put.url, sizeBytes: put.sizeBytes, format: 'GLB', polyCount: metrics.triangleCount, textureMaxPx: maxPx };
        variantFiles[variant] = result;
        await ctx.prisma.assetVariantFile.upsert({
          where: { versionId_variant: { versionId, variant } },
          create: { versionId, variant, url: put.url, sizeBytes: put.sizeBytes, polyCount: metrics.triangleCount, textureMaxPx: maxPx, format: 'GLB' },
          update: { url: put.url, sizeBytes: put.sizeBytes, polyCount: metrics.triangleCount, textureMaxPx: maxPx, format: 'GLB' },
        });
      }
      ctx.data.variantFiles = variantFiles;
      return { status: 'OK', details: { variants: Object.keys(variantFiles), method: ctx.data.lodMethod } };
    }

    if (ctx.data.kind === 'IMAGE' && ctx.data.buffer) {
      const meta = await sharp(ctx.data.buffer).metadata();
      const ext = meta.format === 'jpeg' ? 'jpg' : (meta.format ?? 'png');
      for (const variant of ASSET_VARIANTS) {
        const maxPx = VARIANT_TEXTURE_MAX_PX[variant];
        const resized = await sharp(ctx.data.buffer).resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true }).toBuffer();
        const put = await ctx.storage.putObject(variantKey(assetId, versionId, variant, ext), resized, `image/${meta.format ?? 'png'}`);
        const result: VariantFileResult = { key: put.key, url: put.url, sizeBytes: put.sizeBytes, format: (meta.format ?? 'png').toUpperCase(), textureMaxPx: maxPx };
        variantFiles[variant] = result;
        await ctx.prisma.assetVariantFile.upsert({
          where: { versionId_variant: { versionId, variant } },
          create: { versionId, variant, url: put.url, sizeBytes: put.sizeBytes, textureMaxPx: maxPx, format: result.format },
          update: { url: put.url, sizeBytes: put.sizeBytes, textureMaxPx: maxPx, format: result.format },
        });
      }
      ctx.data.variantFiles = variantFiles;
      return { status: 'OK', details: { variants: Object.keys(variantFiles) } };
    }

    return { status: 'SKIPPED', details: { reason: `${ctx.data.kind} assets are distributed as a single file — no per-variant texture tiers` } };
  },
};
