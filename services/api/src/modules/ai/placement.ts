// Geometry helpers shared by tools/registry.ts: resolving a natural-language `Placement`
// ("near Building 7", "inside it") into a concrete Vec3, and clamping the result into
// `world.bounds` so every tool that places something can honestly claim "validated inside
// bounds" (CONTRACTS.md §8 test: "spawn 3 enemies near Building 7" → spawn_npc x3 validated
// inside bounds).
import { distance, findEntity, type Placement, type Vec3, type WorldBounds, type WorldDocument, type WorldEntity } from '@sonic-gameworld/world-schema';

export function clampToBounds(p: Vec3, bounds: WorldBounds): Vec3 {
  return {
    x: Math.min(bounds.max.x, Math.max(bounds.min.x, p.x)),
    y: Math.min(bounds.max.y, Math.max(bounds.min.y, p.y)),
    z: Math.min(bounds.max.z, Math.max(bounds.min.z, p.z)),
  };
}

export function isInBounds(p: Vec3, bounds: WorldBounds): boolean {
  return p.x >= bounds.min.x && p.x <= bounds.max.x && p.y >= bounds.min.y && p.y <= bounds.max.y && p.z >= bounds.min.z && p.z <= bounds.max.z;
}

export function worldCenter(doc: WorldDocument): Vec3 {
  return {
    x: (doc.bounds.min.x + doc.bounds.max.x) / 2,
    y: (doc.bounds.min.y + doc.bounds.max.y) / 2,
    z: (doc.bounds.min.z + doc.bounds.max.z) / 2,
  };
}

/** Resolve the entity a placement's `anchor` string refers to, if any (by id or fuzzy name — see
 * `findEntity` in world-schema/world.ts). Accepts a minimal `{anchor?}` shape (rather than the
 * full `Placement`) so callers can pass ad-hoc position/anchor pairs (e.g. tools/registry.ts's
 * bounds pre-check) without constructing a complete Placement. */
export function resolveAnchorEntity(doc: WorldDocument, placement?: { anchor?: string }): WorldEntity | undefined {
  if (!placement?.anchor) return undefined;
  return findEntity(doc, placement.anchor);
}

/**
 * Turn a `Placement` (relation + optional anchor/explicit position + radius) into a concrete,
 * bounds-clamped Vec3. `index`/`count` let callers spread N spawns around the same anchor instead
 * of stacking them (spawn_npc with count > 1) — deterministic (no RNG) so results are
 * reproducible in tests.
 */
export function resolvePlacement(doc: WorldDocument, placement: Placement | undefined, opts: { index?: number; count?: number } = {}): Vec3 {
  const bounds = doc.bounds;
  if (placement?.position) return clampToBounds(placement.position, bounds);

  const anchor = resolveAnchorEntity(doc, placement);
  const base = anchor?.transform.position ?? worldCenter(doc);
  if (!placement || !anchor) return clampToBounds(base, bounds);

  const radius = placement.radiusM;
  const index = opts.index ?? 0;
  const count = Math.max(1, opts.count ?? 1);
  // Spread multiple placements evenly around the anchor on a circle of the requested radius so
  // e.g. "spawn 3 enemies near Building 7" doesn't stack all three on one point.
  const angle = (2 * Math.PI * index) / count;
  const ring = { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };

  let offset: Vec3;
  switch (placement.relation) {
    case 'INSIDE':
    case 'AT':
      offset = { x: 0, y: 0, z: 0 };
      break;
    case 'ABOVE':
      offset = { x: 0, y: Math.max(radius, 1), z: 0 };
      break;
    case 'BEHIND':
      offset = { x: 0, y: 0, z: -radius };
      break;
    case 'IN_FRONT':
      offset = { x: 0, y: 0, z: radius };
      break;
    case 'LEFT':
      offset = { x: -radius, y: 0, z: 0 };
      break;
    case 'RIGHT':
      offset = { x: radius, y: 0, z: 0 };
      break;
    case 'NEAR':
    case 'AROUND':
    default:
      offset = { x: ring.x, y: 0, z: ring.z };
      break;
  }
  return clampToBounds({ x: base.x + offset.x, y: base.y + offset.y, z: base.z + offset.z }, bounds);
}

export { distance };
