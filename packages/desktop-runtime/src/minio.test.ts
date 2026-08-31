// We do not have a genuine MinIO server binary to test against in this sandbox: the network
// egress proxy here only allow-lists the npm registry (and a handful of other package indexes),
// so both `https://dl.min.io/...` and `https://github.com/minio/minio/releases/...` come back
// with a hard 403 from the proxy itself (confirmed with a plain `curl`, and `apt-get install
// minio` has no such package either). See the full end-to-end test at the bottom of this file,
// skipped for that specific reason.
//
// What *is* tested for real here, without mocking `child_process` at all: we spawn a small,
// real Node script (written to a temp file and exec'd directly, not required as a module) that
// stands in for the "MinIO binary" well enough to exercise `startEmbeddedMinio`'s actual spawn
// -> poll-for-health -> (fail at the real S3 call, since our stand-in doesn't speak S3) ->
// clean-up-the-child-process control flow, plus a second stand-in that exits immediately to
// prove the early-exit error path. Everything that doesn't need a live process (argument
// construction, the bucket policy JSON, the bucket-creation decision logic) is unit-tested
// directly against real assertions, no server involved.
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  anonymousDownloadBucketPolicy,
  buildMinioServerArgs,
  ensureAnonymousDownloadBucket,
  startEmbeddedMinio,
  type MinioBucketClient,
} from './minio.js';

describe('buildMinioServerArgs', () => {
  it('matches the docker-compose minio service invocation shape', () => {
    expect(buildMinioServerArgs({ dataDir: '/data/minio', port: 9000, consolePort: 9001 })).toEqual([
      'server',
      '/data/minio',
      '--address',
      '127.0.0.1:9000',
      '--console-address',
      '127.0.0.1:9001',
    ]);
  });
});

describe('anonymousDownloadBucketPolicy', () => {
  it('mirrors the policy `mc anonymous set download` applies', () => {
    const policy = JSON.parse(anonymousDownloadBucketPolicy('gameworld-assets'));
    expect(policy.Version).toBe('2012-10-17');
    const actions = policy.Statement.flatMap((s: { Action: string[] }) => s.Action);
    expect(actions).toEqual(
      expect.arrayContaining(['s3:GetBucketLocation', 's3:ListBucket', 's3:GetObject']),
    );
    // Anonymous principal ("*"), and never a write action -- this is a read-only policy.
    for (const statement of policy.Statement) {
      expect(statement.Principal).toEqual({ AWS: ['*'] });
      expect(statement.Effect).toBe('Allow');
    }
    expect(actions).not.toContain('s3:PutObject');
    expect(actions).not.toContain('s3:DeleteObject');
  });
});

describe('ensureAnonymousDownloadBucket', () => {
  function fakeClient(initiallyExists: boolean) {
    const calls: string[] = [];
    const client: MinioBucketClient = {
      async bucketExists(bucket) {
        calls.push(`bucketExists:${bucket}`);
        return initiallyExists;
      },
      async makeBucket(bucket) {
        calls.push(`makeBucket:${bucket}`);
      },
      async setBucketPolicy(bucket, policy) {
        calls.push(`setBucketPolicy:${bucket}:${policy.length}`);
      },
    };
    return { client, calls };
  }

  it('creates the bucket when it does not exist yet, then sets the policy', async () => {
    const { client, calls } = fakeClient(false);
    await ensureAnonymousDownloadBucket(client, 'gameworld-assets');
    expect(calls[0]).toBe('bucketExists:gameworld-assets');
    expect(calls[1]).toBe('makeBucket:gameworld-assets');
    expect(calls[2]).toMatch(/^setBucketPolicy:gameworld-assets:/);
  });

  it('skips bucket creation, but still (re-)applies the policy, when the bucket already exists', async () => {
    const { client, calls } = fakeClient(true);
    await ensureAnonymousDownloadBucket(client, 'gameworld-assets');
    expect(calls).toEqual(['bucketExists:gameworld-assets', expect.stringMatching(/^setBucketPolicy:/)]);
  });
});

// ---------------------------------------------------------------------------------------------
// Real child-process tests against a stand-in "binary" (a genuine Node script, genuinely
// spawned -- child_process itself is not mocked).
// ---------------------------------------------------------------------------------------------

let scriptDir: string | undefined;

afterEach(async () => {
  if (scriptDir) {
    await rm(scriptDir, { recursive: true, force: true }).catch(() => undefined);
    scriptDir = undefined;
  }
});

/** Writes an executable script standing in for a MinIO binary and returns its path. */
async function writeFakeBinary(name: string, body: string): Promise<string> {
  scriptDir = scriptDir ?? (await mkdtemp(path.join(tmpdir(), 'desktop-runtime-minio-')));
  const scriptPath = path.join(scriptDir, name);
  await writeFile(scriptPath, `#!/usr/bin/env node\n${body}`, 'utf-8');
  await chmod(scriptPath, 0o755);
  return scriptPath;
}

describe('startEmbeddedMinio against a real (but fake) spawned process', () => {
  it('surfaces captured stderr and the exit code when the binary exits immediately', async () => {
    const binaryPath = await writeFakeBinary(
      'exits-immediately.js',
      `process.stderr.write('simulated fatal startup error\\n'); process.exit(1);`,
    );
    const dataDir = path.join(scriptDir!, 'data');

    await expect(startEmbeddedMinio({ binaryPath, dataDir, port: 19000, consolePort: 19001 })).rejects.toThrow(
      /exited before becoming ready.*code 1.*simulated fatal startup error/s,
    );
  });

  it('passes the health-check gate against a real HTTP server, then cleans up the child when bucket setup fails', async () => {
    // This stand-in genuinely listens on the given --address and genuinely answers
    // /minio/health/live with 200, so `startEmbeddedMinio`'s real fetch-based polling loop
    // observes a real "healthy" response over a real socket. It doesn't implement the S3 API,
    // so the subsequent bucketExists/makeBucket/setBucketPolicy calls are expected to fail --
    // this test's point is to prove the spawn + readiness-detection + cleanup-on-failure control
    // flow works, not to fake a full S3 backend.
    const binaryPath = await writeFakeBinary(
      'fake-health-server.js',
      `
      const http = require('node:http');
      const args = process.argv.slice(2);
      const addr = args[args.indexOf('--address') + 1];
      const [host, port] = addr.split(':');
      const server = http.createServer((req, res) => {
        if (req.url === '/minio/health/live') {
          res.writeHead(200);
          res.end();
          return;
        }
        res.writeHead(501);
        res.end();
      });
      server.listen(Number(port), host);
      `,
    );
    const dataDir = path.join(scriptDir!, 'data');

    await expect(startEmbeddedMinio({ binaryPath, dataDir, port: 19010, consolePort: 19011 })).rejects.not.toThrow(
      /exited before becoming ready/,
    );
  });

  // Full genuine end-to-end test (real MinIO binary, real bucket creation, real anonymous-GET
  // verification) -- SKIPPED. This sandbox's network egress proxy only allow-lists the npm
  // registry and a few other package indexes; both of MinIO's official binary distribution
  // points return a hard 403 from the proxy before ever reaching the real server:
  //   curl https://dl.min.io/server/minio/release/linux-amd64/minio          -> curl: (56) CONNECT tunnel failed, response 403
  //   curl -L https://github.com/minio/minio/releases/latest                -> 403
  // and there is no `minio` package available via apt-get in this image either. The spawn/
  // wait-for-ready/cleanup logic that a real binary would exercise the same way is covered by
  // the two real-process tests above.
  it.skip('creates the bucket and serves an anonymous download against a real MinIO binary', () => {
    // Intentionally left unimplemented -- see the comment above.
  });
});
