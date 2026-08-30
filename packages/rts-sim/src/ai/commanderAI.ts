// Ported from docs/reference/global-dominance/src/engine/CommanderAI.ts (docs/RTS-CONTRACTS.md
// §3): the same three behaviors — produce when affordable, send idle units at a random enemy,
// send idle infantry to auto-harvest — but as a **pure function** that only *proposes*
// `RTSCommand[]`, never mutates `state` directly.
//
// This purity is not a style preference — it's load-bearing for lockstep multiplayer (§5). If the
// AI mutated state directly (as the reference's `CommanderAI.update` did, reaching into the
// Zustand store), its decisions would exist outside the command stream and every peer would have
// to somehow re-derive the exact same mutation independently, with no shared record of what
// happened. By only ever returning commands — which `tickMatch` then applies through the exact
// same `applyCommand` path a human player's input takes — an AI-controlled faction's behavior
// becomes just another deterministic input to the simulation. Every peer's `rts-sim` instance
// runs `runCommanderAI` itself (fed the same shared, seeded `rng`), so it decides the same
// commands independently and never needs those commands relayed over the network at all.
//
// Random choices MUST come from the passed-in `rng`, never `Math.random()` — see rng.ts.
//
// §9 depth extension (docs/RTS-CONTRACTS.md §9, "Difficulty presets" + the munition/heat item's
// "reflect that in commanderAI behavior for AI-controlled factions of each side" requirement):
//   - `options.difficulty`, when given, applies `RTS_DIFFICULTY_PRESETS[difficulty]`: it divides
//     the production credit threshold (economyMultiplier) and gates each idle-unit's opportunistic
//     attack behind a per-unit rng roll (aggressionChance) instead of committing every idle unit
//     unconditionally. Omitting `options` (or `options.difficulty`) reproduces the exact pre-§9
//     behavior byte-for-byte — no extra rng draws, no threshold change — so every pre-existing
//     3-argument call site (including `tickMatch`'s own default, difficulty-less factions) is
//     unaffected.
//   - United Dragon Nations' "guerrilla, low-heat hit-and-run" doctrine is wired in unconditionally
//     (not gated behind a difficulty): a Dragon unit that is currently thermally exposed
//     (`isThermallyExposed`) holds back from a fresh opportunistic attack instead of piling on more
//     heat, rather than heat being "just a number nobody's AI reacts to". This never fires for a
//     unit with `heat: 0` (every unit before this feature, and every unit in the pre-§9 test
//     suite), so it changes no existing behavior either.
import { AI_PRODUCTION_CREDIT_THRESHOLD, RTS_DIFFICULTY_PRESETS, RTS_FACTIONS } from '../constants';
import type { Rng } from '../rng';
import { isThermallyExposed } from '../systems/stealth';
import type { DifficultyLevel, RTSCommand, RTSMatchState, UnitClass } from '../types';

const UNITED_DRAGON_NATIONS_ID = RTS_FACTIONS[1]?.id;

export interface RunCommanderAIOptions {
  /** Applies `RTS_DIFFICULTY_PRESETS[difficulty]` — see module doc. Omit for pre-§9 behavior. */
  difficulty?: DifficultyLevel;
}

export function runCommanderAI(state: RTSMatchState, factionId: string, rng: Rng, options?: RunCommanderAIOptions): RTSCommand[] {
  const commands: RTSCommand[] = [];
  const preset = options?.difficulty ? RTS_DIFFICULTY_PRESETS[options.difficulty] : undefined;

  const myUnits = state.entities.units.filter((u) => u.factionId === factionId && u.state !== 'DEAD');
  const enemyUnits = state.entities.units.filter((u) => u.factionId !== factionId && u.state !== 'DEAD');

  // 1. Tactical production loop: when flush with credits, queue a unit at a random compatible
  // building. Two conditional rng draws, matching the reference's short-circuited ternary exactly
  // (35% Armored, 32.5% Air, 32.5% Infantry). §9: `preset.economyMultiplier` divides the effective
  // threshold, so a higher difficulty spends more eagerly for the same credit balance.
  const econ = state.economy[factionId];
  const effectiveThreshold = preset ? AI_PRODUCTION_CREDIT_THRESHOLD / preset.economyMultiplier : AI_PRODUCTION_CREDIT_THRESHOLD;
  if (econ && econ.credits > effectiveThreshold) {
    let unitClass: UnitClass;
    if (rng.next() > 0.65) {
      unitClass = 'ARMORED';
    } else {
      unitClass = rng.next() > 0.5 ? 'AIR' : 'INFANTRY';
    }

    const producer = state.entities.buildings.find(
      (b) =>
        b.factionId === factionId &&
        b.health > 0 &&
        (unitClass === 'INFANTRY' ? b.buildingClass === 'BARRACKS' : b.buildingClass === 'FACTORY' || b.buildingClass === 'AIRFIELD'),
    );
    if (producer) {
      commands.push({ type: 'BUILD', unitIds: [], targetId: producer.id, buildType: unitClass });
    }
  }

  // 2. Idle units move to attack a random live enemy. §9: a difficulty preset gates this behind
  // `aggressionChance` (a hesitant Beginner AI doesn't always commit); Dragon's guerrilla doctrine
  // additionally holds back a unit that's currently thermally exposed, regardless of difficulty.
  const isDragonGuerrilla = factionId === UNITED_DRAGON_NATIONS_ID;
  for (const u of myUnits) {
    if (u.state === 'IDLE' && u.commands.length === 0 && enemyUnits.length > 0) {
      if (preset && rng.next() > preset.aggressionChance) continue;
      if (isDragonGuerrilla && isThermallyExposed(u)) continue;
      const target = enemyUnits[rng.nextInt(enemyUnits.length)]!;
      commands.push({ type: 'MOVE', unitIds: [u.id], targetPos: { ...target.transform.position } });
    }
  }

  // 3. Idle infantry auto-harvest — pushed after (2) so it overrides any attack-move just queued
  // for the same infantry unit, exactly matching the reference's call order (its two loops both
  // wrote `unit.commands` directly, so whichever ran second won for units eligible for both).
  const idleHarvesters = myUnits.filter((u) => u.unitClass === 'INFANTRY' && u.state === 'IDLE' && u.commands.length === 0);
  const nodes = state.entities.resources.filter((n) => n.amount > 0);
  if (idleHarvesters.length > 0 && nodes.length > 0) {
    for (const u of idleHarvesters) {
      const node = nodes[rng.nextInt(nodes.length)]!;
      commands.push({ type: 'HARVEST', unitIds: [u.id], targetId: node.id, targetPos: { ...node.position } });
    }
  }

  return commands;
}
