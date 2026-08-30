// Engine-compatibility helper (§5 of CONTRACTS.md: `EngineTarget = 'WEB'|'UNITY'|'UNREAL'|'GODOT'`).
// Pure — reused by the products module (create/patch validation) and by marketplace/search
// (engine= filter) so the notion of "compatible" is defined exactly once.
import type { EngineTarget } from '@sonic-gameworld/world-schema';

/** WEB-authored content plays everywhere via the browser runtime; everything else must match exactly. */
export function isEngineCompatible(productEngines: EngineTarget[], target: EngineTarget): boolean {
  if (productEngines.length === 0) return false;
  if (productEngines.includes(target)) return true;
  return target === 'WEB' ? false : productEngines.includes('WEB');
}

export function compatibleEngines(productEngines: EngineTarget[], targets: EngineTarget[]): EngineTarget[] {
  return targets.filter((t) => isEngineCompatible(productEngines, t));
}
