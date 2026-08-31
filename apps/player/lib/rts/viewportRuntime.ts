/**
 * Tiny external-store pub/sub bridging the 3D viewport (which recomputes unit screen positions
 * every animation frame, at full framerate) to React-rendered HUD overlays (health bars, move/
 * attack-move markers, the minimap's camera-viewport rectangle) — mirrors
 * `lib/engine/playerRuntime.ts`'s exact pattern for the same reason: overlays subscribe with
 * `useSyncExternalStore` instead of forcing a full React re-render 60 times a second.
 */

export interface UnitScreenMarker {
  id: string;
  factionId: string;
  unitClass: string;
  screen: { x: number; y: number } | null; // null when off-screen/behind the camera
  health: number;
  maxHealth: number;
  isSelected: boolean;
  /** Current `RTSUnit.heat` (docs/RTS-CONTRACTS.md §9's munition/heat system), 0..~1.2 — see
   * `RtsUnitOverlay`'s heat gauge, shown for a selected unit alongside its health bar. */
  heat: number;
  /** True when this is an enemy unit currently thermally exposed (heat-revealed regardless of
   * fog-of-war/cover, §9's `isThermallyExposed`) to the local viewer — drives `RtsUnitOverlay`'s
   * "Detected" stealth-broken indicator. Always false for the viewer's own units — a unit is never
   * "detected" to its own side. */
  isThermallyDetected: boolean;
}

export type FeedbackMarkerKind = 'MOVE' | 'ATTACK_MOVE';

export interface FeedbackMarker {
  id: string;
  kind: FeedbackMarkerKind;
  screen: { x: number; y: number };
  createdAtMs: number;
}

export interface CameraViewportInfo {
  anchor: { x: number; z: number };
  distanceM: number;
}

export interface RtsViewportSnapshot {
  unitMarkers: UnitScreenMarker[];
  feedbackMarkers: FeedbackMarker[];
  camera: CameraViewportInfo | null;
}

export interface RtsViewportRuntime {
  getSnapshot: () => RtsViewportSnapshot;
  setUnitMarkers: (markers: UnitScreenMarker[]) => void;
  setCamera: (camera: CameraViewportInfo) => void;
  addFeedbackMarker: (marker: Omit<FeedbackMarker, 'id'>) => void;
  /** Drops feedback markers older than `maxAgeMs` relative to `nowMs` — call once per frame. */
  pruneFeedbackMarkers: (nowMs: number, maxAgeMs: number) => void;
  /**
   * HUD -> viewport control channel, the mirror image of everything else on this runtime
   * (viewport -> HUD): the minimap's "click to recenter" (§7) has no other way to reach the
   * `RTSMode` camera handler that only `RtsViewport`'s mount effect holds a reference to, so it
   * queues a request here instead. Does NOT `notify()` subscribers — nothing renders off this
   * field, `RtsViewport`'s own RAF loop polls `consumeJumpToRequest()` once per frame.
   */
  requestJumpTo: (x: number, z: number) => void;
  /** Reads and clears the pending jump-to request, if any — call once per frame from the RAF loop. */
  consumeJumpToRequest: () => { x: number; z: number } | null;
  subscribe: (onChange: () => void) => () => void;
}

let markerSeq = 0;

export function createRtsViewportRuntime(): RtsViewportRuntime {
  let state: RtsViewportSnapshot = { unitMarkers: [], feedbackMarkers: [], camera: null };
  let pendingJumpTo: { x: number; z: number } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => state,
    setUnitMarkers(markers) {
      state = { ...state, unitMarkers: markers };
      notify();
    },
    setCamera(camera) {
      state = { ...state, camera };
      notify();
    },
    addFeedbackMarker(marker) {
      markerSeq += 1;
      state = { ...state, feedbackMarkers: [...state.feedbackMarkers, { ...marker, id: `marker-${markerSeq}` }] };
      notify();
    },
    pruneFeedbackMarkers(nowMs, maxAgeMs) {
      const kept = state.feedbackMarkers.filter((m) => nowMs - m.createdAtMs < maxAgeMs);
      if (kept.length !== state.feedbackMarkers.length) {
        state = { ...state, feedbackMarkers: kept };
        notify();
      }
    },
    requestJumpTo(x, z) {
      pendingJumpTo = { x, z };
    },
    consumeJumpToRequest() {
      const req = pendingJumpTo;
      pendingJumpTo = null;
      return req;
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
