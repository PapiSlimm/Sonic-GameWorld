// GPU-rendered thumbnail path — DOCUMENTED, NOT IMPLEMENTED in this environment.
//
// `card.ts` (the actual thumbnail path this worker ships) draws a flat, data-driven 2D card:
// name / category / poly count on a gradient background. It never looks *at* the model. The
// spec's real target is a proper 3D preview render — the asset lit and framed in-engine, like the
// spatial-engine viewport produces for the studio — which needs an actual GPU (headless Chrome +
// WebGL, a `gl`/ANGLE software or hardware context, or a render farm) that this plain Node worker
// container does not have. Rather than fake that with a screenshot-shaped PNG that isn't actually
// a render of the asset, this module defines the interface a real implementation must satisfy and
// leaves it unimplemented so nothing pretends to be a GPU render that isn't one.
//
// Wiring a real implementation later: swap `resolveRenderer()`'s return value for a class
// implementing `Renderer`, no other file in this worker needs to change — `index.ts` already
// calls stages by this interface, falling back to the card renderer when `render()` throws or
// when `resolveRenderer()` returns the fallback (the default today).
import type { AssetVariant } from '@sonic-gameworld/world-schema';

export interface RenderSceneOptions {
  /** GLB (or other engine-loadable) source bytes for the model to render. */
  modelBytes: Buffer;
  /** Which LOD/variant to load — GPU renders should generally use a light variant (LOW/MOBILE). */
  variant?: AssetVariant;
  widthPx: number;
  heightPx: number;
  /** Camera framing: 'AUTO' fits the model's bounding sphere; specific angles support turntable
   * sets (front/three-quarter/top) for richer marketplace galleries. */
  camera?: 'AUTO' | 'FRONT' | 'THREE_QUARTER' | 'TOP';
  background?: 'TRANSPARENT' | 'STUDIO_GRADIENT';
}

export interface RenderSceneResult {
  png: Buffer;
  widthPx: number;
  heightPx: number;
  /** Camera transform actually used, for reproducibility / debugging. */
  cameraUsed: string;
}

/**
 * A GPU-backed 3D thumbnail renderer. Real implementations load the model with a glTF loader
 * (three.js server-side via `gl`/headless-gl, or by driving an actual headless-browser WebGL
 * context), frame it, light it with the same neutral studio rig the marketplace product-page
 * viewer uses, and rasterize one or more angles.
 *
 * Contract for a real implementation:
 *  - MUST NOT block the event loop for more than a few hundred ms per call (run heavy WebGL work
 *    in a worker_thread or a sidecar process reached over a small RPC, not inline).
 *  - MUST throw (never return a black/blank frame silently) when the GPU context is unavailable,
 *    so the worker can fall back to the card renderer instead of publishing a broken thumbnail.
 *  - SHOULD be idempotent and framing-deterministic for the same model + options (marketplace
 *    thumbnails are re-generated on republish; flapping images between runs is a bad UX).
 */
export interface Renderer {
  readonly name: string;
  readonly kind: 'GPU';
  isAvailable(): Promise<boolean>;
  render(opts: RenderSceneOptions): Promise<RenderSceneResult>;
}

/**
 * No GPU renderer ships in this worker container. `isAvailable()` is honestly `false` rather than
 * a `render()` that throws "not implemented" on the primary path — callers are expected to check
 * `isAvailable()` (or catch) and use the card renderer, which they always do today via
 * `resolveRenderer()` returning `undefined`.
 */
export class UnavailableGpuRenderer implements Renderer {
  readonly name = 'none';
  readonly kind = 'GPU' as const;
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async render(): Promise<RenderSceneResult> {
    throw new Error('No GPU Renderer is configured in worker-thumbnails. Implement Renderer and wire it in resolveRenderer().');
  }
}

/** Resolves the active GPU renderer, or `undefined` when none is configured/available — the
 * worker then uses `card.ts`'s sharp-based 2D card unconditionally, which is what happens today. */
export async function resolveRenderer(): Promise<Renderer | undefined> {
  const candidate = new UnavailableGpuRenderer();
  return (await candidate.isAvailable()) ? candidate : undefined;
}
