# @sonic-gameworld/desktop-runtime

Boots the local infrastructure the offline Windows desktop build needs -- a real embedded
Postgres and a real embedded MinIO, both as plain child processes, plus a way to run Prisma
migrations against that embedded Postgres -- so `apps/desktop`'s Electron main process never has
to ask the user to install or run Docker. This package replaces exactly the `postgres`, `minio`,
and `minio-init` services from the root `docker-compose.yml`; it does not touch Redis or
OpenSearch, since `services/api` already has its own no-external-service fallbacks for those
(`services/api/src/search.ts`'s Postgres ILIKE fallback; the in-memory session/queue stores that
key off `REDIS_URL` being unset).

## Public API

```ts
import {
  startEmbeddedPostgres,
  startEmbeddedMinio,
  runPrismaMigrations,
} from '@sonic-gameworld/desktop-runtime';
```

### `startEmbeddedPostgres({ dataDir, port? })`

Boots a real Postgres cluster from the platform binaries bundled by the `embedded-postgres` npm
dependency (no download at app-run time -- the binaries ship inside the
`@embedded-postgres/<platform>` packages that `embedded-postgres` depends on, fetched once during
`pnpm install`; see Platform binaries below).

- Creates `dataDir` if missing, and treats it as persistent storage: data survives across app
  restarts as long as the same `dataDir` is passed again.
- Detects first-run vs. reuse itself, by checking for the `PG_VERSION` file that `initdb` writes
  on success. **This detection is NOT something the `embedded-postgres` library does for you** --
  its own `initialise()` unconditionally shells out to `initdb`, which errors out if pointed at a
  non-empty directory. (The task brief this package was built from assumed the library handled
  this; reading its source confirmed it doesn't, so `postgres.ts` does the check itself.)
- Fixed credentials matching the docker-compose `postgres` service: user `gameworld`, password
  `gameworld`, database `gameworld`.
- Default port `55432` (not `5432`) specifically so it doesn't collide with a Postgres a
  developer might already have running locally.
- Returns `{ databaseUrl, stop }`. `databaseUrl` is a ready-to-use
  `postgresql://gameworld:gameworld@127.0.0.1:<port>/gameworld?schema=public` string. `stop()`
  shuts the cluster down cleanly (SIGINT on POSIX, `taskkill` on Windows -- handled inside
  `embedded-postgres` itself) and never deletes data.
- When running as root (uid 0 -- true in CI/Linux containers, structurally never true on a normal
  Windows or macOS desktop session), it automatically sets `embedded-postgres`'s
  `createPostgresUser` option so Postgres can run as a dedicated `postgres` system user instead of
  refusing to start as root. This never touches a real desktop user's account.

### `startEmbeddedMinio({ dataDir, binaryPath, port?, consolePort? })`

Spawns a MinIO server binary as `<binaryPath> server <dataDir> --address 127.0.0.1:<port>
--console-address 127.0.0.1:<consolePort>`, with `MINIO_ROOT_USER=minio` /
`MINIO_ROOT_PASSWORD=minio12345` in its environment -- the same credentials the docker-compose
`minio` service uses.

- **This package does not fetch or bundle the MinIO binary.** `binaryPath` must point to a real
  `minio` / `minio.exe` executable; sourcing and packaging that binary per-platform is the
  Electron packaging step's job (see Platform binaries below).
- Polls MinIO's own `/minio/health/live` endpoint with real HTTP requests until it responds (or
  the process exits early, whichever happens first) -- no fixed sleep.
- Once healthy, uses the `minio` SDK to create the `gameworld-assets` bucket if it doesn't exist
  and apply an anonymous-download bucket policy to it -- reproducing exactly what the
  docker-compose `minio-init` service's `mc mb -p local/gameworld-assets` +
  `mc anonymous set download local/gameworld-assets` do.
- Returns `{ endpoint, accessKey, secretKey, bucket, stop }`. `stop()` sends SIGTERM and escalates
  to SIGKILL after a 5s grace period if the process hasn't exited.
- If anything after the process spawns fails (health check times out, bucket setup errors), the
  spawned process is killed before the returned promise rejects -- no orphaned MinIO process is
  left running when this function throws.

### `runPrismaMigrations({ databaseUrl, schemaPath, prismaCliPath })`

The programmatic equivalent of `render.yaml`'s `preDeployCommand`
(`services/api/node_modules/.bin/prisma migrate deploy --schema services/api/prisma/schema.prisma`),
for a context (Electron) with no deploy pipeline to run that shell command.

- Spawns `<prismaCliPath>` under `process.execPath` (i.e. `node <prismaCliPath> migrate deploy
  --schema <schemaPath>`) -- **not** the `.bin/prisma` shell/CMD shim, which isn't a
  cross-platform way to invoke it and wouldn't run as-is on Windows. `prismaCliPath` should point
  at the Prisma CLI's own JS entrypoint, e.g. `services/api/node_modules/prisma/build/index.js`.
- Sets `DATABASE_URL` on the *child process's* environment to `opts.databaseUrl` -- it does not
  read or mutate `schema.prisma`'s own `env("DATABASE_URL")` in the current process.
- Resolves once the CLI exits 0. Rejects with an `Error` containing the exit code/signal and the
  full captured stdout + stderr when it exits non-zero, or a launch-failure message if the CLI
  process couldn't even start (e.g. bad `prismaCliPath`).

## Platform binaries -- what ships where

| Binary | Source | Bundled by |
|---|---|---|
| Postgres (`postgres`, `initdb`, ...) | `embedded-postgres`'s `@embedded-postgres/<platform>` npm dependencies | This package, transitively, via `pnpm install` |
| MinIO server | Official MinIO release binary | **Not this package** -- the Electron packaging step, which passes its path in as `binaryPath` |

`embedded-postgres` depends on one `@embedded-postgres/<platform>` package per OS/arch
combination (`darwin-arm64`, `darwin-x64`, `linux-*`, `windows-x64`); each ships the actual
Postgres binaries for that platform inside the npm package itself (not downloaded separately at
install time). The one thing they each need is a `postinstall` script that recreates a handful of
symlinks npm's tarball format can't preserve -- pnpm ignores third-party postinstall scripts by
default, so the root `package.json`'s `pnpm.onlyBuiltDependencies` list had to be extended with
all eight `@embedded-postgres/*` package names for this to work out of the box on a fresh
`pnpm install` (verified: before that change, `pnpm install` printed "Ignored build scripts" for
`@embedded-postgres/linux-x64` and the postgres binary's `.so` symlinks were missing, which broke
`initdb`; after the change, `pnpm install` runs the postinstall automatically and the symlinks are
present).

## What was verified for real vs. mocked, and why

**Embedded Postgres -- fully verified for real, on linux-x64, in this sandbox**, including:
- fresh `initdb` + start against an empty data directory,
- a real `pg` client connecting, running a query, and getting real rows back,
- clean `stop()`, then confirming a *second* connection attempt genuinely fails (proves the
  process actually died, not just that a promise resolved),
- restarting against the *same* data directory afterward and confirming it skips `initdb` (which
  would otherwise fail against a non-empty directory) and that data created in the first run
  (a table) is still there in the second.

See `src/postgres.test.ts`. No mocking of `embedded-postgres` or `child_process` anywhere in this
file.

**Embedded MinIO -- partially verified for real; the genuine MinIO binary itself is unavailable
in this sandbox.** This sandbox's network egress proxy only allow-lists the npm registry and a
handful of other package indexes -- both of MinIO's official binary distribution points return a
hard 403 *from the proxy itself* before ever reaching the real server:

```
$ curl https://dl.min.io/server/minio/release/linux-amd64/minio
curl: (56) CONNECT tunnel failed, response 403
$ curl -L https://github.com/minio/minio/releases/latest
403
```

(`apt-get install minio` also has no such package in this image.) Given that, `src/minio.test.ts`:
- **Really** unit-tests `buildMinioServerArgs` and `anonymousDownloadBucketPolicy` (pure
  functions, real assertions, no server or process involved).
- **Really** unit-tests `ensureAnonymousDownloadBucket`'s decision logic (create-if-missing,
  always re-apply the policy) against a small in-memory double of the `minio` SDK's client
  surface -- this is the actual business logic `startEmbeddedMinio` runs, refactored out
  specifically so it's testable without a live server.
- **Really** spawns two small stand-in "binaries" (genuine Node scripts, genuinely exec'd via
  `child_process.spawn` -- nothing here is mocked) to exercise the real spawn / wait-for-ready /
  cleanup control flow: one that exits immediately (proving the early-exit error path surfaces
  captured stderr and the exit code), and one that runs a real HTTP server answering
  `/minio/health/live` (proving the real polling loop detects real readiness over a real socket,
  and that a subsequent failure -- expected, since the stand-in doesn't speak the S3 API -- still
  cleans up the child process rather than leaking it).
- **Skips**, with an `it.skip` and the reproduction above in a comment, the one thing that
  genuinely needs a real MinIO binary: creating a real bucket and confirming a real anonymous GET
  against it.

**`runPrismaMigrations` -- the wrapper logic is fully verified for real (real spawn, real
Postgres); a full successful migration run is not achievable in this sandbox**, for a reason
specific to Prisma rather than to embedded Postgres or this package. Prisma 6.19.3 (the version
pinned in `services/api`) needs to fetch a native `schema-engine` binary from
`https://binaries.prisma.sh` at invocation time, and that host is not on this sandbox's egress
allow-list either:

```
$ DATABASE_URL=... node services/api/node_modules/prisma/build/index.js migrate deploy \
    --schema services/api/prisma/schema.prisma
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/all_commits/.../schema-engine.gz.sha256 - 403 Forbidden
```

`src/migrate.test.ts` runs `runPrismaMigrations` for real against a real embedded Postgres
cluster and the real Prisma CLI entrypoint, and asserts on exactly this real, reproducible
failure -- proving the function really spawns the real CLI against a real database and really
surfaces its real stderr. `src/migrate.spawn.test.ts` separately unit-tests the argument
construction and stdout/stderr/exit-code/launch-failure handling with `child_process.spawn`
mocked (split into its own file deliberately: a `vi.mock('node:child_process')` in the same file
as the real Postgres test would also mock the `child_process` calls `embedded-postgres` makes
internally, since vitest module mocks apply to the whole file's module graph, not just one import
site).

**Implication for whoever bundles the real Electron app**: this is not merely a sandbox quirk. A
genuinely offline desktop install needs the Prisma `schema-engine` binary available *without*
network access, since `prisma migrate deploy` will make this exact request otherwise the first
time it runs on a fresh user machine. Two ways to handle it, in order of least effort:
1. Bundle a pre-populated Prisma engine cache alongside the app (whatever `services/api`'s own
   `pnpm install` / `prisma generate` downloaded at build time) and point `PRISMA_ENGINES_MIRROR`
   (or the CLI's engine cache directory) at it before calling `runPrismaMigrations`.
2. Confirm before shipping that a `pnpm install && pnpm --filter @sonic-gameworld/api prisma
   generate` in your actual build environment (which, unlike this sandbox, presumably has normal
   internet access) leaves a usable engine binary in `services/api/node_modules`, and ship that
   `node_modules` tree as-is inside the Electron app package.

## Another schema caveat worth knowing about: PostGIS / pgvector

Independent of the above: `services/api/prisma/migrations/0001_init/migration.sql` runs `CREATE
EXTENSION IF NOT EXISTS postgis;` and `CREATE EXTENSION IF NOT EXISTS vector;` unconditionally. A
plain `embedded-postgres` cluster (verified: Postgres 18.4 on linux-x64 here) does **not** bundle
either extension's shared library, so those two statements will make the whole migration fail the
first time `runPrismaMigrations` runs against a fresh embedded Postgres data directory --
independently of, and in addition to, the schema-engine-binary issue above. `schema.prisma`'s own
comments (around the `WorldRegion` model) note that the *columns* using these extensions are
nullable "so migrations succeed without the extension present," but that only protects the
column-level SQL, not the `CREATE EXTENSION` statements themselves. This is a `services/api`
schema/migration concern, out of this package's scope to fix, but the Electron integrator should
know about it before assuming `runPrismaMigrations` will just work end-to-end against a vanilla
embedded Postgres.

## Files

- `src/postgres.ts` -- `startEmbeddedPostgres`
- `src/minio.ts` -- `startEmbeddedMinio`, plus the exported `buildMinioServerArgs`,
  `anonymousDownloadBucketPolicy`, `ensureAnonymousDownloadBucket`, and the `MinioBucketClient`
  interface (all re-exported from `index.ts`, useful on their own for testing or for a caller
  that wants to point them at a client it already constructed differently)
- `src/migrate.ts` -- `runPrismaMigrations`
- `src/index.ts` -- re-exports all of the above
