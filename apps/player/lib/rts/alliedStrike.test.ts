import { describe, expect, it } from 'vitest';
import {
  ALLIED_STRIKE_MAP_CONTROL_THRESHOLD,
  RTS_BUILDING_STATS,
  RTS_FACTIONS,
  RTS_UNIT_STATS,
  createMatch,
  type RTSBuilding,
  type RTSUnit,
} from '@sonic-gameworld/rts-sim';
import { detectAlliedStrikeWarning } from './alliedStrike';

const ALLY = 'allied-faction-1';

function building(factionId: string, cellX: number, health = RTS_BUILDING_STATS.BARRACKS.health): RTSBuilding {
  return { id: `b-${factionId}-${cellX}`, factionId, buildingClass: 'BARRACKS', cellX, cellZ: 0, sizeCells: { ...RTS_BUILDING_STATS.BARRACKS.sizeCells }, health, maxHealth: RTS_BUILDING_STATS.BARRACKS.health, isOperational: true };
}

function unit(factionId: string, id: string): RTSUnit {
  const stats = RTS_UNIT_STATS.INFANTRY;
  return {
    id,
    factionId,
    unitClass: 'INFANTRY',
    transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    path: [],
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    attackRange: stats.attackRange,
    damage: stats.damage,
    detectionRadius: stats.detectionRadius,
    state: 'IDLE',
    commands: [],
    targetNodeId: null,
    lastFiredAtTick: 0,
    harvestedSotolium: 0,
    isDetected: true,
    heat: 0,
    isSelected: false,
  };
}

function freshMatch() {
  const [raven, dragon] = RTS_FACTIONS;
  return createMatch({
    seed: 1,
    mapWidthM: 1000,
    mapDepthM: 1000,
    cellSizeM: 10,
    factions: [
      { factionId: raven!.id, isAIControlled: false },
      { factionId: dragon!.id, isAIControlled: true, difficulty: 'PRO', alliedFactionIds: [ALLY] },
    ],
  });
}

describe('detectAlliedStrikeWarning', () => {
  it('returns null when no faction has both PRO difficulty and allies', () => {
    const [raven, dragon] = RTS_FACTIONS;
    const match = createMatch({
      seed: 1,
      mapWidthM: 1000,
      mapDepthM: 1000,
      cellSizeM: 10,
      factions: [
        { factionId: raven!.id, isAIControlled: false },
        { factionId: dragon!.id, isAIControlled: true }, // no difficulty/allies
      ],
    });
    expect(detectAlliedStrikeWarning(match)).toBeNull();
  });

  it('returns null when the PRO faction has allies but map control has not crossed the threshold', () => {
    const match = freshMatch();
    const dragon = RTS_FACTIONS[1]!.id;
    // 1 of 2 buildings = 50%, below ALLIED_STRIKE_MAP_CONTROL_THRESHOLD (0.6).
    match.entities.buildings.push(building(dragon, 0), building(RTS_FACTIONS[0]!.id, 50));
    match.entities.units.push(unit(ALLY, 'ally-1'));
    expect(detectAlliedStrikeWarning(match)).toBeNull();
  });

  it('returns null when the threshold is crossed but the ally has no living units to contribute', () => {
    const match = freshMatch();
    const dragon = RTS_FACTIONS[1]!.id;
    match.entities.buildings.push(building(dragon, 0), building(dragon, 20));
    expect(detectAlliedStrikeWarning(match)).toBeNull();
  });

  it('returns the striking faction id once the threshold is crossed and an ally has living units', () => {
    const match = freshMatch();
    const dragon = RTS_FACTIONS[1]!.id;
    // Dragon controls both buildings -> 100% > ALLIED_STRIKE_MAP_CONTROL_THRESHOLD.
    match.entities.buildings.push(building(dragon, 0), building(dragon, 20));
    match.entities.units.push(unit(ALLY, 'ally-1'));

    expect(ALLIED_STRIKE_MAP_CONTROL_THRESHOLD).toBeLessThan(1);
    expect(detectAlliedStrikeWarning(match)).toBe(dragon);
  });

  it('never mutates the match it inspects (read-only preview, per its own doc comment)', () => {
    const match = freshMatch();
    const dragon = RTS_FACTIONS[1]!.id;
    match.entities.buildings.push(building(dragon, 0), building(dragon, 20));
    match.entities.units.push(unit(ALLY, 'ally-1'));
    const before = JSON.stringify(match);

    detectAlliedStrikeWarning(match);

    expect(JSON.stringify(match)).toBe(before);
  });
});
