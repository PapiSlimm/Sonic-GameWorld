import { describe, expect, it } from 'vitest';
import { mockGenerationProvider } from './mock.js';

describe('mockGenerationProvider', () => {
  it('produces a well-formed spec from a normal prompt', async () => {
    const result = await mockGenerationProvider.generate({ tool: 'generate_asset', prompt: 'a rusty cyberpunk motorcycle with neon trim', args: {} });
    expect(result.spec.title.length).toBeGreaterThan(0);
    expect(result.spec.description.length).toBeGreaterThan(0);
    expect(result.spec.tags.length).toBeGreaterThan(0);
    expect(result.spec.suggestedCategory).toBe('VEHICLE');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('never throws, even on an empty prompt', async () => {
    const result = await mockGenerationProvider.generate({ tool: 'generate_asset', prompt: '', args: {} });
    expect(result.spec.title.length).toBeGreaterThan(0);
    expect(result.spec.description.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', async () => {
    const a = await mockGenerationProvider.generate({ tool: 'spawn_npc', prompt: 'a grizzled detective NPC', args: {} });
    const b = await mockGenerationProvider.generate({ tool: 'spawn_npc', prompt: 'a grizzled detective NPC', args: {} });
    expect(a.spec).toEqual(b.spec);
  });

  it('guesses category from tool name when the prompt has no strong keyword', async () => {
    const result = await mockGenerationProvider.generate({ tool: 'create_quest', prompt: 'something exciting', args: {} });
    expect(result.spec.suggestedCategory).toBe('MISSION');
  });
});
