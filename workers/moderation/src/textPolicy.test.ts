import { describe, expect, it } from 'vitest';
import { scanTextSafetyHeuristics } from './textPolicy.js';

describe('scanTextSafetyHeuristics', () => {
  it('does not flag ordinary dark-themed game copy', () => {
    const result = scanTextSafetyHeuristics('A gritty zombie apocalypse shooter set in a war-torn city, featuring siege weapons and melee combat.');
    expect(result.flagged).toBe(false);
    expect(result.severity).toBe('LOW');
  });

  it('flags explicit bomb-making instructions as CRITICAL', () => {
    const result = scanTextSafetyHeuristics('This tutorial explains how to build a bomb using household chemicals.');
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.categories).toContain('EXTREMISM_TERRORISM');
  });

  it('flags self-harm promotion as HIGH', () => {
    const result = scanTextSafetyHeuristics('Here are ways to kill yourself without pain.');
    expect(result.flagged).toBe(true);
    expect(result.severity).toBe('HIGH');
    expect(result.categories).toContain('SELF_HARM_PROMOTION');
  });

  it('is empty-text safe', () => {
    expect(scanTextSafetyHeuristics('').flagged).toBe(false);
  });
});
