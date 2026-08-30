'use client';

import dynamic from 'next/dynamic';
import { useMemo, type ComponentType } from 'react';
import { Loader2, ServerCrash } from 'lucide-react';
import type { CameraMode } from '@sonic-gameworld/world-schema';
import type { EntityPatch, WorldDocument } from '@sonic-gameworld/gameworld-sdk';

/**
 * Props accepted by `@sonic-gameworld/spatial-engine`'s React `<SpatialViewport>` (CONTRACTS §11).
 * Declared locally because the dynamic import below is resolved at runtime — this keeps the rest
 * of the app fully typed against the documented contract even before that package ships its
 * `dist/react.js` build.
 */
export interface SpatialViewportProps {
  world: WorldDocument;
  selection: string[];
  hoveredId?: string | null;
  cameraMode: CameraMode;
  trackedEntityId?: string | null;
  visibleLayerIds?: string[];
  className?: string;
  cdnBaseUrl?: string;
  onSelect: (ids: string[]) => void;
  onHover?: (id: string | null) => void;
  onEntityChange: (id: string, patch: EntityPatch) => void;
  onHudState?: (hud: { fps: number; counts: Record<string, number> }) => void;
}

const SpatialViewport = dynamic<SpatialViewportProps>(
  () =>
    import('@sonic-gameworld/spatial-engine/react')
      .then((mod) => mod.SpatialViewport)
      // Defensive: a lazy-chunk load failure at runtime (e.g. a stale deploy) degrades to a
      // static message instead of crashing the whole editor.
      .catch(() => ViewportUnavailable as ComponentType<SpatialViewportProps>),
  {
    ssr: false,
    loading: () => <ViewportLoading />,
  },
);

function ViewportLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,rgba(56,245,200,0.08),transparent_60%)] bg-bg">
      <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
      <p className="font-hud text-xs uppercase tracking-[0.3em] text-muted">Loading spatial viewport…</p>
    </div>
  );
}

function ViewportUnavailable() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg text-center">
      <ServerCrash className="h-8 w-8 text-danger" aria-hidden />
      <p className="max-w-xs text-sm text-muted">
        The 3D viewport (<code className="text-text/80">@sonic-gameworld/spatial-engine/react</code>) could not be loaded.
        Scene editing still works through the hierarchy and inspector panels.
      </p>
    </div>
  );
}

export interface ViewportPaneProps {
  world: WorldDocument;
  selection: string[];
  hoveredId: string | null;
  cameraMode: CameraMode;
  trackedEntityId: string | null;
  onSelect: (ids: string[]) => void;
  onHover: (id: string | null) => void;
  onEntityChange: (id: string, patch: EntityPatch) => void;
}

export function ViewportPane({ world, selection, hoveredId, cameraMode, trackedEntityId, onSelect, onHover, onEntityChange }: ViewportPaneProps) {
  const visibleLayerIds = useMemo(() => world.layers.filter((l) => l.visible).map((l) => l.id), [world.layers]);
  return (
    <div className="relative h-full w-full overflow-hidden bg-bg bg-grid bg-[length:32px_32px]">
      <SpatialViewport
        world={world}
        selection={selection}
        hoveredId={hoveredId}
        cameraMode={cameraMode}
        trackedEntityId={trackedEntityId}
        visibleLayerIds={visibleLayerIds}
        className="h-full w-full"
        onSelect={onSelect}
        onHover={onHover}
        onEntityChange={onEntityChange}
      />
    </div>
  );
}
