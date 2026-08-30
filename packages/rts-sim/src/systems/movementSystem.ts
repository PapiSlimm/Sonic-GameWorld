// Ported from docs/reference/global-dominance/src/engine/GameEngine.ts's `movementSystem`
// (docs/RTS-CONTRACTS.md §3). XZ instead of XY; `y` is derived separately (0 for ground units,
// AIR_FLIGHT_HEIGHT_M for AIR — see constants.ts) rather than physically simulated, per §2's "no
// vertical physics for v1" note. Keeps the reference's exact possession carve-out
// (`if (viewMode === 'FPS' && unit.id === controlledUnitId) return;`), generalized to
// `state.possessedUnitIds` (plural — see types.ts).
import {
  AIR_FLIGHT_HEIGHT_M,
  MOVEMENT_ARRIVAL_RADIUS,
  MOVEMENT_BOUNDARY_MARGIN,
  MOVEMENT_FRICTION,
  MOVEMENT_WAYPOINT_ARRIVAL_DIST,
  STEERING_NEIGHBOR_QUERY_RADIUS,
  STEERING_SEPARATION_SCALE,
} from '../constants';
import type { RTSMatchState, RTSUnit } from '../types';
import type { SpatialGrid } from './spatialGrid';
import { getArrival, getSeek, getSeparation } from './steering';
import { clamp, distanceXZ, findUnit } from './util';

export function movementSystem(state: RTSMatchState, dtSeconds: number, grid: SpatialGrid): void {
  const possessed = new Set(state.possessedUnitIds);

  for (const unit of state.entities.units) {
    if (unit.state === 'DEAD') continue;
    if (possessed.has(unit.id)) continue;

    let steerX = 0;
    let steerZ = 0;

    const nearbyIds = grid.getNearby(unit.transform.position.x, unit.transform.position.z, STEERING_NEIGHBOR_QUERY_RADIUS);
    const neighbors: RTSUnit[] = [];
    for (const id of nearbyIds) {
      const u = findUnit(state, id);
      if (u && u.state !== 'DEAD') neighbors.push(u);
    }
    const sep = getSeparation(unit, neighbors);
    steerX += sep.x * STEERING_SEPARATION_SCALE;
    steerZ += sep.z * STEERING_SEPARATION_SCALE;

    if (unit.path.length > 0) {
      const next = unit.path[0]!;
      const dist = distanceXZ(unit.transform.position, next);

      if (dist > MOVEMENT_WAYPOINT_ARRIVAL_DIST) {
        const force = unit.path.length === 1 ? getArrival(unit, next, MOVEMENT_ARRIVAL_RADIUS) : getSeek(unit, next);
        steerX += force.x;
        steerZ += force.z;
      } else {
        unit.path.shift();

        if (unit.path.length === 0) {
          if (unit.commands.length > 0) {
            const finishedCmd = unit.commands[0]!;
            if (finishedCmd.type === 'MOVE') unit.commands.shift();
          }
          if (unit.commands.length === 0) unit.state = 'IDLE';
        }
      }
    }

    unit.velocity.x = (unit.velocity.x + steerX * dtSeconds) * MOVEMENT_FRICTION;
    unit.velocity.z = (unit.velocity.z + steerZ * dtSeconds) * MOVEMENT_FRICTION;
    unit.velocity.y = 0;

    unit.transform.position.x += unit.velocity.x * dtSeconds;
    unit.transform.position.z += unit.velocity.z * dtSeconds;

    unit.transform.position.x = clamp(unit.transform.position.x, MOVEMENT_BOUNDARY_MARGIN, state.map.widthM - MOVEMENT_BOUNDARY_MARGIN);
    unit.transform.position.z = clamp(unit.transform.position.z, MOVEMENT_BOUNDARY_MARGIN, state.map.depthM - MOVEMENT_BOUNDARY_MARGIN);
    unit.transform.position.y = unit.unitClass === 'AIR' ? AIR_FLIGHT_HEIGHT_M : 0;

    if (Math.abs(unit.velocity.x) > 0.1 || Math.abs(unit.velocity.z) > 0.1) {
      unit.transform.rotationY = Math.atan2(unit.velocity.z, unit.velocity.x);
    }
  }
}
