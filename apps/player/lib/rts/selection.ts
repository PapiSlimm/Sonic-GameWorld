/** Pure geometry helpers for marquee drag-select — kept framework/three.js-free so they're testable
 * without a canvas. `RtsViewport.tsx` supplies the already-projected screen-space points (via
 * `THREE.Vector3.project()` against the live camera) and calls these for the actual hit-testing. */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function pointInRect(p: ScreenPoint, rect: ScreenRect): boolean {
  const minX = Math.min(rect.x0, rect.x1);
  const maxX = Math.max(rect.x0, rect.x1);
  const minY = Math.min(rect.y0, rect.y1);
  const maxY = Math.max(rect.y0, rect.y1);
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

/** A drag gesture only counts as a marquee (vs. a click) once it's moved at least this many CSS
 * pixels — avoids every plain click briefly opening (and immediately closing) an empty box. */
export const MARQUEE_MIN_DRAG_PX = 4;

export function isMarqueeDrag(start: ScreenPoint, end: ScreenPoint, thresholdPx = MARQUEE_MIN_DRAG_PX): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) >= thresholdPx;
}

/** Filters `candidates` (id + current screen position) to those inside `rect`, restricted to
 * `ownFactionUnitIds` — an RTS marquee only ever selects your own units, never the enemy's. */
export function unitsInMarquee(
  candidates: { id: string; screen: ScreenPoint; factionId: string }[],
  rect: ScreenRect,
  localFactionId: string,
): string[] {
  return candidates.filter((c) => c.factionId === localFactionId && pointInRect(c.screen, rect)).map((c) => c.id);
}
