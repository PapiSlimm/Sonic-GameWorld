// Real, unmocked tests: a real embedded Postgres (from postgres.ts, proven working in
// postgres.test.ts) and the real Prisma CLI entrypoint that ships in services/api/node_modules.
// See migrate.spawn.test.ts for the mocked-child_process unit tests of argument construction and
// error handling -- deliberately kept in a separate file, since `vi.mock('node:child_process')`
// would otherwise also mock the child_process calls `startEmbeddedPostgres` makes internally
// (via the `embedded-postgres` package) here, breaking this file's real Postgres cluster.
//
// This real run genuinely fails in this sandbox, for a reason that has nothing to do with our
// code: the installed Prisma CLI (6.19.3) needs to fetch a native "schema-engine" binary from
// https://binaries.prisma.sh at invocation time, and that host is not on this sandbox's network
// egress allow-list (confirmed by hand: `DATABASE_URL=... node
// services/api/node_modules/prisma/build/index.js migrate deploy --schema
// services/api/prisma/schema.prisma` -> "Error: Failed to fetch sha256 checksum at
// https://binaries.prisma.sh/... - 403 Forbidden"). The test below asserts on exactly this real,
// reproducible failure, which still proves runPrismaMigrations really spawns the real CLI against
// a real database and really surfaces its real stderr -- the one thing it cannot prove here is a
// *successful* migration run, which is skipped below with the same explanation.
//
// IMPLICATION FOR THE ELECTRON INTEGRATOR: this is not merely a sandbox quirk. A genuinely
// offline desktop install needs this same binary available without network access, since
// `prisma migrate deploy` will make this exact request otherwise. See the package README's
// Limitations section.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runPrismaMigrations } from './migrate.js';
import { startEmbeddedPostgres } from './postgres.js';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

describe('runPrismaMigrations against a real embedded Postgres + the real Prisma CLI', () => {
  let dataDir: string | undefined;
  let stopPostgres: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await stopPostgres?.();
    stopPostgres = undefined;
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
      dataDir = undefined;
    }
  });

  it('really spawns the real Prisma CLI against a real database, and surfaces its real (environment-caused) failure', async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'desktop-runtime-migrate-'));
    const pg = await startEmbeddedPostgres({ dataDir, port: 55491 });
    stopPostgres = pg.stop;

    await expect(
      runPrismaMigrations({
        databaseUrl: pg.databaseUrl,
        schemaPath: path.join(repoRoot, 'services/api/prisma/schema.prisma'),
        prismaCliPath: path.join(repoRoot, 'services/api/node_modules/prisma/build/index.js'),
      }),
    ).rejects.toThrow(/binaries\.prisma\.sh|schema-engine/);
  });

  // Not runnable in this sandbox for the reason documented at the top of this file: the Prisma
  // CLI needs to fetch its native schema-engine binary from a host this sandbox's network
  // egress proxy blocks (403). Once that binary is available (as it will be in any normal
  // `pnpm install`, and must be pre-bundled for the real offline desktop build), this same call
  // is expected to actually apply every migration in services/api/prisma/migrations/ and this
  // test would query information_schema.tables to confirm it.
  it.skip('actually creates the schema.prisma tables (needs a real prisma schema-engine binary, unavailable in this sandbox)', () => {
    // Intentionally left unimplemented -- see comment above.
  });
});
