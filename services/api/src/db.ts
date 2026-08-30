// PrismaClient singleton. Application code should import { getPrisma } (or the `db` proxy) from
// here rather than instantiating PrismaClient directly, so tests can swap in the in-memory
// fakePrisma test double (see src/test/fakePrisma.ts + src/test/helpers.ts) via `setPrismaForTests`.
import { PrismaClient } from '@prisma/client';
import { getConfig } from './config.js';

/** The subset of PrismaClient our app + fakePrisma both satisfy. */
export type PrismaLike = PrismaClient;

let client: PrismaLike | undefined;
let testOverride: PrismaLike | undefined;

function createClient(): PrismaClient {
  const config = getConfig();
  return new PrismaClient({ datasourceUrl: config.databaseUrl });
}

/** Lazily create (or return) the singleton Prisma client. In tests, returns the injected fake. */
export function getPrisma(): PrismaLike {
  if (testOverride) return testOverride;
  if (!client) client = createClient();
  return client;
}

/**
 * Test hook: inject a fake Prisma-like client (see fakePrisma.ts) so unit/integration tests never
 * touch a real database. Call with `undefined` to clear the override.
 */
export function setPrismaForTests(fake: PrismaLike | undefined): void {
  testOverride = fake;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

/**
 * Proxy that forwards every property access to whatever `getPrisma()` currently resolves to.
 * Lets call sites write `import { db } from './db.js'; db.user.findMany(...)` without threading
 * a client instance through every function signature.
 */
export const db: PrismaLike = new Proxy({} as PrismaLike, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma() as object, prop, receiver);
  },
}) as PrismaLike;
