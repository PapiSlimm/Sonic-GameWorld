// §9 depth extension: biome variants — team-color-by-biome lookup + naval open-water steering
// simplification (docs/RTS-CONTRACTS.md §9).
import { describe, expect, it } from 'vitest';
import { RTS_FACTIONS } from './constants';
import { getTeamColor, isNavalUnit, isNavalUnitType, RTS_DEFAULT_TEAM_COLOR } from './biome';
import { applyCommand, commandSystem } from './systems/commandSystem';
import { FACTION_A, makeMatch, makeUnit } from './testFixtures';

const [ravenAlliance, unitedDragonNations] = RTS_FACTIONS;

describe('getTeamColor', () => {
  it('renders Raven Alliance Blue on every biome', () => {
    expect(getTeamColor(ravenAlliance!.id, 'URBAN')).toBe('#0033FF');
    expect(getTeamColor(ravenAlliance!.id, 'JUNGLE')).toBe('#0033FF');
    expect(getTeamColor(ravenAlliance!.id, 'SEA')).toBe('#0033FF');
  });

  it('renders United Dragon Nations Red on Urban/Sea and Green on Jungle', () => {
    expect(getTeamColor(unitedDragonNations!.id, 'URBAN')).toBe('#CC1122');
    expect(getTeamColor(unitedDragonNations!.id, 'SEA')).toBe('#CC1122');
    expect(getTeamColor(unitedDragonNations!.id, 'JUNGLE')).toBe('#2E8B32');
  });

  it('falls back to a default color for an unknown faction id (e.g. a Pro allied faction)', () => {
    expect(getTeamColor('some-allied-faction', 'URBAN')).toBe(RTS_DEFAULT_TEAM_COLOR);
  });
});

describe('naval unit helpers', () => {
  it('isNavalUnitType is true only for the 4 navalOnly archetypes', () => {
    expect(isNavalUnitType('DESTROYER')).toBe(true);
    expect(isNavalUnitType('RIFLEMAN')).toBe(false);
    expect(isNavalUnitType(undefined)).toBe(false);
    expect(isNavalUnitType('not-a-real-type')).toBe(false);
  });

  it('isNavalUnit reads a unit\'s unitType', () => {
    const naval = makeUnit({ factionId: FACTION_A, unitClass: 'ARMORED', unitType: 'FRIGATE' });
    const nonNaval = makeUnit({ factionId: FACTION_A, unitClass: 'ARMORED', unitType: 'MAIN_BATTLE_TANK' });
    expect(isNavalUnit(naval)).toBe(true);
    expect(isNavalUnit(nonNaval)).toBe(false);
  });
});

describe('naval open-water steering simplification (SEA biome)', () => {
  it('gives a naval unit a direct single-waypoint path on a SEA map instead of an A* route', () => {
    const state = makeMatch({ biome: 'SEA', mapWidthM: 500, mapDepthM: 500, cellSizeM: 10 });
    const ship = makeUnit({
      factionId: FACTION_A,
      unitClass: 'ARMORED',
      unitType: 'FRIGATE',
      transform: { position: { x: 10, y: 0, z: 10 }, rotationY: 0 },
    });
    state.entities.units.push(ship);

    applyCommand(state, { type: 'MOVE', unitIds: [ship.id], targetPos: { x: 480, y: 0, z: 480 } });
    commandSystem(state);

    expect(ship.state).toBe('MOVING');
    expect(ship.path).toEqual([{ x: 480, y: 0, z: 480 }]);
  });

  it('still uses full A* pathfinding for the same naval unitType on a non-SEA map', () => {
    const state = makeMatch({ biome: 'URBAN', mapWidthM: 200, mapDepthM: 200, cellSizeM: 10 });
    const ship = makeUnit({
      factionId: FACTION_A,
      unitClass: 'ARMORED',
      unitType: 'FRIGATE',
      transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 },
    });
    state.entities.units.push(ship);

    // A straight same-row move (matching the pattern the existing commandSystem.test.ts uses) so
    // A* resolves well within PATHFINDING_MAX_NODES_SEARCHED and returns a genuine multi-waypoint
    // route rather than its "search budget exhausted" direct-line fallback — a long diagonal move
    // can legitimately hit that fallback on an open grid regardless of this feature, which would
    // make this assertion meaningless either way.
    applyCommand(state, { type: 'MOVE', unitIds: [ship.id], targetPos: { x: 185, y: 0, z: 5 } });
    commandSystem(state);

    expect(ship.state).toBe('MOVING');
    // A* on an open grid returns a multi-step path, not a single direct waypoint.
    expect(ship.path.length).toBeGreaterThan(1);
  });

  it('still uses full A* pathfinding for a non-naval unit on a SEA map', () => {
    const state = makeMatch({ biome: 'SEA', mapWidthM: 200, mapDepthM: 200, cellSizeM: 10 });
    const tank = makeUnit({
      factionId: FACTION_A,
      unitClass: 'ARMORED',
      unitType: 'MAIN_BATTLE_TANK',
      transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 },
    });
    state.entities.units.push(tank);

    applyCommand(state, { type: 'MOVE', unitIds: [tank.id], targetPos: { x: 185, y: 0, z: 5 } });
    commandSystem(state);

    expect(tank.path.length).toBeGreaterThan(1);
  });

  it('default biome (URBAN) leaves a unit with no unitType behaving exactly as before', () => {
    const state = makeMatch();
    const unit = makeUnit({ factionId: FACTION_A, transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 } });
    state.entities.units.push(unit);
    expect(state.map.biome).toBe('URBAN');

    applyCommand(state, { type: 'MOVE', unitIds: [unit.id], targetPos: { x: 195, y: 0, z: 5 } });
    commandSystem(state);

    expect(unit.state).toBe('MOVING');
    expect(unit.path.length).toBeGreaterThan(0);
  });
});
