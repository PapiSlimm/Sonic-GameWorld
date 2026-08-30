// Per-engine LOD/variant preference (CONTRACTS.md §6/§13): each engine target favors a different
// point on the ULTRA..WEB quality ladder — a browser build wants the lightest usable geometry,
// a Unity/Unreal desktop build wants the richest, Godot sits in between. An entity's own
// `assetRef.variant` (an explicit author choice) always wins over the engine default.
import type { AssetVariant, EngineTarget } from '@sonic-gameworld/world-schema';

const ENGINE_VARIANT_PRIORITY: Record<EngineTarget, AssetVariant[]> = {
  WEB: ['WEB', 'MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'],
  UNITY: ['HIGH', 'ULTRA', 'MEDIUM', 'LOW', 'MOBILE', 'WEB'],
  UNREAL: ['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'MOBILE', 'WEB'],
  GODOT: ['MEDIUM', 'HIGH', 'LOW', 'ULTRA', 'MOBILE', 'WEB'],
};

/**
 * Picks the variant a build for `engine` should reference for an entity.
 * `explicit` (the entity's own `assetRef.variant`) always wins when set; `available` (when known —
 * e.g. from `AssetVariantFile` rows) narrows the engine's priority list to what was actually
 * generated. When `available` is omitted, the engine's top preference is used as a best-effort
 * default (this worker doesn't require the caller to have joined variant-availability data —
 * see README for the "known simplification" this implies).
 */
export function pickVariant(engine: EngineTarget, explicit?: AssetVariant, available?: AssetVariant[]): AssetVariant {
  if (explicit && (!available || available.includes(explicit))) return explicit;
  const priority = ENGINE_VARIANT_PRIORITY[engine];
  if (available && available.length > 0) {
    const match = priority.find((v) => available.includes(v));
    if (match) return match;
    return available[0]!;
  }
  return priority[0]!;
}

export function engineVariantPriority(engine: EngineTarget): readonly AssetVariant[] {
  return ENGINE_VARIANT_PRIORITY[engine];
}
