// Small shared helpers used across systems. Kept dependency-free and allocation-light; none of
// this touches randomness or wall-clock time.
import type { RTSBuilding, RTSMatchState, RTSResourceNode, RTSUnit, Vec3 } from '../types';

export function distanceXZ(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function findUnit(state: RTSMatchState, id: string): RTSUnit | undefined {
  return state.entities.units.find((u) => u.id === id);
}

export function findBuilding(state: RTSMatchState, id: string): RTSBuilding | undefined {
  return state.entities.buildings.find((b) => b.id === id);
}

export function findResourceNode(state: RTSMatchState, id: string): RTSResourceNode | undefined {
  return state.entities.resources.find((n) => n.id === id);
}
