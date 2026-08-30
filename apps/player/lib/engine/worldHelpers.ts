import type { WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';

/** Type-safe read of a string field out of an entity's free-form `metadata` bag. */
export function metaString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function metaNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

/** First `PLAYER_SPAWN` entity in the world, or the world's bounds center as a last resort. */
export function findSpawnPoint(world: WorldDocument): WorldEntity | undefined {
  return world.entities.find((e) => e.kind === 'PLAYER_SPAWN');
}

export function worldBounds2D(world: WorldDocument): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: world.bounds.min.x, maxX: world.bounds.max.x, minZ: world.bounds.min.z, maxZ: world.bounds.max.z };
}

/** Straight-line distance between two X/Z points, ignoring height. */
export function distance2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
