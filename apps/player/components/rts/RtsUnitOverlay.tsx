'use client';

import { useSyncExternalStore } from 'react';
import { Crosshair, MoveRight } from 'lucide-react';
import type { RtsViewportRuntime } from '../../lib/rts/viewportRuntime';
import { factionColor } from './rtsTheme';

/** How long a move/attack-move feedback marker stays visible before fading out — exported so
 * `RtsViewport` can prune the runtime's feedback-marker list at the same cadence this overlay
 * fades them, keeping "still rendering, but invisible" markers from lingering in the snapshot. */
export const FEEDBACK_MAX_AGE_MS = 900;

export interface RtsUnitOverlayProps {
  runtime: RtsViewportRuntime;
}

/**
 * Unit selection + command feedback overlay (docs/RTS-CONTRACTS.md §7: "unit selection (drag-box +
 * click, health bars over selected units), command feedback (move markers, attack-move cursor)").
 * Subscribes to `RtsViewportRuntime` via `useSyncExternalStore` so a full React re-render never
 * happens on the animation-frame cadence that drives screen-position recomputation — only when the
 * runtime's snapshot object identity actually changes.
 */
export function RtsUnitOverlay({ runtime }: RtsUnitOverlayProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {snapshot.unitMarkers.map((marker) => {
        if (!marker.screen || (!marker.isSelected && marker.health >= marker.maxHealth)) return null;
        const pct = marker.maxHealth > 0 ? Math.max(0, Math.min(100, (marker.health / marker.maxHealth) * 100)) : 0;
        const barColor = pct > 50 ? '#38F5C8' : pct > 20 ? '#F4C542' : '#EF4444';
        return (
          <div
            key={marker.id}
            className="absolute flex -translate-x-1/2 flex-col items-center gap-0.5"
            style={{ left: marker.screen.x, top: marker.screen.y }}
          >
            {marker.isSelected && (
              <span
                className="h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: factionColor(marker.factionId), boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}
                aria-hidden
              />
            )}
            <div className="h-1 w-8 overflow-hidden rounded-full bg-black/60">
              <div className="h-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
          </div>
        );
      })}

      {snapshot.feedbackMarkers.map((marker) => {
        const ageMs = Date.now() - marker.createdAtMs;
        const opacity = Math.max(0, 1 - ageMs / FEEDBACK_MAX_AGE_MS);
        if (opacity <= 0) return null;
        const isAttack = marker.kind === 'ATTACK_MOVE';
        // Scales down from 1.8x to 1x over its lifetime alongside the opacity fade — a plain CSS
        // transition driven by inline style (no styled-jsx/keyframes dependency, matching this
        // app's existing components) rather than a real animation.
        const scale = 1 + 0.8 * (opacity > 0 ? opacity : 0);
        return (
          <div
            key={marker.id}
            className="absolute transition-transform"
            style={{
              left: marker.screen.x,
              top: marker.screen.y,
              opacity,
              color: isAttack ? '#EF4444' : '#38F5C8',
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            {isAttack ? <Crosshair className="h-6 w-6" aria-hidden /> : <MoveRight className="h-6 w-6" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
