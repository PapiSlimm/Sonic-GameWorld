// Split out from migrate.test.ts deliberately: `vi.mock('node:child_process')` is scoped to the
// whole module graph loaded by THIS test file, not just to migrate.ts's own `import { spawn }`.
// Sharing a file with the real, unmocked integration tests (which boot a real embedded Postgres
// via `embedded-postgres`, itself built on `child_process`) would silently break those too --
// every child_process call anywhere in the dependency tree loaded by this file would be mocked,
// not just the one call site this file means to target. Keeping the mocked-spawn unit tests in
// their own file keeps the mock scoped to exactly what it's testing.
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import { runPrismaMigrations } from './migrate.js';

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

describe('runPrismaMigrations (mocked child_process)', () => {
  beforeEach(() => {
    (spawn as unknown as Mock).mockReset();
  });

  it('invokes `node <prismaCliPath> migrate deploy --schema <schemaPath>` with DATABASE_URL on the child env', async () => {
    const child = makeFakeChild();
    (spawn as unknown as Mock).mockReturnValue(child);

    const promise = runPrismaMigrations({
      databaseUrl: 'postgresql://gameworld:gameworld@127.0.0.1:55432/gameworld',
      schemaPath: '/repo/services/api/prisma/schema.prisma',
      prismaCliPath: '/repo/services/api/node_modules/prisma/build/index.js',
    });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/repo/services/api/node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', '/repo/services/api/prisma/schema.prisma'],
      expect.objectContaining({
        env: expect.objectContaining({ DATABASE_URL: 'postgresql://gameworld:gameworld@127.0.0.1:55432/gameworld' }),
      }),
    );

    child.emit('close', 0, null);
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects with the captured stdout and stderr when the CLI exits non-zero', async () => {
    const child = makeFakeChild();
    (spawn as unknown as Mock).mockReturnValue(child);

    const promise = runPrismaMigrations({
      databaseUrl: 'postgresql://x',
      schemaPath: '/a/schema.prisma',
      prismaCliPath: '/a/cli.js',
    });

    child.stdout.emit('data', Buffer.from('Applying migration `0001_init`\n'));
    child.stderr.emit('data', Buffer.from('Error: P3009 migrate found failed migrations\n'));
    child.emit('close', 1, null);

    await expect(promise).rejects.toThrow(/exit code 1/);
    await expect(promise).rejects.toThrow(/Applying migration `0001_init`/);
    await expect(promise).rejects.toThrow(/P3009 migrate found failed migrations/);
  });

  it('rejects when the CLI process fails to launch at all', async () => {
    const child = makeFakeChild();
    (spawn as unknown as Mock).mockReturnValue(child);

    const promise = runPrismaMigrations({
      databaseUrl: 'postgresql://x',
      schemaPath: '/a/schema.prisma',
      prismaCliPath: '/a/cli.js',
    });

    child.emit('error', new Error('spawn ENOENT'));

    await expect(promise).rejects.toThrow(/Failed to launch the Prisma CLI/);
  });
});
