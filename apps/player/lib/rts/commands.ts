/** Pure `RTSCommand` builders — kept dependency-free so input handling (`RtsViewport.tsx`) stays
 * a thin translation from mouse/keyboard events to these, easy to unit test without a DOM. */
import type { RTSCommand, UnitClass, Vec3 } from '@sonic-gameworld/rts-sim';

export function buildMoveCommand(unitIds: string[], targetPos: Vec3): RTSCommand {
  return { type: 'MOVE', unitIds, targetPos };
}

/** Attack-move: re-paths toward `targetId`'s current position every tick until it dies (rts-sim's
 * `ATTACK` command — see that package's README "Deviations from the reference" #3). */
export function buildAttackCommand(unitIds: string[], targetId: string): RTSCommand {
  return { type: 'ATTACK', unitIds, targetId };
}

export function buildStopCommand(unitIds: string[]): RTSCommand {
  return { type: 'STOP', unitIds };
}

export function buildHarvestCommand(unitIds: string[], targetId: string): RTSCommand {
  return { type: 'HARVEST', unitIds, targetId };
}

/** `BUILD` is not a per-unit order — `targetId` names the producing building and `unitIds` is
 * ignored by `commandSystem.applyCommand` (rts-sim), but is required by the `RTSCommand` shape. */
export function buildProductionCommand(buildingId: string, unitClass: UnitClass): RTSCommand {
  return { type: 'BUILD', unitIds: [], targetId: buildingId, buildType: unitClass };
}
