import { MemoryEventBus } from '@sonic-gameworld/events';
import type { LicenseRecord } from '@sonic-gameworld/world-schema';
import { describe, expect, it } from 'vitest';
import { buildContext, type BuildDeps } from './index.js';
import { runModerationPipeline } from './pipeline.js';
import { MODERATION_PIPELINE } from './stages/index.js';
import { MemoryStorage } from './storage.js';
import { createFakePrisma } from './test/fakePrisma.js';
import type { ModerationJobPayload } from './types.js';

function makeDeps(overrides: Partial<BuildDeps['config']> = {}): { deps: BuildDeps; prisma: ReturnType<typeof createFakePrisma>; bus: MemoryEventBus } {
  const prisma = createFakePrisma();
  const bus = new MemoryEventBus();
  const storage = new MemoryStorage();
  const deps: BuildDeps = {
    prisma,
    bus,
    storage,
    config: {
      redisUrl: 'redis://unused',
      eventBusDriver: 'memory',
      storageDriver: 'memory',
      s3: { region: 'us-east1', bucket: 'test', forcePathStyle: false },
      concurrency: 1,
      requireHumanReviewForLowSeverity: false,
      logLevel: 'silent',
      ...overrides,
    },
  };
  return { deps, prisma, bus };
}

const GOOD_LICENSE: LicenseRecord = {
  id: 'lic_ok',
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
};

const NON_COMMERCIAL_LICENSE: LicenseRecord = { ...GOOD_LICENSE, id: 'lic_personal_only', commercial: false };

describe('moderation pipeline', () => {
  it('auto-clears clean content straight through to PUBLISH', async () => {
    const { deps, prisma, bus } = makeDeps();
    const job: ModerationJobPayload = {
      refKind: 'PRODUCT',
      refId: 'product-1',
      content: { text: 'A low-poly medieval castle kit with 12 modular wall pieces.' },
      licenses: [GOOD_LICENSE],
    };
    const ctx = buildContext(job, deps);
    const result = await runModerationPipeline(ctx, MODERATION_PIPELINE);

    expect(result.outcome).toBe('COMPLETED');
    expect(prisma.allItems()).toHaveLength(0);
    const resolved = bus.history.find((e) => e.type === 'MODERATION_RESOLVED');
    expect(resolved).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((resolved!.payload as any).auto).toBe(true);
  });

  it('parks flagged content at HUMAN_REVIEW (WAITING) and creates a ModerationItem', async () => {
    const { deps, prisma, bus } = makeDeps();
    const job: ModerationJobPayload = {
      refKind: 'PRODUCT',
      refId: 'product-2',
      content: { text: 'Message me on Venmo for a discount, just send $20 directly and skip the marketplace fee.' },
    };
    const ctx = buildContext(job, deps);
    const result = await runModerationPipeline(ctx, MODERATION_PIPELINE);

    expect(result.outcome).toBe('WAITING');
    const items = prisma.allItems();
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe('PENDING');
    expect(items[0]!.severity).toBe('HIGH');
    expect(bus.history.some((e) => e.type === 'MODERATION_FLAGGED')).toBe(true);
  });

  it('resumes to COMPLETED when a moderator approves', async () => {
    const { deps } = makeDeps();
    const flagJob: ModerationJobPayload = { refKind: 'PRODUCT', refId: 'product-3', content: { text: 'Contact me at seller@example.com for a private deal.' } };
    const ctx1 = buildContext(flagJob, deps);
    const first = await runModerationPipeline(ctx1, MODERATION_PIPELINE);
    expect(first.outcome).toBe('WAITING');
    const humanReviewIndex = MODERATION_PIPELINE.findIndex((s) => s.name === 'HUMAN_REVIEW');
    const itemId = first.records[humanReviewIndex]!.details!.itemId as string;

    const resumeJob: ModerationJobPayload = { ...flagJob, itemId, resolution: 'APPROVED', resumeFromIndex: humanReviewIndex };
    const ctx2 = buildContext(resumeJob, deps);
    const second = await runModerationPipeline(ctx2, MODERATION_PIPELINE, humanReviewIndex);
    expect(second.outcome).toBe('COMPLETED');
  });

  it('stops (FAILED) when a moderator rejects, without reaching PUBLISH', async () => {
    const { deps } = makeDeps();
    const flagJob: ModerationJobPayload = { refKind: 'PRODUCT', refId: 'product-4', content: { text: 'Contact me at seller@example.com for a private deal.' } };
    const ctx1 = buildContext(flagJob, deps);
    const first = await runModerationPipeline(ctx1, MODERATION_PIPELINE);
    const humanReviewIndex = MODERATION_PIPELINE.findIndex((s) => s.name === 'HUMAN_REVIEW');
    const itemId = first.records[humanReviewIndex]!.details!.itemId as string;

    const resumeJob: ModerationJobPayload = { ...flagJob, itemId, resolution: 'REJECTED', resumeFromIndex: humanReviewIndex };
    const ctx2 = buildContext(resumeJob, deps);
    const second = await runModerationPipeline(ctx2, MODERATION_PIPELINE, humanReviewIndex);
    expect(second.outcome).toBe('FAILED');
    expect(second.failedAt).toBe('HUMAN_REVIEW');
    // PUBLISH must not have run.
    expect(second.records.some((r) => r.stage === 'PUBLISH')).toBe(false);
  });

  it('fails fast at LICENSE for a non-commercial license on a commercial marketplace listing', async () => {
    const { deps } = makeDeps();
    const job: ModerationJobPayload = { refKind: 'ASSET', refId: 'asset-1', licenses: [NON_COMMERCIAL_LICENSE] };
    const ctx = buildContext(job, deps);
    const result = await runModerationPipeline(ctx, MODERATION_PIPELINE);
    expect(result.outcome).toBe('FAILED');
    expect(result.failedAt).toBe('LICENSE');
  });
});
