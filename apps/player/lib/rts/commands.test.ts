import { describe, expect, it } from 'vitest';
import { buildAttackCommand, buildHarvestCommand, buildMoveCommand, buildProductionCommand, buildStopCommand } from './commands';

describe('RTSCommand builders', () => {
  it('buildMoveCommand', () => {
    expect(buildMoveCommand(['a', 'b'], { x: 1, y: 0, z: 2 })).toEqual({ type: 'MOVE', unitIds: ['a', 'b'], targetPos: { x: 1, y: 0, z: 2 } });
  });

  it('buildAttackCommand', () => {
    expect(buildAttackCommand(['a'], 'enemy-1')).toEqual({ type: 'ATTACK', unitIds: ['a'], targetId: 'enemy-1' });
  });

  it('buildStopCommand', () => {
    expect(buildStopCommand(['a', 'b', 'c'])).toEqual({ type: 'STOP', unitIds: ['a', 'b', 'c'] });
  });

  it('buildHarvestCommand', () => {
    expect(buildHarvestCommand(['a'], 'node-1')).toEqual({ type: 'HARVEST', unitIds: ['a'], targetId: 'node-1' });
  });

  it('buildProductionCommand targets the building, not a unit selection', () => {
    expect(buildProductionCommand('barracks-1', 'INFANTRY')).toEqual({ type: 'BUILD', unitIds: [], targetId: 'barracks-1', buildType: 'INFANTRY' });
  });
});
