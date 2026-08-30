import { describe, expect, it } from 'vitest';
import { parseGeneratedSpec } from './parseSpec.js';

describe('parseGeneratedSpec', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({ title: 'Neon Blade', description: 'A katana.', tags: ['sword', 'cyberpunk'], suggestedCategory: 'character', narration: 'Here you go.' });
    const spec = parseGeneratedSpec(raw, 'fallback');
    expect(spec.title).toBe('Neon Blade');
    expect(spec.suggestedCategory).toBe('CHARACTER');
    expect(spec.tags).toEqual(['sword', 'cyberpunk']);
  });

  it('strips a markdown code fence around the JSON', () => {
    const raw = '```json\n{"title": "Fenced", "description": "desc"}\n```';
    const spec = parseGeneratedSpec(raw, 'fallback');
    expect(spec.title).toBe('Fenced');
    expect(spec.suggestedCategory).toBe('EXPERIENCE'); // default when omitted
  });

  it('throws when there is no JSON object at all', () => {
    expect(() => parseGeneratedSpec('sorry, I cannot help with that', 'fallback')).toThrow();
  });

  it('throws when required fields are missing', () => {
    expect(() => parseGeneratedSpec('{"tags": ["a"]}', 'fallback')).toThrow(/missing required/);
  });
});
