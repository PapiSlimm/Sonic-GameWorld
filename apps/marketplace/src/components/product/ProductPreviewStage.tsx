'use client';

import dynamic from 'next/dynamic';
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box } from 'lucide-react';
import { createEmptyWorld } from '@sonic-gameworld/world-schema';
import { CATEGORY_LABEL, GENRE_LABEL } from '../../lib/types.js';
import type { DemoProduct } from '../../lib/types.js';
import { ProductThumb } from '../discovery/ProductThumb.js';

function hasWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const RemoteSpatialViewport = dynamic(
  () =>
    import('@sonic-gameworld/spatial-engine/react').then((mod) => {
      const Comp = mod.SpatialViewport;
      if (!Comp) throw new Error('spatial-engine: SpatialViewport not available yet');
      return Comp;
    }),
  { ssr: false, loading: () => <ThumbnailFallback /> },
);

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}
class ViewportErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ThumbnailFallback({ product }: { product?: DemoProduct }) {
  if (!product) return <div className="flex h-full min-h-[280px] items-center justify-center bg-bg" />;
  return (
    <div className="relative h-full min-h-[280px]">
      <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" iconClassName="h-14 w-14" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 bg-gradient-to-t from-bg/90 to-transparent p-4">
        <span className="rounded-full border border-border bg-panel/80 px-2.5 py-1 font-hud text-[10px] uppercase tracking-wider text-muted backdrop-blur">
          {CATEGORY_LABEL[product.category]}
        </span>
        {product.genre.slice(0, 2).map((g) => (
          <span key={g} className="rounded-full border border-border bg-panel/80 px-2.5 py-1 font-hud text-[10px] uppercase tracking-wider text-muted backdrop-blur">
            {GENRE_LABEL[g]}
          </span>
        ))}
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-panel/80 px-2.5 py-1 font-hud text-[9px] uppercase tracking-[0.15em] text-muted backdrop-blur">
        <Box className="h-3 w-3" /> Preview thumbnail
      </div>
    </div>
  );
}

/**
 * 3D preview on `/p/[slug]`: `SpatialViewport` in preview mode when `@sonic-gameworld/spatial-engine/react`
 * is available and WebGL works, per CONTRACTS §12 ("SpatialViewport preview mode or thumbnail") — otherwise
 * a styled thumbnail card. Builds a minimal, correctly-sized `WorldDocument` from the product's spec sheet
 * (`createEmptyWorld`) purely to give the viewport something schema-valid to frame.
 */
export function ProductPreviewStage({ product }: { product: DemoProduct }) {
  const [webglReady, setWebglReady] = useState(false);
  useEffect(() => setWebglReady(hasWebGL()), []);

  const world = useMemo(
    () =>
      createEmptyWorld({
        name: product.name,
        description: product.description,
        genre: product.genre,
        sizeKm2: product.spec.worldSizeKm2 ?? 1,
        maxPlayers: product.spec.maxPlayers ?? 16,
        ownerId: product.creator.id,
      }),
    [product],
  );

  const fallback = <ThumbnailFallback product={product} />;
  if (!webglReady) return <div className="overflow-hidden rounded-panel border border-border">{fallback}</div>;

  return (
    <div className="overflow-hidden rounded-panel border border-border">
      <ViewportErrorBoundary fallback={fallback}>
        <RemoteSpatialViewport world={world} cameraMode="ORBIT" className="h-full min-h-[280px] w-full" />
      </ViewportErrorBoundary>
    </div>
  );
}
