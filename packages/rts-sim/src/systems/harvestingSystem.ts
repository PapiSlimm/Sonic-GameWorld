// Ported near-verbatim from docs/reference/global-dominance/src/engine/GameEngine.ts's
// `harvestingSystem` (docs/RTS-CONTRACTS.md §3). `factionCredits`/`nodeHarvests` are plain objects
// keyed by string ids populated in unit-array iteration order; since each faction/node key is
// only ever written once and never re-read to compute another key's value, object key iteration
// order has no bearing on the numeric outcome (docs/RTS-CONTRACTS.md §1's determinism rule about
// order-sensitive Set/Map iteration does not apply here).
import { HARVEST_BATCH_THRESHOLD, HARVEST_RATE_PER_SECOND, SOTOLIUM_CONVERSION_RATE } from '../constants';
import type { RTSMatchState } from '../types';
import { findResourceNode } from './util';

export function harvestingSystem(state: RTSMatchState, dtSeconds: number): void {
  const factionCredits: Record<string, number> = {};
  const nodeHarvests: Record<string, number> = {};

  for (const unit of state.entities.units) {
    if (unit.state !== 'HARVESTING' || !unit.targetNodeId || unit.health <= 0) continue;

    const amount = dtSeconds * HARVEST_RATE_PER_SECOND;
    unit.harvestedSotolium += amount;
    nodeHarvests[unit.targetNodeId] = (nodeHarvests[unit.targetNodeId] ?? 0) + amount;

    if (unit.harvestedSotolium >= HARVEST_BATCH_THRESHOLD) {
      factionCredits[unit.factionId] = (factionCredits[unit.factionId] ?? 0) + Math.floor(unit.harvestedSotolium * SOTOLIUM_CONVERSION_RATE);
      unit.harvestedSotolium = 0;
    }

    const node = findResourceNode(state, unit.targetNodeId);
    if (!node || node.amount <= 0) {
      unit.state = 'IDLE';
      unit.targetNodeId = null;
      if (unit.commands.length > 0 && unit.commands[0]!.type === 'HARVEST') unit.commands.shift();
    }
  }

  for (const [factionId, amount] of Object.entries(factionCredits)) {
    if (amount > 0 && state.economy[factionId]) {
      state.economy[factionId]!.credits += amount;
    }
  }

  if (Object.keys(nodeHarvests).length > 0) {
    for (const node of state.entities.resources) {
      const harvested = nodeHarvests[node.id];
      if (harvested !== undefined) {
        node.amount = Math.max(0, node.amount - harvested);
        node.isBeingHarvested = true;
      } else {
        node.isBeingHarvested = false;
      }
    }
  }
}
