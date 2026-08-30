import { MemoryEventBus } from '@sonic-gameworld/events';
import { describe, expect, it } from 'vitest';
import { buildContext, type BuildDeps } from './index.js';
import { runPipeline } from './pipeline.js';
import { PIPELINE } from './stages/index.js';
import { MemoryStorage } from './storage.js';
import { createFakePrisma } from './test/fakePrisma.js';
import { buildTinyGlb } from './test/fixtures.js';
import type { JobPayload } from './types.js';

function fakeThumbnailQueue() {
  const added: unknown[] = [];
  return {
    added,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async add(name: string, data: unknown): Promise<any> {
      added.push({ name, data });
      return { id: `thumb-job-${added.length}` };
    },
  };
}

async function setup(glbOptions: Parameters<typeof buildTinyGlb>[0] = {}) {
  const glb = await buildTinyGlb(glbOptions);
  const storage = new MemoryStorage();
  const fileKey = 'uploads/asset-1/tiny.glb';
  storage.seed(fileKey, glb);

  const prisma = createFakePrisma();
  prisma.seedAsset({ id: 'asset-1', name: 'Tiny Prop', type: 'MODEL', tags: [], status: 'UPLOADING' });
  prisma.seedVersion({ id: 'version-1', assetId: 'asset-1', version: '1.0.0', fileKey, fileName: 'tiny.glb', sizeBytes: glb.byteLength, mimeType: 'model/gltf-binary' });
  prisma.seedPassport({
    assetId: 'asset-1',
    data: {
      license: {
        id: 'lic_standard',
        commercial: true,
        personal: true,
        enterprise: false,
        redistribution: false,
        modification: true,
        multiplayer: true,
        aiTraining: false,
        resale: false,
        sublicensing: false,
        attribution: false,
      },
    },
  });

  const bus = new MemoryEventBus();
  const thumbnailQueue = fakeThumbnailQueue();
  const deps: BuildDeps = {
    prisma,
    bus,
    storage,
    thumbnailQueue,
    config: {
      redisUrl: 'redis://unused',
      eventBusDriver: 'memory',
      storageDriver: 'memory',
      s3: { region: 'us-east1', bucket: 'test', forcePathStyle: false },
      concurrency: 1,
      autoApproveAssets: true,
      logLevel: 'silent',
    },
  };

  const job: JobPayload = {
    assetId: 'asset-1',
    versionId: 'version-1',
    fileKey,
    fileName: 'tiny.glb',
    mimeType: 'model/gltf-binary',
    sizeBytes: glb.byteLength,
    creatorId: 'creator-1',
  };

  return { job, deps, prisma, bus, thumbnailQueue };
}

describe('asset processing pipeline (in-memory GLB)', () => {
  it('runs every stage to completion for a clean GLB', async () => {
    const { job, deps, prisma, bus, thumbnailQueue } = await setup();
    const ctx = buildContext(job, deps);
    const result = await runPipeline(ctx, PIPELINE);

    expect(result.outcome).toBe('COMPLETED');
    expect(result.records).toHaveLength(PIPELINE.length);
    expect(result.records.every((r) => r.status !== 'FAILED')).toBe(true);

    const version = prisma.getVersion('version-1')!;
    expect(version.status).toBe('READY');
    expect(Array.isArray(version.pipeline)).toBe(true);
    expect(version.pipeline).toHaveLength(PIPELINE.length);

    const asset = prisma.getAsset('asset-1')!;
    expect(asset.status).toBe('READY');
    expect(typeof asset.qualityScore).toBe('number');
    expect(asset.qualityScore).toBeGreaterThan(0);

    // THUMBNAILS stage handed off to worker-thumbnails rather than rendering inline.
    expect(thumbnailQueue.added).toHaveLength(1);

    // MARKETPLACE stage publishes the fan-out event per CONTRACTS §7.
    expect(bus.history.some((e) => e.type === 'ASSET_PROCESSED')).toBe(true);

    // TEXTURE_OPTIMIZATION materialized at least one durable variant file.
    expect(prisma.getVariantFiles().length).toBeGreaterThan(0);
  });

  it('fails fast at 3D_VALIDATION for a mesh that is entirely degenerate', async () => {
    // A mesh whose only real triangle is degenerate trips the >50% threshold.
    const { job, deps } = await setup({ withDegenerateTriangle: true });
    const ctx = buildContext(job, deps);
    const result = await runPipeline(ctx, PIPELINE);

    expect(result.outcome).toBe('FAILED');
    expect(result.failedAt).toBe('3D_VALIDATION');
    const failedRecord = result.records.find((r) => r.stage === '3D_VALIDATION');
    expect(failedRecord?.error).toMatch(/degenerate/i);
  });

  it('resumes correctly from a stage index without re-running earlier stages', async () => {
    const { job, deps, prisma } = await setup();
    const ctx = buildContext(job, deps);

    // Run the first 3 stages, persist, then resume from index 3.
    const partial = await runPipeline(ctx, PIPELINE.slice(0, 3));
    expect(partial.outcome).toBe('COMPLETED');
    expect(prisma.getVersion('version-1')!.pipeline).toHaveLength(3);

    const rest = await runPipeline(ctx, PIPELINE, 3);
    expect(rest.outcome).toBe('COMPLETED');
    // Full history (3 earlier + everything from index 3 on) is preserved.
    expect(rest.records).toHaveLength(PIPELINE.length);
    expect(prisma.getVersion('version-1')!.pipeline).toHaveLength(PIPELINE.length);
  });

  it('pauses at CREATOR_APPROVAL (WAITING) when auto-approval is disabled, and resumes on forceApprove', async () => {
    const { job, deps } = await setup();
    deps.config.autoApproveAssets = false;
    const ctx = buildContext(job, deps);

    const firstPass = await runPipeline(ctx, PIPELINE);
    expect(firstPass.outcome).toBe('WAITING');
    const approvalIndex = PIPELINE.findIndex((s) => s.name === 'CREATOR_APPROVAL');
    expect(firstPass.records).toHaveLength(approvalIndex + 1);

    const resumedJob: JobPayload = { ...job, forceApprove: true, resumeFromIndex: approvalIndex };
    const resumedCtx = buildContext(resumedJob, deps);
    const secondPass = await runPipeline(resumedCtx, PIPELINE, approvalIndex);
    expect(secondPass.outcome).toBe('COMPLETED');
  });
});
