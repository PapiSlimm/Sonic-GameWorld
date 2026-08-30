import { describe, expect, it } from 'vitest';
import { makeUnit } from '../testFixtures';
import { getArrival, getSeek, getSeparation } from './steering';

describe('getSeparation', () => {
  it('pushes a unit away from a close neighbor', () => {
    const unit = makeUnit({ factionId: 'f1', unitClass: 'ARMORED', transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const neighbor = makeUnit({ factionId: 'f1', unitClass: 'ARMORED', transform: { position: { x: 10, y: 0, z: 0 }, rotationY: 0 } });

    const force = getSeparation(unit, [unit, neighbor]);
    // Neighbor is to the +x, so separation should push in -x.
    expect(force.x).toBeLessThan(0);
  });

  it('produces no force when neighbors are outside the radius', () => {
    const unit = makeUnit({ factionId: 'f1', transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const farNeighbor = makeUnit({ factionId: 'f1', transform: { position: { x: 1000, y: 0, z: 0 }, rotationY: 0 } });

    const force = getSeparation(unit, [unit, farNeighbor]);
    expect(force).toEqual({ x: 0, z: 0 });
  });

  it('ignores itself', () => {
    const unit = makeUnit({ factionId: 'f1', transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const force = getSeparation(unit, [unit]);
    expect(force).toEqual({ x: 0, z: 0 });
  });
});

describe('getSeek', () => {
  it('steers toward the target, accounting for current velocity', () => {
    const unit = makeUnit({
      factionId: 'f1',
      transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    });
    const force = getSeek(unit, { x: 100, y: 0, z: 0 });
    expect(force.x).toBeGreaterThan(0);
    expect(force.z).toBeCloseTo(0);
  });

  it('returns zero force when already at the target', () => {
    const unit = makeUnit({ factionId: 'f1', transform: { position: { x: 5, y: 0, z: 5 }, rotationY: 0 } });
    const force = getSeek(unit, { x: 5, y: 0, z: 5 });
    expect(force).toEqual({ x: 0, z: 0 });
  });
});

describe('getArrival', () => {
  it('slows down within the arrival radius', () => {
    const unit = makeUnit({ factionId: 'f1', transform: { position: { x: 0, y: 0, z: 0 }, rotationY: 0 } });
    const farForce = getArrival(unit, { x: 1000, y: 0, z: 0 }, 40);
    const nearForce = getArrival(unit, { x: 10, y: 0, z: 0 }, 40);
    expect(Math.abs(nearForce.x)).toBeLessThan(Math.abs(farForce.x));
  });
});
