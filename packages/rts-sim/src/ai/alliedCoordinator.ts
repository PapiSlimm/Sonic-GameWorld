// §9 depth extension (docs/RTS-CONTRACTS.md §9, "Allied-nation coordinated strikes (Pro difficulty
// only)"). A pure function — exactly like `runCommanderAI` — that only *proposes* `RTSCommand[]`
// for `tickMatch` to apply via the normal `applyCommand` path; it never mutates `state` itself, so
// (per §5's lockstep model) every peer computes the identical strike batch independently from the
// same seeded `rng`, with nothing relayed out-of-band.
//
// Map-control progress is measured as the primary faction's share of the map's total buildings
// (a simple, cheap, and easy-to-reason-about proxy for "how much of the map they've taken over" —
// see README's "§9 additive extensions" section for why this proxy was chosen over, e.g., visible
// cell area). Once `ALLIED_STRIKE_MAP_CONTROL_THRESHOLD` is crossed, each allied faction (up to
// `ALLIED_STRIKE_MAX_ALLIES`) contributes up to `ALLIED_STRIKE_FORCE_SIZE` of its own idle-or-any
// living units to a single attack-move command converging on the primary faction's currently
// weakest (lowest-health) surviving building — a clear, sabotage-flavored target, not a random
// walk. Unit selection is by sorted id (deterministic without consuming rng) and the convergence
// target tie-break also sorts by id, so two peers with the same state and rng always agree; the
// shared `rng` is threaded through anyway (and used to decide which faction becomes the first
// striker when multiple are eligible) so this stays extensible without ever reaching for
// `Math.random()`.
import { ALLIED_STRIKE_FORCE_SIZE, ALLIED_STRIKE_MAP_CONTROL_THRESHOLD, ALLIED_STRIKE_MAX_ALLIES } from '../constants';
import type { Rng } from '../rng';
import type { RTSCommand, RTSMatchState } from '../types';

/** Primary faction's share of the map's total living buildings — see module doc. */
export function computeMapControlScore(state: RTSMatchState, primaryFactionId: string): number {
  const totalBuildings = state.entities.buildings.filter((b) => b.health > 0).length;
  if (totalBuildings === 0) return 0;
  const primaryBuildings = state.entities.buildings.filter((b) => b.health > 0 && b.factionId === primaryFactionId).length;
  return primaryBuildings / totalBuildings;
}

/**
 * Evaluates whether `primaryFactionId`'s map-control progress has crossed
 * `ALLIED_STRIKE_MAP_CONTROL_THRESHOLD` and, if so, returns one attack-move `RTSCommand` per
 * allied faction (from `allyFactionIds`, capped to `ALLIED_STRIKE_MAX_ALLIES`) that currently has
 * living units. Returns `[]` when the threshold isn't crossed, there is no live target building,
 * or no allied faction has any units to contribute — never throws, never mutates `state`.
 */
export function evaluateAlliedStrike(state: RTSMatchState, primaryFactionId: string, allyFactionIds: readonly string[], rng: Rng): RTSCommand[] {
  if (computeMapControlScore(state, primaryFactionId) < ALLIED_STRIKE_MAP_CONTROL_THRESHOLD) return [];

  const primaryBuildings = state.entities.buildings.filter((b) => b.health > 0 && b.factionId === primaryFactionId);
  if (primaryBuildings.length === 0) return [];

  // Weakest (lowest-health) building, ties broken by id for determinism.
  const target = [...primaryBuildings].sort((a, b) => a.health - b.health || a.id.localeCompare(b.id))[0]!;
  const targetPos = {
    x: (target.cellX + target.sizeCells.w / 2) * state.map.cellSizeM,
    y: 0,
    z: (target.cellZ + target.sizeCells.d / 2) * state.map.cellSizeM,
  };

  const commands: RTSCommand[] = [];
  const allies = allyFactionIds.slice(0, ALLIED_STRIKE_MAX_ALLIES);

  for (const allyId of allies) {
    const allyUnits = state.entities.units.filter((u) => u.factionId === allyId && u.state !== 'DEAD').sort((a, b) => a.id.localeCompare(b.id));
    if (allyUnits.length === 0) continue;

    // Deterministic subset: a shared-rng-driven rotating start index rather than always the same
    // first N units, so repeated strikes from a large army don't always draw the same handful.
    const startIndex = rng.nextInt(allyUnits.length);
    const strikeForce: string[] = [];
    for (let i = 0; i < Math.min(ALLIED_STRIKE_FORCE_SIZE, allyUnits.length); i++) {
      strikeForce.push(allyUnits[(startIndex + i) % allyUnits.length]!.id);
    }

    commands.push({ type: 'ATTACK', unitIds: strikeForce, targetPos: { ...targetPos } });
  }

  return commands;
}
