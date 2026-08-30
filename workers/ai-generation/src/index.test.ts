import { MemoryEventBus } from '@sonic-gameworld/events';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';
import { processGenerateJob } from './index.js';
import { createFakePrisma } from './test/fakePrisma.js';
import type { GenerateJobPayload } from './types.js';

describe('processGenerateJob', () => {
  it('runs the mock provider end-to-end and persists AIExecution + AIUsage', async () => {
    const prisma = createFakePrisma();
    const bus = new MemoryEventBus();
    const config = loadConfig({ AI_GENERATION_PROVIDER: 'mock' } as NodeJS.ProcessEnv);

    const job: GenerateJobPayload = { worldId: 'world-1', actorId: 'user-1', tool: 'generate_asset', prompt: 'a glowing cyberpunk motorcycle', args: { style: 'neon' } };
    const result = await processGenerateJob(job, { prisma, bus, config });

    expect(result.ok).toBe(true);
    expect(result.spec.title.length).toBeGreaterThan(0);

    const executions = prisma.executions();
    expect(executions).toHaveLength(1);
    expect(executions[0]!.ok).toBe(true);
    expect(executions[0]!.tool).toBe('generate_asset');
    expect(executions[0]!.worldId).toBe('world-1');

    const usages = prisma.usages();
    expect(usages).toHaveLength(1);
    expect(usages[0]!.inputTokens).toBeGreaterThan(0);

    const published = bus.history.find((e) => e.type === 'AI_TOOL_EXECUTED');
    expect(published).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((published!.payload as any).ok).toBe(true);
  });

  it('falls back to the mock provider and still succeeds when the configured provider has no API key', async () => {
    const prisma = createFakePrisma();
    const bus = new MemoryEventBus();
    // 'anthropic' requested but no key configured -> resolveGenerationProvider already returns mock.
    const config = loadConfig({ AI_GENERATION_PROVIDER: 'anthropic' } as NodeJS.ProcessEnv);

    const job: GenerateJobPayload = { tool: 'spawn_npc', prompt: 'a grumpy dockworker', args: {} };
    const result = await processGenerateJob(job, { prisma, bus, config });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('mock');
    expect(prisma.executions()).toHaveLength(1);
  });

  it('always writes an AIExecution row and event even for an empty prompt', async () => {
    const prisma = createFakePrisma();
    const bus = new MemoryEventBus();
    const config = loadConfig({} as NodeJS.ProcessEnv);

    const job: GenerateJobPayload = { tool: 'generate_asset', prompt: '', args: {} };
    const result = await processGenerateJob(job, { prisma, bus, config });

    expect(result.ok).toBe(true);
    expect(prisma.executions()).toHaveLength(1);
    expect(bus.history.some((e) => e.type === 'AI_TOOL_EXECUTED')).toBe(true);
  });
});
