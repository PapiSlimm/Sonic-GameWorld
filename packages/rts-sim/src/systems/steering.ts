// Ported near-verbatim from docs/reference/global-dominance/src/engine/Steering.ts
// (docs/RTS-CONTRACTS.md §3). XZ instead of XY; `y` is untouched (always 0 in the returned force).
import { STEERING_SEPARATION_RADIUS_INFANTRY, STEERING_SEPARATION_RADIUS_OTHER, STEERING_SPEED_SCALE } from '../constants';
import type { RTSUnit, Vec3 } from '../types';

export interface SteeringForce {
  x: number;
  z: number;
}

export function getSeparation(unit: RTSUnit, neighbors: readonly RTSUnit[]): SteeringForce {
  let x = 0;
  let z = 0;
  let count = 0;

  const radius = unit.unitClass === 'INFANTRY' ? STEERING_SEPARATION_RADIUS_INFANTRY : STEERING_SEPARATION_RADIUS_OTHER;

  for (const neighbor of neighbors) {
    if (neighbor.id === unit.id) continue;

    const dx = unit.transform.position.x - neighbor.transform.position.x;
    const dz = unit.transform.position.z - neighbor.transform.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0 && dist < radius) {
      const force = (radius - dist) / radius;
      x += (dx / dist) * force;
      z += (dz / dist) * force;
      count++;
    }
  }

  if (count > 0) {
    x /= count;
    z /= count;
  }

  return { x, z };
}

export function getSeek(unit: RTSUnit, target: Vec3): SteeringForce {
  const dx = target.x - unit.transform.position.x;
  const dz = target.z - unit.transform.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) return { x: 0, z: 0 };

  const maxSpeed = unit.speed * STEERING_SPEED_SCALE;

  return {
    x: (dx / dist) * maxSpeed - unit.velocity.x,
    z: (dz / dist) * maxSpeed - unit.velocity.z,
  };
}

export function getArrival(unit: RTSUnit, target: Vec3, radius = 40): SteeringForce {
  const dx = target.x - unit.transform.position.x;
  const dz = target.z - unit.transform.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) return { x: 0, z: 0 };

  let speed = unit.speed * STEERING_SPEED_SCALE;
  if (dist < radius) {
    speed = (dist / radius) * speed;
  }

  return {
    x: (dx / dist) * speed - unit.velocity.x,
    z: (dz / dist) * speed - unit.velocity.z,
  };
}
