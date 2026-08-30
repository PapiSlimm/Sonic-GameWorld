// Shared test bootstrap: a fully-wired Fastify app backed by the in-memory fakePrisma + a fresh
// memory event bus, with zero real I/O (no Postgres, no Redis, no network). Uses the
// `setPrismaForTests`/`setBusForTests` hooks in src/db.ts and src/bus.ts rather than vi.mock, so
// it works the same way under vitest or any other runner.
import type { FastifyInstance } from 'fastify';
import { createEventBus } from '@sonic-gameworld/events';
import { buildApp } from '../app.js';
import { setBusForTests, type EventBus } from '../bus.js';
import { setPrismaForTests, type PrismaLike } from '../db.js';
import { setQueuesForTests } from '../queues.js';
import { setStorageForTests } from '../storage.js';
import { createFakePrisma } from './fakePrisma.js';
import { createFakeQueues, type FakeQueues } from './fakeQueues.js';
import { createFakeStorage, type FakeStorage } from './fakeStorage.js';

export interface TestApp {
  app: FastifyInstance;
  prisma: PrismaLike;
  bus: EventBus;
  queues: FakeQueues;
  storage: FakeStorage;
  close: () => Promise<void>;
}

/** Build an isolated app instance for a single test. Always call `close()` afterwards
 * (e.g. from `afterEach`) so the next test gets a clean fake db + bus + queues + storage. */
export async function buildTestApp(): Promise<TestApp> {
  const prisma = createFakePrisma();
  const bus = createEventBus({ driver: 'memory' });
  const queues = createFakeQueues();
  const storage = createFakeStorage();
  setPrismaForTests(prisma);
  setBusForTests(bus);
  setQueuesForTests(queues);
  setStorageForTests(storage);

  const app = await buildApp();
  await app.ready();

  return {
    app,
    prisma,
    bus,
    queues,
    storage,
    close: async () => {
      await app.close();
      await bus.close();
      setPrismaForTests(undefined);
      setBusForTests(undefined);
      setQueuesForTests(undefined);
      setStorageForTests(undefined);
    },
  };
}

export interface DevLoginResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

/** Log in (creating the user on first use) via the dev-login route and return the session. */
export async function devLogin(app: FastifyInstance, email?: string): Promise<DevLoginResult> {
  const resolvedEmail = email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { email: resolvedEmail } });
  if (res.statusCode !== 200) {
    throw new Error(`devLogin failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json() as { tokens: { accessToken: string; refreshToken: string }; user: { id: string; email: string } };
  return { accessToken: body.tokens.accessToken, refreshToken: body.tokens.refreshToken, userId: body.user.id, email: body.user.email };
}
