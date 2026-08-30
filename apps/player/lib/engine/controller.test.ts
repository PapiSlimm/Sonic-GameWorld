import { describe, expect, it } from 'vitest';
import { damp, EMPTY_KEY_STATE, integrateMovement, keyToAxis, movementVector } from './controller.js';

describe('keyToAxis', () => {
  it('maps WASD and arrow keys to axes', () => {
    expect(keyToAxis('KeyW')).toBe('forward');
    expect(keyToAxis('KeyS')).toBe('back');
    expect(keyToAxis('KeyA')).toBe('left');
    expect(keyToAxis('KeyD')).toBe('right');
    expect(keyToAxis('ArrowUp')).toBe('forward');
  });

  it('returns null for unrelated keys', () => {
    expect(keyToAxis('Space')).toBeNull();
    expect(keyToAxis('KeyQ')).toBeNull();
  });
});

describe('movementVector', () => {
  it('is zero when no keys are held', () => {
    expect(movementVector(EMPTY_KEY_STATE, 0)).toEqual({ x: 0, z: 0 });
  });

  it('moves along +Z when pressing forward with yaw 0', () => {
    const v = movementVector({ ...EMPTY_KEY_STATE, forward: true }, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });

  it('is unit length for diagonal movement', () => {
    const v = movementVector({ ...EMPTY_KEY_STATE, forward: true, right: true }, 0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1);
  });

  it('rotates with camera yaw', () => {
    const v = movementVector({ ...EMPTY_KEY_STATE, forward: true }, Math.PI / 2);
    expect(v.x).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(0);
  });
});

describe('integrateMovement', () => {
  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

  it('leaves state untouched when there is no movement', () => {
    const state = { position: { x: 0, z: 0 }, yaw: 1.23 };
    expect(integrateMovement(state, { x: 0, z: 0 }, 5, 0.1, bounds)).toBe(state);
  });

  it('advances position by speed * dt along the move vector', () => {
    const state = { position: { x: 0, z: 0 }, yaw: 0 };
    const next = integrateMovement(state, { x: 0, z: 1 }, 10, 0.5, bounds);
    expect(next.position.z).toBeCloseTo(5);
    expect(next.position.x).toBeCloseTo(0);
  });

  it('clamps to the bounds minus margin', () => {
    const state = { position: { x: 99, z: 0 }, yaw: 0 };
    const next = integrateMovement(state, { x: 1, z: 0 }, 100, 1, bounds, 4);
    expect(next.position.x).toBeCloseTo(96);
  });

  it('faces the direction of movement', () => {
    const state = { position: { x: 0, z: 0 }, yaw: 0 };
    const next = integrateMovement(state, { x: 1, z: 0 }, 1, 0.1, bounds);
    expect(next.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe('damp', () => {
  it('reaches target over many small steps', () => {
    let v = 0;
    for (let i = 0; i < 300; i++) v = damp(v, 10, 5, 1 / 60);
    expect(v).toBeCloseTo(10, 1);
  });

  it('does not overshoot on a single reasonable step', () => {
    const v = damp(0, 10, 5, 1 / 60);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
  });
});
