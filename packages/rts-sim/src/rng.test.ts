import { describe, expect, it } from 'vitest';
import { createRng, generateEntityId, rngFromState } from './rng';

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('every draw is in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt stays within [0, maxExclusive)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('resuming from a saved state continues the exact same sequence', () => {
    const rng = createRng(99);
    rng.next();
    rng.next();
    const savedState = rng.getState();
    const expectedNext = rng.next();

    const resumed = rngFromState(savedState);
    expect(resumed.next()).toBe(expectedNext);
  });

  it('generateEntityId is deterministic given the same rng state', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect(generateEntityId(a, 'unit')).toBe(generateEntityId(b, 'unit'));
  });

  it('generateEntityId advances the rng (sequential ids differ)', () => {
    const rng = createRng(5);
    const first = generateEntityId(rng, 'unit');
    const second = generateEntityId(rng, 'unit');
    expect(first).not.toBe(second);
  });
});
