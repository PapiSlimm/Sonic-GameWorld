import { describe, expect, it } from 'vitest';
import { pickVariant } from './variant.js';

describe('pickVariant', () => {
  it('prefers WEB for the WEB engine when nothing explicit is set', () => {
    expect(pickVariant('WEB')).toBe('WEB');
  });

  it('prefers a high-fidelity variant for UNITY/UNREAL', () => {
    expect(pickVariant('UNITY')).toBe('HIGH');
    expect(pickVariant('UNREAL')).toBe('ULTRA');
  });

  it('respects an explicit author-chosen variant', () => {
    expect(pickVariant('WEB', 'ULTRA')).toBe('ULTRA');
  });

  it('falls back to the engine default when the explicit variant is not in the available set', () => {
    expect(pickVariant('WEB', 'ULTRA', ['WEB', 'MOBILE'])).toBe('WEB');
  });

  it('picks the best available variant per the engine priority order', () => {
    expect(pickVariant('UNITY', undefined, ['WEB', 'MOBILE', 'LOW'])).toBe('LOW');
  });
});
