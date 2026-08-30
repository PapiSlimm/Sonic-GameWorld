// glTF-Transform helpers shared across pipeline stages: loading, metric extraction, geometry
// sanity checks, and LOD/texture derivation. Kept framework-free so stages stay thin.
import { Document, NodeIO, type Primitive, type Texture } from '@gltf-transform/core';
import { getBounds, cloneDocument as cloneDocumentFn, dedup, prune, weld, simplify } from '@gltf-transform/functions';
import type { AcceptedUploadExtension, AssetVariant } from '@sonic-gameworld/world-schema';
import type { GltfMetrics } from './types.js';

export const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian as read by DataView.getUint32

export function extensionOf(fileName: string): AcceptedUploadExtension | null {
  const m = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  if (!m) return null;
  const ext = m[1]!.toUpperCase();
  const known: readonly string[] = ['FBX', 'GLB', 'GLTF', 'OBJ', 'USD', 'BLEND', 'PNG', 'JPG', 'JPEG', 'WAV', 'MP3', 'MP4', 'ZIP'];
  if (!known.includes(ext)) return null;
  return (ext === 'JPEG' ? 'JPG' : ext) as AcceptedUploadExtension;
}

export function isGltfExtension(ext: AcceptedUploadExtension | null): boolean {
  return ext === 'GLB' || ext === 'GLTF';
}

let sharedIO: NodeIO | undefined;
function io(): NodeIO {
  if (!sharedIO) sharedIO = new NodeIO();
  return sharedIO;
}

/** Load a Document from an in-memory GLB or (JSON) glTF buffer. */
export async function loadDocument(buffer: Buffer, ext: AcceptedUploadExtension): Promise<Document> {
  if (ext === 'GLB') {
    return io().readBinary(new Uint8Array(buffer));
  }
  // .gltf is JSON with possibly-relative external resources; workers only ever see
  // self-contained (data-URI or already-inlined) uploads, so binaryToJSON's sibling readJSON
  // path is unnecessary — parse + read with no external resource map.
  const json = JSON.parse(buffer.toString('utf8'));
  return io().readJSON({ json, resources: {} });
}

export async function writeGLB(doc: Document): Promise<Buffer> {
  const bytes = await io().writeBinary(doc);
  return Buffer.from(bytes);
}

/** Triangle count for a primitive, accounting for indexed vs. non-indexed draw calls. Only
 * TRIANGLES (mode 4) primitives are counted as faces; other modes (lines/points/strips/fans)
 * contribute 0 to triangleCount but are still counted in vertexCount. */
function primitiveTriangleCount(prim: Primitive): number {
  if (prim.getMode() !== 4 /* TRIANGLES */) return 0;
  const indices = prim.getIndices();
  if (indices) return Math.floor(indices.getCount() / 3);
  const position = prim.getAttribute('POSITION');
  return position ? Math.floor(position.getCount() / 3) : 0;
}

export function computeMetrics(doc: Document): GltfMetrics {
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  const primitives = meshes.flatMap((m) => m.listPrimitives());
  let triangleCount = 0;
  let vertexCount = 0;
  for (const prim of primitives) {
    triangleCount += primitiveTriangleCount(prim);
    vertexCount += prim.getAttribute('POSITION')?.getCount() ?? 0;
  }
  const scenes = root.listScenes();
  let bounds: GltfMetrics['bounds'] = null;
  if (scenes.length > 0) {
    const scene = scenes[0]!;
    const bbox = getBounds(scene);
    bounds = { min: [bbox.min[0], bbox.min[1], bbox.min[2]], max: [bbox.max[0], bbox.max[1], bbox.max[2]] };
  }
  return {
    nodeCount: root.listNodes().length,
    meshCount: meshes.length,
    materialCount: root.listMaterials().length,
    textureCount: root.listTextures().length,
    primitiveCount: primitives.length,
    triangleCount,
    vertexCount,
    bounds,
    extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
  };
}

export interface DegenerateReport {
  totalTriangles: number;
  degenerateTriangles: number;
  nanVertices: number;
}

/** Detects zero-area triangles and NaN/Infinity vertex positions across every TRIANGLES primitive. */
export function findDegenerateGeometry(doc: Document): DegenerateReport {
  let total = 0;
  let degenerate = 0;
  let nanVertices = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const position = prim.getAttribute('POSITION');
      if (!position) continue;
      const positions = position.getArray() as Float32Array | null;
      if (!positions) continue;
      for (let i = 0; i < positions.length; i++) {
        const v: number | undefined = positions[i];
        if (v === undefined || !Number.isFinite(v)) nanVertices++;
      }
      const indices = prim.getIndices();
      const indexArray = indices?.getArray() ?? null;
      const vertexAt = (i: number): [number, number, number] => {
        const base = i * 3;
        return [positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0];
      };
      const triCount = indexArray ? Math.floor(indexArray.length / 3) : Math.floor(positions.length / 9);
      for (let t = 0; t < triCount; t++) {
        total++;
        let ia: number;
        let ib: number;
        let ic: number;
        if (indexArray) {
          ia = indexArray[t * 3] ?? 0;
          ib = indexArray[t * 3 + 1] ?? 0;
          ic = indexArray[t * 3 + 2] ?? 0;
        } else {
          ia = t * 3;
          ib = t * 3 + 1;
          ic = t * 3 + 2;
        }
        const a = vertexAt(ia);
        const b = vertexAt(ib);
        const c = vertexAt(ic);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const cx = uy * vz - uz * vy;
        const cy = uz * vx - ux * vz;
        const cz = ux * vy - uy * vx;
        const areaSq = cx * cx + cy * cy + cz * cz;
        if (!Number.isFinite(areaSq) || areaSq < 1e-12) degenerate++;
      }
    }
  }
  return { totalTriangles: total, degenerateTriangles: degenerate, nanVertices };
}

export interface MissingTextureReport {
  missingCount: number;
  details: string[];
}

/** A material "slot" (baseColor, normal, ...) can reference a Texture whose image payload is
 * empty (0 bytes) — this happens when an exporter forgot to embed the image, or an external URI
 * reference didn't resolve. That's a broken texture reference from the marketplace's perspective. */
export function findMissingTextures(doc: Document): MissingTextureReport {
  const details: string[] = [];
  const seen = new Set<Texture>();
  for (const material of doc.getRoot().listMaterials()) {
    const slots: (Texture | null)[] = [
      material.getBaseColorTexture(),
      material.getNormalTexture(),
      material.getMetallicRoughnessTexture(),
      material.getEmissiveTexture(),
      material.getOcclusionTexture(),
    ];
    for (const tex of slots) {
      if (!tex || seen.has(tex)) continue;
      seen.add(tex);
      const image = tex.getImage();
      if (!image || image.byteLength === 0) {
        details.push(`${material.getName() || 'unnamed material'}: texture "${tex.getName() || tex.getURI() || 'unnamed'}" has no image data`);
      }
    }
  }
  return { missingCount: details.length, details };
}

/** In-place dedup + prune + weld. Returns approximate bytes saved (encoded GLB size delta). */
export async function optimizeDocument(doc: Document): Promise<void> {
  await doc.transform(dedup(), weld({ overwrite: false }), prune({ keepLeaves: false }));
}

export const VARIANT_RATIOS: Record<AssetVariant, number> = {
  ULTRA: 1,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.25,
  MOBILE: 0.1,
  WEB: 0.05,
};

export const VARIANT_TEXTURE_MAX_PX: Record<AssetVariant, number> = {
  ULTRA: 4096,
  HIGH: 2048,
  MEDIUM: 1024,
  LOW: 512,
  MOBILE: 256,
  WEB: 256,
};

/** Attempts to load the real meshoptimizer WASM decimator. Returns undefined (never throws) when
 * the dependency isn't resolvable, so callers can fall back to the honest "estimated" LOD path. */
export async function tryLoadMeshoptSimplifier(): Promise<
  { simplify: (indices: Uint32Array, positions: Float32Array, stride: number, target: number, error: number) => [Uint32Array, number] } | undefined
> {
  try {
    const mod = await import('meshoptimizer');
    await mod.MeshoptSimplifier.ready;
    return mod.MeshoptSimplifier;
  } catch {
    return undefined;
  }
}

/** Exposed for stages that need a plain clone (e.g. the ULTRA variant, which skips decimation). */
export function cloneDocumentSafe(doc: Document): Document {
  return cloneDocumentFn(doc);
}

/** Produces a geometry-simplified clone of `doc` at the given ratio using meshoptimizer. */
export async function simplifyClone(doc: Document, ratio: number, simplifier: NonNullable<Awaited<ReturnType<typeof tryLoadMeshoptSimplifier>>>): Promise<Document> {
  const clone = cloneDocumentFn(doc);
  if (ratio >= 1) return clone;
  await clone.transform(simplify({ simplifier: simplifier as unknown as Parameters<typeof simplify>[0]['simplifier'], ratio, error: 0.01, lockBorder: true }));
  return clone;
}
