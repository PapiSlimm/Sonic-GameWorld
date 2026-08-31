// Programmatic equivalent of render.yaml's `preDeployCommand`
// (`services/api/node_modules/.bin/prisma migrate deploy --schema services/api/prisma/schema.prisma`)
// for the offline desktop build, where there is no deploy pipeline to run that shell command --
// the Electron main process calls this directly against the embedded Postgres cluster instead.
import { spawn } from 'node:child_process';

export interface RunPrismaMigrationsOptions {
  /** Connection string for the target database (e.g. the one returned by
   * `startEmbeddedPostgres`). Passed to the child process as `DATABASE_URL`, not read from
   * `schema.prisma`'s own `env("DATABASE_URL")` in the current process's environment -- this
   * lets the caller target a specific embedded instance without mutating its own env. */
  databaseUrl: string;
  /** Path to prisma/schema.prisma. */
  schemaPath: string;
  /** Path to the Prisma CLI's JS entrypoint (e.g.
   * `services/api/node_modules/prisma/build/index.js`), invoked via `node <prismaCliPath> ...`
   * rather than the `.bin/prisma` shell shim -- the shim is a POSIX/CMD script wrapper, not a
   * cross-platform way to invoke it, and doesn't exist as such on Windows. Running the CLI's own
   * JS entrypoint under `process.execPath` (whatever Node build is hosting this code, including
   * an Electron main process's bundled Node) works identically on every platform. */
  prismaCliPath: string;
}

/**
 * Runs `prisma migrate deploy` against `opts.databaseUrl` as a child process. Resolves once
 * migrations are applied; rejects with an error carrying the full captured stdout/stderr when
 * the CLI exits non-zero (or fails to launch at all), so the caller can surface a meaningful
 * message instead of just an exit code.
 */
export async function runPrismaMigrations(opts: RunPrismaMigrationsOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [opts.prismaCliPath, 'migrate', 'deploy', '--schema', opts.schemaPath], {
      env: { ...process.env, DATABASE_URL: opts.databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to launch the Prisma CLI at "${opts.prismaCliPath}": ${err.message}`));
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `"prisma migrate deploy --schema ${opts.schemaPath}" failed (exit code ${code ?? 'null'}, signal ${signal ?? 'null'}).\n` +
            `--- stdout ---\n${stdout || '(empty)'}\n--- stderr ---\n${stderr || '(empty)'}`,
        ),
      );
    });
  });
}
