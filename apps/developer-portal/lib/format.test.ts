import { describe, expect, it } from 'vitest';
import { maskSecret, titleCase } from './format';

describe('maskSecret', () => {
  it('keeps the gw_live_ prefix and last 4 characters visible', () => {
    const masked = maskSecret('gw_live_9f2c9a1babcd3ab1');
    expect(masked.startsWith('gw_live_')).toBe(true);
    expect(masked.endsWith('3ab1')).toBe(true);
    expect(masked).not.toContain('9f2c9a1b');
  });

  it('returns short secrets unchanged', () => {
    expect(maskSecret('abc')).toBe('abc');
  });
});

describe('titleCase', () => {
  it('converts SCREAMING_SNAKE_CASE to Title Case', () => {
    expect(titleCase('ORDER_PAID')).toBe('Order Paid');
  });
  it('handles already-lowercase words', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });
});
