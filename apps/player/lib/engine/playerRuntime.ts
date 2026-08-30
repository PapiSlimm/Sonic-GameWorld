/**
 * Tiny external-store pub/sub for the live player position/heading, so the 3D viewport (which
 * mutates position every animation frame via refs, at full framerate, for smooth motion) can
 * share state with React-rendered overlays (Minimap, HUD proximity checks) without forcing a
 * React re-render 60 times a second. Overlays subscribe with `useSyncExternalStore`; the
 * viewport calls `set()` at a throttled rate (see `PlayViewport.tsx`).
 */

export interface PlayerSnapshot {
  x: number;
  z: number;
  yaw: number;
}

export interface PlayerRuntime {
  getSnapshot: () => PlayerSnapshot;
  set: (x: number, z: number, yaw: number) => void;
  subscribe: (onChange: () => void) => () => void;
}

export function createPlayerRuntime(initial: PlayerSnapshot): PlayerRuntime {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    set(x, z, yaw) {
      state = { x, z, yaw };
      for (const listener of listeners) listener();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
