// Embedded Postgres for the offline Windows desktop build. This replaces the `postgres` service
// from the root docker-compose.yml with a real Postgres cluster spawned as a child process from
// binaries bundled in the `embedded-postgres` npm package (no Docker, no separate installer, no
// network access required at runtime) -- see packages/desktop-runtime/README.md for the full
// rationale and what this trades off against the docker-compose Postgres (a different major
// version, and no PostGIS/pgvector extensions bundled).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/** Matches the credentials used by the `postgres` service in the root docker-compose.yml, so
 * connection strings look the same in both dev-with-Docker and offline-desktop modes. */
const PG_USER = 'gameworld';
const PG_PASSWORD = 'gameworld';
const PG_DATABASE = 'gameworld';

/** Avoids clashing with a real, separately-installed Postgres a user might already have
 * listening on the standard 5432 port. */
const DEFAULT_PORT = 55432;

export interface StartEmbeddedPostgresOptions {
  /** Directory the cluster's data files persist to. Created (including parents) if missing.
   * Reused as-is across app restarts -- this is what makes the database "installed once". */
  dataDir: string;
  /** TCP port to listen on. Defaults to 55432. */
  port?: number;
}

export interface EmbeddedPostgresHandle {
  /** `postgresql://gameworld:gameworld@127.0.0.1:<port>/gameworld?schema=public`, ready to hand
   * straight to Prisma / any pg client. */
  databaseUrl: string;
  /** Cleanly shuts the cluster down. Safe to call once; does not delete any data. */
  stop: () => Promise<void>;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Postgres error code for "database already exists", raised by CREATE DATABASE. */
const PG_DUPLICATE_DATABASE = '42P04';

function isDuplicateDatabaseError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === PG_DUPLICATE_DATABASE;
}

/**
 * Boots a real, embedded Postgres cluster and returns a ready-to-use connection string.
 *
 * On the very first call for a given `dataDir`, this runs `initdb` (via the `initialise()` call
 * below) before starting the server; on every later call against the same directory it skips
 * straight to starting, since the cluster is already initialised.
 *
 * NOTE ON THAT DISTINCTION: `embedded-postgres`'s own `initialise()` does not detect this for
 * you -- it unconditionally shells out to `initdb`, which errors out if pointed at a non-empty
 * data directory. So we do the detection ourselves, the same way `initdb` itself does: `initdb`
 * writes a `PG_VERSION` marker file into the data directory as (essentially) its last step, so
 * its presence means a previous run completed initialisation successfully.
 */
export async function startEmbeddedPostgres(opts: StartEmbeddedPostgresOptions): Promise<EmbeddedPostgresHandle> {
  const dataDir = path.resolve(opts.dataDir);
  const port = opts.port ?? DEFAULT_PORT;

  await fs.mkdir(dataDir, { recursive: true });
  const alreadyInitialised = await pathExists(path.join(dataDir, 'PG_VERSION'));

  // Postgres refuses to run its binaries as the root user (common on Linux dev containers/CI,
  // never true for a normal Windows or macOS desktop session -- `process.getuid` doesn't even
  // exist there). `createPostgresUser` is embedded-postgres's documented escape hatch for that
  // case: it re-runs `initdb`/`postgres` as a dedicated `postgres` system user instead, creating
  // that user first if needed. We only ever enable it when we detect we actually are root, so a
  // normal desktop install never touches host user accounts.
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

  const cluster = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: PG_USER,
    password: PG_PASSWORD,
    authMethod: 'password',
    persistent: true,
    createPostgresUser: isRoot,
  });

  if (!alreadyInitialised) {
    await cluster.initialise();
  }

  await cluster.start();

  // The cluster's default database is named after PG_USER ("gameworld"), not PG_DATABASE, so it
  // isn't guaranteed to exist yet even on a fresh initdb. Create it, tolerating the case where a
  // previous run on this same dataDir already created it.
  try {
    await cluster.createDatabase(PG_DATABASE);
  } catch (err) {
    if (!isDuplicateDatabaseError(err)) {
      await cluster.stop().catch(() => undefined);
      throw err;
    }
  }

  const databaseUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${PG_DATABASE}?schema=public`;

  return {
    databaseUrl,
    stop: () => cluster.stop(),
  };
}
