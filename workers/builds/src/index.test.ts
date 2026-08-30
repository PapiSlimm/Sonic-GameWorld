import { MemoryEventBus } from '@sonic-gameworld/events';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';
import { processBuildJob, type ProcessDeps } from './index.js';
import { MemoryStorage } from './storage.js';
import { createFakePrisma } from './test/fakePrisma.js';
import { buildTestWorld } from './test/fixtures.js';
import type { BuildJobPayload } from './types.js';

function makeDeps(): { deps: ProcessDeps; prisma: ReturnType<typeof createFakePrisma>; bus: MemoryEventBus; storage: MemoryStorage } {
  const prisma = createFakePrisma();
  const bus = new MemoryEventBus();
  const storage = new MemoryStorage();
  const config = loadConfig({ STORAGE_DRIVER: 'memory' } as NodeJS.ProcessEnv);
  return { deps: { prisma, bus, storage, config }, prisma, bus, storage };
}

describe('processBuildJob', () => {
  it('compiles WEB + UNITY + UNREAL packages, uploads them, and records buildRef', async () => {
    const { deps, prisma, bus, storage } = makeDeps();
    prisma.seedGameVersion({ id: 'gv-1', gameId: 'game-1', version: '1.0.0' });
    const doc = buildTestWorld();

    const job: BuildJobPayload = { gameId: 'game-1', gameVersionId: 'gv-1', worldId: doc.id, worldDocument: doc, engines: ['WEB', 'UNITY', 'UNREAL'], requestedBy: 'creator-1' };
    const result = await processBuildJob(job, deps);

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(3);
    expect(result.failures).toHaveLength(0);
    expect(storage.objects.size).toBe(3);

    const gv = prisma.getGameVersion('gv-1')!;
    expect(gv.buildRef.artifacts).toHaveLength(3);

    expect(bus.history.some((e) => e.type === 'BUILD_COMPILED')).toBe(true);
  });

  it('fetches the world document from worldVersionId when not provided inline', async () => {
    const { deps, prisma } = makeDeps();
    const doc = buildTestWorld();
    prisma.seedWorldVersion({ id: 'wv-1', worldId: doc.id, version: '1.0.0', document: doc, createdBy: 'creator-1' });
    prisma.seedGameVersion({ id: 'gv-2', gameId: 'game-2', version: '1.0.0' });

    const job: BuildJobPayload = { gameId: 'game-2', gameVersionId: 'gv-2', worldId: doc.id, worldVersionId: 'wv-1', engines: ['WEB'] };
    const result = await processBuildJob(job, deps);
    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
  });

  it('fails every requested engine when the world document does not pass validation', async () => {
    const { deps, prisma } = makeDeps();
    prisma.seedGameVersion({ id: 'gv-3', gameId: 'game-3', version: '1.0.0' });
    const badDoc = { ...buildTestWorld(), entities: [{ ...buildTestWorld().entities[0]!, id: 'not-a-uuid' }] };

    const job: BuildJobPayload = { gameId: 'game-3', gameVersionId: 'gv-3', worldId: 'world-x', worldDocument: badDoc as never, engines: ['WEB', 'UNITY'] };
    const result = await processBuildJob(job, deps);
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.artifacts).toHaveLength(0);
  });
});
