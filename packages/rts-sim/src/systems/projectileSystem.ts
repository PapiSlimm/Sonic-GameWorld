// Ported near-verbatim from docs/reference/global-dominance/src/engine/GameEngine.ts's
// `projectileSystem` (docs/RTS-CONTRACTS.md §3). Building hit-testing uses `cellX/cellZ * cellSizeM`
// instead of the reference's `position.x/y * CELL_SIZE`, matching this package's cell-grid ↔
// world-meters convention (see types.ts's `RTSBuilding`).
//
// Deviation from the reference: movement toward the target is clamped to the remaining distance.
// The reference ran on real-time `requestAnimationFrame` deltas (~16ms), so a 750 units/sec
// projectile moved ~12 units/frame — right around `PROJECTILE_HIT_DISTANCE` (12), so it would
// naturally land inside the hit radius on its final frame. This package's fixed 10Hz tick
// (docs/RTS-CONTRACTS.md §4) moves a projectile ~75 units/tick instead: without clamping, a
// projectile can tunnel straight through and past the 12-unit hit window in one tick, then
// recompute a *reversed* direction toward the (now-behind-it) target next tick, overshoot again on
// the way back, and oscillate forever — never resolving, and never dealing damage. Clamping travel
// to the remaining distance (so the projectile lands exactly on target instead of past it) fixes
// this without changing the reference's damage/targeting behavior at all.
import { PROJECTILE_HIT_DISTANCE, PROJECTILE_UNIT_DAMAGE_RADIUS, PROJECTILE_UNIT_HEAT_ON_HIT } from '../constants';
import type { RTSMatchState, RTSProjectile } from '../types';
import { distanceXZ } from './util';

export function projectileSystem(state: RTSMatchState, dtSeconds: number): void {
  const remaining: RTSProjectile[] = [];

  for (const p of state.entities.projectiles) {
    const dist = distanceXZ(p.position, p.targetPosition);

    if (dist < PROJECTILE_HIT_DISTANCE) {
      for (const u of state.entities.units) {
        if (u.factionId !== p.factionId && u.state !== 'DEAD' && distanceXZ(p.position, u.transform.position) < PROJECTILE_UNIT_DAMAGE_RADIUS) {
          u.health = Math.max(0, u.health - p.damage);
          u.heat = Math.min(1.0, u.heat + PROJECTILE_UNIT_HEAT_ON_HIT);
        }
      }

      for (const b of state.entities.buildings) {
        if (b.factionId === p.factionId || b.health <= 0) continue;
        const bx = b.cellX * state.map.cellSizeM;
        const bz = b.cellZ * state.map.cellSizeM;
        const bw = b.sizeCells.w * state.map.cellSizeM;
        const bd = b.sizeCells.d * state.map.cellSizeM;
        if (p.position.x >= bx && p.position.x <= bx + bw && p.position.z >= bz && p.position.z <= bz + bd) {
          b.health = Math.max(0, b.health - p.damage);
        }
      }
    } else {
      const dx = (p.targetPosition.x - p.position.x) / dist;
      const dz = (p.targetPosition.z - p.position.z) / dist;
      const travel = Math.min(p.speed * dtSeconds, dist); // clamp: never tunnel past the target
      p.position.x += dx * travel;
      p.position.z += dz * travel;
      remaining.push(p);
    }
  }

  state.entities.projectiles = remaining;
}
