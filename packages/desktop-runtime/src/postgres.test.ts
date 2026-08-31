// These tests actually boot a real embedded Postgres cluster from the platform binaries bundled
// by the `embedded-postgres` npm package (verified in this sandbox on linux-x64) -- they are not
// mocked. If the platform binaries are genuinely unavailable (e.g. `pnpm install` couldn't reach
// the registry to install `@embedded-postgres/<platform>`, or ran on an unsupported
// platform/arch), `startEmbeddedPostgres` itself throws before a client connection is even
// attempted, and these tests fail loudly rather than silently passing -- there is no fallback
// path here to mock around, by design, since the whole point is proving the real orchestration
// works.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { startEmbeddedPostgres } from './postgres.js';

let dataDir: string | undefined;

afterEach(async () => {
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
    dataDir = undefined;
  }
});

describe('startEmbeddedPostgres', () => {
  it('boots a real cluster, accepts a real connection, and shuts down cleanly', async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'desktop-runtime-pg-'));

    const handle = await startEmbeddedPostgres({ dataDir, port: 55488 });
    expect(handle.databaseUrl).toBe('postgresql://gameworld:gameworld@127.0.0.1:55488/gameworld?schema=public');

    const client = new Client({ connectionString: handle.databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{ current_database: string; current_user: string }>(
        'SELECT current_database(), current_user',
      );
      expect(result.rows[0]).toEqual({ current_database: 'gameworld', current_user: 'gameworld' });
    } finally {
      await client.end();
    }

    await handle.stop();

    // A second connection attempt against the now-stopped server must fail -- proves stop()
    // actually tore the process down rather than just resolving a promise.
    const clientAfterStop = new Client({ connectionString: handle.databaseUrl, connectionTimeoutMillis: 2000 });
    await expect(clientAfterStop.connect()).rejects.toThrow();
    await clientAfterStop.end().catch(() => undefined);
  });

  it('reuses an already-initialised data directory on a second start instead of re-running initdb', async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'desktop-runtime-pg-persist-'));

    const first = await startEmbeddedPostgres({ dataDir, port: 55489 });
    const seedClient = new Client({ connectionString: first.databaseUrl });
    await seedClient.connect();
    await seedClient.query('CREATE TABLE persistence_check (id serial primary key)');
    await seedClient.end();
    await first.stop();

    // Re-starting against the same dataDir must skip initdb (which would fail outright against a
    // non-empty directory) and come back up with the previously-created table still present.
    const second = await startEmbeddedPostgres({ dataDir, port: 55489 });
    const verifyClient = new Client({ connectionString: second.databaseUrl });
    await verifyClient.connect();
    const result = await verifyClient.query(
      "SELECT to_regclass('public.persistence_check') IS NOT NULL AS exists",
    );
    await verifyClient.end();
    await second.stop();

    expect(result.rows[0].exists).toBe(true);
  });
});
