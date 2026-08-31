// Desktop mode's in-process queue driver (see src/queues.ts's `createLocalQueues`): jobs run
// immediately in the background instead of round-tripping through Redis/BullMQ. Covers the two
// things that matter for a drop-in `Queues` replacement: `.add()` resolves without waiting for the
// handler, and a handler that throws is caught rather than becoming an unhandled rejection.
import { describe, expect, it, vi } from 'vitest';
import { createLocalQueues, type LocalQueueHandlers } from './queues.js';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLocalQueues', () => {
  it('runs each handler with the enqueued payload and resolves .add() without waiting for it', async () => {
    const seen = deferred<{ tool: string }>();
    const handlers: LocalQueueHandlers = {
      assetProcess: vi.fn().mockResolvedValue(undefined),
      aiGenerate: vi.fn(async (payload) => {
        seen.resolve(payload);
      }),
      buildCompile: vi.fn().mockResolvedValue(undefined),
      moderationScan: vi.fn().mockResolvedValue(undefined),
      analyticsRollup: vi.fn().mockResolvedValue(undefined),
    };
    const queues = createLocalQueues(handlers);

    const job = await queues.aiGenerate.add('generate', { tool: 'npc-writer', prompt: 'hi' } as never);
    expect(job.name).toBe('generate');

    const payload = await seen.promise;
    expect(payload).toEqual({ tool: 'npc-writer', prompt: 'hi' });
    expect(handlers.aiGenerate).toHaveBeenCalledTimes(1);
  });

  it('logs a failing handler instead of throwing out of .add() or crashing the process', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handlers: LocalQueueHandlers = {
      assetProcess: vi.fn().mockRejectedValue(new Error('boom')),
      aiGenerate: vi.fn().mockResolvedValue(undefined),
      buildCompile: vi.fn().mockResolvedValue(undefined),
      moderationScan: vi.fn().mockResolvedValue(undefined),
      analyticsRollup: vi.fn().mockResolvedValue(undefined),
    };
    const queues = createLocalQueues(handlers);

    await expect(queues.assetProcess.add('process', {} as never)).resolves.toMatchObject({ name: 'process' });
    // Let the background `.catch()` in createLocalQueue run.
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[local-queue:asset-process]'), 'boom');

    errorSpy.mockRestore();
  });
});
