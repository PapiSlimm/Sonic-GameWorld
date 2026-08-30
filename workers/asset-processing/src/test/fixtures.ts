// Builds a tiny, valid, in-memory GLB using @gltf-transform/core — no fixture files on disk, so
// tests exercise the exact same parse path (loadDocument/computeMetrics/...) production traffic
// does, per CONTRACTS.md §13's testing note ("build a tiny GLB in-memory with gltf-transform and
// run the pipeline stages").
import { Document } from '@gltf-transform/core';
import { writeGLB } from '../gltf.js';

export interface TinyGlbOptions {
  /** Injects a degenerate (zero-area) triangle alongside the healthy ones. */
  withDegenerateTriangle?: boolean;
  /** Adds a material with a baseColor texture that has an empty image payload. */
  withMissingTexture?: boolean;
  name?: string;
}

/** A single triangle mesh, optionally corrupted for the negative-path tests in pipeline.test.ts. */
export async function buildTinyGlb(opts: TinyGlbOptions = {}): Promise<Buffer> {
  const doc = new Document();
  const buffer = doc.createBuffer();

  // withDegenerateTriangle: every vertex coincides at the same point, so the sole triangle has
  // zero area — a 100% degenerate mesh, comfortably over the 3D_VALIDATION stage's 50% threshold.
  const positions = opts.withDegenerateTriangle ? new Float32Array([2, 2, 2, 2, 2, 2, 2, 2, 2]) : new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);

  const positionAccessor = doc.createAccessor('POSITION').setType('VEC3').setArray(positions).setBuffer(buffer);
  const indexAccessor = doc.createAccessor('indices').setType('SCALAR').setArray(indices).setBuffer(buffer);

  const material = doc.createMaterial('mat_body');
  if (opts.withMissingTexture) {
    const texture = doc.createTexture('tex_albedo').setMimeType('image/png').setImage(new Uint8Array(0));
    material.setBaseColorTexture(texture);
  }

  const primitive = doc.createPrimitive().setMode(4 /* TRIANGLES */).setAttribute('POSITION', positionAccessor).setIndices(indexAccessor).setMaterial(material);
  const mesh = doc.createMesh(opts.name ?? 'tiny_mesh').addPrimitive(primitive);
  const node = doc.createNode(opts.name ?? 'tiny_node').setMesh(mesh);
  doc.createScene('tiny_scene').addChild(node);

  return writeGLB(doc);
}
