import { createContext, useContext } from 'react';
import type { SpatialEngine } from '../engine/SpatialEngine.js';

/**
 * Shares a single `SpatialEngine` instance between `<SpatialViewport>` and any overlay components
 * (`<HUD>`, `<LayerPanel>`, `<TrackingPanel>`, `<CameraModeBar>`, `<WorldControlBar>`) rendered as its
 * children, so consumers can compose `<SpatialViewport><HUD /><LayerPanel /></SpatialViewport>` without
 * prop-drilling. Every overlay component also accepts an explicit `engine` prop for standalone use
 * outside a `<SpatialViewport>` (e.g. driven by `useSpatialEngine()` directly).
 */
export const SpatialEngineContext = createContext<SpatialEngine | null>(null);

export function useSpatialEngineContext(): SpatialEngine | null {
  return useContext(SpatialEngineContext);
}
