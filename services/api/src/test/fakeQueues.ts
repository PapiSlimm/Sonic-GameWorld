// In-memory `Queues` test double (mirrors fakePrisma.ts's role for `PrismaLike`): records every
// `.add()` call instead of touching a real Redis/BullMQ connection, which isn't available in the
// test environment. See src/queues.ts's `QueueLike<T>` for why a plain object like this
// structurally satisfies the decorator type.
import type { Queues, QueueLike } from '../queues.js';

export interface FakeQueueCall<T> {
  jobName: string;
  data: T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts?: any;
}

export interface FakeQueue<T> extends QueueLike<T> {
  calls: FakeQueueCall<T>[];
}

function createFakeQueue<T>(): FakeQueue<T> {
  const calls: FakeQueueCall<T>[] = [];
  return {
    calls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async add(jobName: string, data: T, opts?: any) {
      calls.push({ jobName, data, opts });
      return { id: `fake-${calls.length}`, name: jobName, data };
    },
  };
}

export interface FakeQueues extends Queues {
  assetProcess: FakeQueue<Queues['assetProcess'] extends QueueLike<infer T> ? T : never>;
  aiGenerate: FakeQueue<Queues['aiGenerate'] extends QueueLike<infer T> ? T : never>;
  buildCompile: FakeQueue<Queues['buildCompile'] extends QueueLike<infer T> ? T : never>;
  moderationScan: FakeQueue<Queues['moderationScan'] extends QueueLike<infer T> ? T : never>;
  analyticsRollup: FakeQueue<Queues['analyticsRollup'] extends QueueLike<infer T> ? T : never>;
}

export function createFakeQueues(): FakeQueues {
  return {
    assetProcess: createFakeQueue(),
    aiGenerate: createFakeQueue(),
    buildCompile: createFakeQueue(),
    moderationScan: createFakeQueue(),
    analyticsRollup: createFakeQueue(),
  };
}
