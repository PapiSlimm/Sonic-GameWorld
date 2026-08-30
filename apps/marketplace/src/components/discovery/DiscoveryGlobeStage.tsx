'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GlobeCluster } from '../../lib/spatialTree.js';
import { CLUSTER_BY_CATEGORY, type DemoProduct, type DiscoveryCluster } from '../../lib/types.js';
import { SpatialCanvas, type SpatialCanvasProps } from './SpatialCanvas.js';

/**
 * Detects whether the browser can actually stand up a WebGL context. `DiscoveryGlobe` (spatial-engine's
 * Three.js-backed globe) needs this; the 2D radial SVG fallback (`SpatialCanvas`) doesn't.
 */
function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

const RemoteDiscoveryGlobe = dynamic(
  () =>
    import('@sonic-gameworld/spatial-engine/react').then((mod) => {
      // The build-time shim (see next.config.mjs) intentionally omits this export while
      // spatial-engine's React bindings aren't compiled yet — treat that exactly like "not
      // available" and let the caller's fallback render instead.
      const Comp = mod.DiscoveryGlobe;
      if (!Comp) throw new Error('spatial-engine: DiscoveryGlobe not available yet');
      return Comp;
    }),
  { ssr: false, loading: () => <GlobeLoading /> },
);

function GlobeLoading() {
  return (
    <div className="flex h-[420px] w-full items-center justify-center rounded-panel border border-border bg-bg sm:h-[480px]">
      <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-muted">Spinning up the spatial engine…</span>
    </div>
  );
}

interface GlobeErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}
interface GlobeErrorBoundaryState {
  failed: boolean;
}

/** Catches both "module unavailable" (thrown above) and any runtime/WebGL error from the real globe. */
class GlobeErrorBoundary extends Component<GlobeErrorBoundaryProps, GlobeErrorBoundaryState> {
  override state: GlobeErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): GlobeErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[DiscoveryGlobeStage] falling back to the 2D radial graph:', error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface DiscoveryGlobeStageProps extends SpatialCanvasProps {
  /** Full catalog, structurally compatible with spatial-engine's `DiscoveryProduct` (id/name/category/…). */
  products: DemoProduct[];
  clusters: GlobeCluster[];
  selectedCluster: DiscoveryCluster | null;
}

/**
 * Spatial discovery home surface. Tries the real 3D `DiscoveryGlobe` from
 * `@sonic-gameworld/spatial-engine/react` (loaded client-only via `next/dynamic`, per CONTRACTS §11 —
 * "Must be SSR-safe"); falls back to the 2D radial SVG graph (`SpatialCanvas`) whenever WebGL is
 * unavailable, the module hasn't been built yet, or it throws at runtime.
 *
 * The real globe has no built-in notion of "cluster"/"genre" drill-down (it lays every product out on
 * one sphere and reports clicks/hovers by product) — narrowing to the selected cluster/genre when one
 * is picked (in the tree, or previously on the globe itself) keeps the two views in sync in spirit
 * without fighting the real component's simpler, flatter interaction model.
 */
export function DiscoveryGlobeStage({ products, clusters, selectedCluster, selectedGenreKey, onSelectProduct, ...rest }: DiscoveryGlobeStageProps) {
  // Matches the server-rendered (and initial client) markup exactly — the WebGL probe only runs
  // after mount, in an effect, so hydration never sees a mismatch between server and client output.
  const [webglReady, setWebglReady] = useState(false);
  useEffect(() => setWebglReady(hasWebGL()), []);

  const visibleProducts = useMemo(
    () =>
      products.filter((p) => {
        if (selectedGenreKey) return `${CLUSTER_BY_CATEGORY[p.category]}:${p.genre[0] ?? ''}` === selectedGenreKey;
        if (selectedCluster) return CLUSTER_BY_CATEGORY[p.category] === selectedCluster;
        return true;
      }),
    [products, selectedCluster, selectedGenreKey],
  );

  const fallback = (
    <SpatialCanvas clusters={clusters} selectedCluster={selectedCluster} selectedGenreKey={selectedGenreKey} onSelectProduct={onSelectProduct} {...rest} />
  );
  if (!webglReady) return fallback;
  return (
    <GlobeErrorBoundary fallback={fallback}>
      <RemoteDiscoveryGlobe
        products={visibleProducts}
        background="#05070B"
        className="h-[420px] w-full rounded-panel border border-border sm:h-[480px]"
        onSelect={(node) => onSelectProduct(node.productId)}
      />
    </GlobeErrorBoundary>
  );
}
