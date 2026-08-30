/**
 * Ambient module declaration for `@sonic-gameworld/spatial-engine/react`.
 *
 * That subpath is declared in the package's `exports` map (per CONTRACTS §11), but its compiled
 * `dist/react.d.ts` might not exist yet in a given checkout if the concurrent agent building it hasn't
 * finished — TypeScript's module resolution falls back to this ambient declaration whenever the real
 * file can't be found, so `pnpm typecheck` stays green either way. The shapes below are kept in sync
 * with the real `dist/react.d.ts` (spot-checked against it directly) specifically so this fallback
 * never *masks* a real mismatch — if the real component's props ever drift from this file, update both.
 *
 * Every export is typed as possibly `undefined` on purpose: `DiscoveryGlobeStage`/`ProductPreviewStage`
 * do `m.DiscoveryGlobe ?? Fallback`, which is correct whether the real module (defines it) or the
 * build-time shim (next.config.mjs, omits it) ends up loaded.
 */
declare module '@sonic-gameworld/spatial-engine/react' {
  import type { ComponentType, CSSProperties, ReactNode } from 'react';
  import type { Genre, ProductCategory, WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
  import type { CameraMode } from '@sonic-gameworld/world-schema';

  // ---- Discovery globe ----
  export interface DiscoveryProduct {
    id: string;
    slug?: string;
    name: string;
    category: ProductCategory;
    genre?: Genre[];
    thumbnailUrl?: string | null;
    rating?: number;
    sales?: number;
    priceCents?: number;
  }
  export interface DiscoveryNode {
    id: string;
    productId: string;
    name: string;
    slug?: string;
    category: ProductCategory;
    genres: Genre[];
    thumbnailUrl: string | null;
    rating: number;
    sales: number;
    priceCents: number;
    position: { x: number; y: number; z: number };
    size: number;
  }
  export interface DiscoveryGlobeProps {
    products: DiscoveryProduct[];
    radius?: number;
    className?: string;
    style?: CSSProperties;
    background?: string | number;
    autoRotate?: boolean;
    onHover?: (node: DiscoveryNode | null) => void;
    onSelect?: (node: DiscoveryNode) => void;
  }
  export const DiscoveryGlobe: ComponentType<DiscoveryGlobeProps> | undefined;

  // ---- Spatial viewport (SpatialEngine React binding) ----
  export type EntityChangePatch = Partial<Omit<WorldEntity, 'id'>>;
  export interface SpatialViewportProps {
    world: WorldDocument;
    selection?: string[];
    hoveredId?: string | null;
    cameraMode?: CameraMode;
    trackedEntityId?: string | null;
    visibleLayerIds?: string[];
    className?: string;
    style?: CSSProperties;
    cdnBaseUrl?: string;
    background?: string | number;
    onSelect?: (ids: string[]) => void;
    onHover?: (id: string | null) => void;
    onEntityChange?: (id: string, patch: EntityChangePatch) => void;
    onHudState?: (hud: { fps: number; counts: Record<string, number> }) => void;
    onError?: (err: unknown) => void;
    children?: ReactNode;
  }
  export const SpatialViewport: ComponentType<SpatialViewportProps> | undefined;

  export const HUD: ComponentType<Record<string, unknown>> | undefined;
  export const LayerPanel: ComponentType<Record<string, unknown>> | undefined;
  export const TrackingPanel: ComponentType<Record<string, unknown>> | undefined;
  export function useSpatialEngine(...args: unknown[]): unknown;
}
