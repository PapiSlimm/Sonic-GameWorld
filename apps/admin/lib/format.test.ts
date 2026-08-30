import { describe, expect, it } from 'vitest';
import { pct, titleCase } from './format.js';
import { DEMO_FRAUD_SIGNALS, FRAUD_SIGNAL_TYPES } from './fraud.js';

describe('format helpers', () => {
  it('formats percentages with one decimal by default', () => {
    expect(pct(4.5)).toBe('4.5%');
    expect(pct(10, 0)).toBe('10%');
  });

  it('title-cases snake/space separated words', () => {
    expect(titleCase('PAYMENT_RISK')).toBe('Payment Risk');
    expect(titleCase('fake engagement')).toBe('Fake Engagement');
  });
});

describe('fraud demo data', () => {
  it('every signal has a type from the canonical fraud taxonomy', () => {
    for (const signal of DEMO_FRAUD_SIGNALS) {
      expect(FRAUD_SIGNAL_TYPES).toContain(signal.type);
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(100);
    }
  });
});
