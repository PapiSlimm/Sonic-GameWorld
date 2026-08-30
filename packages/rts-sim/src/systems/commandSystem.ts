// Ported from docs/reference/global-dominance/src/engine/GameEngine.ts's `commandSystem`
// (docs/RTS-CONTRACTS.md §3). Same MOVE/HARVEST logic, plus:
//  - `applyCommand`, which fans a multi-unit `RTSCommand` out into each targeted unit's own
//    per-unit `UnitCommand` queue (the reference's commands were already single-unit, since it had
//    no multi-select command API at the engine layer — see docs/RTS-CONTRACTS.md §2).
//  - A `STOP` case (clear commands + path), which the reference didn't have bound to any input but
//    which a real multi-unit RTS needs (§3).
//  - `ATTACK`, which the reference didn't model as an explicit command (its CommanderAI just
//    issued MOVE onto an enemy's position and let combatSystem's proximity check do the rest).
//    Here ATTACK behaves like an attack-move: it re-paths toward a moving target's *current*
//    position every tick until the target dies or is destroyed, so a converging squad continues
//    following a target that walks away — a modest behavioral upgrade over the reference,
//    documented in README.md's "Deviations from the reference" section.
//
// §9 depth extension: BUILD now forwards an optional `unitType` archetype through to
// `enqueueProduction`. Also, per docs/RTS-CONTRACTS.md §9's "Biome variants" naval-steering
// simplification, a naval unit (`isNavalUnit`) on a `biome: 'SEA'` map gets a direct single-waypoint
// path instead of an `findPath` A* route for MOVE/attack-move — see `directPathFor` below and
// README's naval steering note. `movementSystem`'s existing seek/separation steering (unchanged)
// then does the rest, since it already reduces to plain seek-toward-next-waypoint for a one-point
// path — this is a documented scoped-down simplification, not a stub.
import { HARVEST_RANGE } from '../constants';
import { isNavalUnit } from '../biome';
import type { RTSCommand, RTSMatchState, RTSUnit, Vec3 } from '../types';
import { findPath } from './pathfinding';
import { enqueueProduction } from './productionSystem';
import { distanceXZ, findBuilding, findResourceNode, findUnit } from './util';

/**
 * A* for everyone except naval units on a SEA-biome map, which get a direct single-waypoint path
 * (open-water seek/separation only — see module doc and README's naval steering note).
 */
function pathTo(unit: RTSUnit, target: Vec3, state: RTSMatchState): Vec3[] {
  if (isNavalUnit(unit) && state.map.biome === 'SEA') return [{ ...target }];
  return findPath(unit.transform.position, target, state.map) ?? [];
}

/**
 * Applies one player- or AI-issued command to the units (or producing building) it targets.
 * This only enqueues/replaces state — the actual per-tick pathfinding/progression happens in
 * `commandSystem`, called once per tick from `tickMatch` after every pending command for the tick
 * has been applied. `BUILD` routes to `enqueueProduction` instead of touching any unit's command
 * queue, since a build order targets a producing building, not a unit selection.
 */
export function applyCommand(state: RTSMatchState, command: RTSCommand): void {
  if (command.type === 'BUILD') {
    const building = command.targetId ? findBuilding(state, command.targetId) : undefined;
    if (building && building.health > 0 && command.buildType) {
      enqueueProduction(state, building.factionId, command.buildType, state.tick, building.id, command.unitType);
    }
    return;
  }

  for (const unitId of command.unitIds) {
    const unit = findUnit(state, unitId);
    if (!unit || unit.state === 'DEAD') continue;

    if (command.type === 'STOP') {
      unit.commands = [];
      unit.path = [];
      unit.targetNodeId = null;
      unit.state = 'IDLE';
      continue;
    }

    unit.commands = [{ type: command.type, targetPos: command.targetPos, targetId: command.targetId }];
    unit.path = [];
  }
}

/** Per-tick progression of each living unit's current command — pathfinding, harvest proximity, attack-chase. */
export function commandSystem(state: RTSMatchState): void {
  for (const unit of state.entities.units) {
    if (unit.state === 'DEAD') continue;
    if (unit.commands.length === 0) {
      if (unit.state === 'MOVING') unit.state = 'IDLE';
      continue;
    }

    const cmd = unit.commands[0]!;

    switch (cmd.type) {
      case 'MOVE': {
        if (cmd.targetPos && unit.path.length === 0) {
          unit.path = pathTo(unit, cmd.targetPos, state);
          unit.state = 'MOVING';
        }
        break;
      }

      case 'ATTACK': {
        const target = cmd.targetId ? findUnit(state, cmd.targetId) : undefined;
        if (target && target.state !== 'DEAD') {
          const dist = distanceXZ(unit.transform.position, target.transform.position);
          if (dist > unit.attackRange) {
            // Re-path toward the target's current position every tick it's out of range.
            unit.path = pathTo(unit, target.transform.position, state);
            unit.state = 'MOVING';
          } else {
            // In range: hold position, let combatSystem fire (it targets any nearest enemy).
            unit.path = [];
            unit.state = 'ATTACKING';
          }
        } else if (cmd.targetPos) {
          // No live target (or a plain attack-move to a point): behave like MOVE.
          if (unit.path.length === 0) {
            unit.path = pathTo(unit, cmd.targetPos, state);
            unit.state = 'MOVING';
          }
        } else {
          // Target died / vanished with no fallback point — command is done.
          unit.commands.shift();
          if (unit.commands.length === 0) unit.state = 'IDLE';
        }
        break;
      }

      case 'HARVEST': {
        if (cmd.targetId) {
          const node = findResourceNode(state, cmd.targetId);
          if (node && node.amount > 0) {
            const dist = distanceXZ(unit.transform.position, node.position);
            if (dist > HARVEST_RANGE) {
              if (unit.path.length === 0) {
                unit.path = findPath(unit.transform.position, node.position, state.map) ?? [];
              }
              unit.state = 'MOVING';
            } else {
              unit.state = 'HARVESTING';
              unit.targetNodeId = node.id;
              unit.path = [];
            }
          } else {
            unit.commands.shift();
            unit.targetNodeId = null;
            unit.state = 'IDLE';
          }
        }
        break;
      }

      default:
        break;
    }
  }
}
