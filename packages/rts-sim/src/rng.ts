// Seeded PRNG for deterministic lockstep simulation (docs/RTS-CONTRACTS.md §1).
//
// `Math.random()` must never appear anywhere in this package's simulation logic. Every call site
// that needs randomness (CommanderAI target selection, unit/projectile id generation, ...) takes
// an `Rng` threaded from `RTSMatchState.rngState`, so two peers ticking from the same seed with
// the same ordered command stream produce bit-identical results.
//
// Algorithm: mulberry32 (public domain). Its entire state is a single uint32, which is exactly
// `RTSMatchState.rngState` — trivial to serialize and to resume from.

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Next float in [min, max). */
  nextFloat(min: number, max: number): number;
  /** Current internal state, suitable for persisting into `RTSMatchState.rngState`. */
  getState(): number;
}

class Mulberry32 implements Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0;
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  getState(): number {
    return this.a;
  }
}

export function createRng(seed: number): Rng {
  return new Mulberry32(seed);
}

export function rngFromState(state: number): Rng {
  return new Mulberry32(state);
}

/** Deterministic id generator built on `Rng` — replaces the reference's `Math.random()`-based ids. */
export function generateEntityId(rng: Rng, prefix: string): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += Math.floor(rng.next() * 36).toString(36);
  }
  return `${prefix}_${suffix}`;
}
