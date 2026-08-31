// Embedded MinIO for the offline Windows desktop build. This replaces the `minio` +
// `minio-init` services from the root docker-compose.yml: we spawn a real MinIO server binary
// as a child process (the binary itself is fetched/bundled by the Electron packaging step, not
// by this package -- see the README) and then use the MinIO JS SDK to reproduce exactly what
// `minio-init`'s `mc` commands did: create the `gameworld-assets` bucket and open it for
// anonymous downloads.
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import * as Minio from 'minio';

/** Mirrors the `minio` service's MINIO_ROOT_USER / MINIO_ROOT_PASSWORD in the root
 * docker-compose.yml, so desktop mode behaves the same as `docker compose up`. */
const MINIO_ROOT_USER = 'minio';
const MINIO_ROOT_PASSWORD = 'minio12345';

/** Matches the bucket the `minio-init` service creates via `mc mb -p local/gameworld-assets`. */
const BUCKET = 'gameworld-assets';

const DEFAULT_PORT = 9000;
const DEFAULT_CONSOLE_PORT = 9001;

/** How long to wait for the MinIO process to report itself healthy before giving up. */
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_INTERVAL_MS = 200;

export interface StartEmbeddedMinioOptions {
  /** Directory MinIO stores objects in. Created if missing. Persists across restarts. */
  dataDir: string;
  /** Path to a MinIO server executable (`minio` or `minio.exe`). Sourcing/bundling the actual
   * binary per-platform is the Electron packaging step's job -- this function only spawns
   * whatever path it is given. */
  binaryPath: string;
  /** S3 API port. Defaults to 9000 (matches docker-compose's `minio` service). */
  port?: number;
  /** Web console port. Defaults to 9001. */
  consolePort?: number;
}

export interface EmbeddedMinioHandle {
  /** `http://127.0.0.1:<port>`, ready to hand to the S3 client config used elsewhere in the app. */
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  /** Sends SIGTERM and waits for exit, escalating to SIGKILL after a grace period. */
  stop: () => Promise<void>;
}

/** Pure argument-construction, split out so it can be unit-tested without spawning anything. */
export function buildMinioServerArgs(opts: { dataDir: string; port: number; consolePort: number }): string[] {
  return ['server', opts.dataDir, '--address', `127.0.0.1:${opts.port}`, '--console-address', `127.0.0.1:${opts.consolePort}`];
}

/**
 * The exact S3 bucket policy that `mc anonymous set download <bucket>` applies: anonymous
 * (unauthenticated) principals may locate/list the bucket and GET objects out of it, but cannot
 * write. This is what the root docker-compose.yml's `minio-init` service sets on
 * `gameworld-assets`, so desktop mode serves publicly-readable game assets the same way.
 */
export function anonymousDownloadBucketPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetBucketLocation'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:ListBucket'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

/** The subset of the `minio` SDK's `Client` surface that bucket setup needs. Narrowing to this
 * interface (rather than depending on `Minio.Client` directly) lets `ensureAnonymousDownloadBucket`
 * be unit-tested against a plain in-memory double instead of a live server. */
export interface MinioBucketClient {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
  setBucketPolicy(bucket: string, policy: string): Promise<void>;
}

/**
 * Reproduces exactly what the root docker-compose.yml's `minio-init` service does via `mc`:
 * create the bucket if it doesn't already exist, then (idempotently) open it for anonymous
 * downloads. Safe to call every time the app starts, against a bucket created on a previous run.
 */
export async function ensureAnonymousDownloadBucket(client: MinioBucketClient, bucket: string): Promise<void> {
  const exists = await client.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await client.makeBucket(bucket);
  }
  await client.setBucketPolicy(bucket, anonymousDownloadBucketPolicy(bucket));
}

/** Polls MinIO's own liveness endpoint until it responds (or `signalEarlyExit` rejects first,
 * so a MinIO process that crashes on startup fails fast instead of waiting out the full
 * timeout). */
async function waitUntilHealthy(endpoint: string, signalEarlyExit: Promise<never>): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastErr: unknown;
  const poll = (async () => {
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${endpoint}/minio/health/live`);
        if (res.ok) return;
        lastErr = new Error(`unexpected status ${res.status} from /minio/health/live`);
      } catch (err) {
        lastErr = err;
      }
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
    }
    throw new Error(`Timed out waiting for MinIO to become healthy at ${endpoint}: ${String(lastErr)}`);
  })();

  await Promise.race([poll, signalEarlyExit]);
}

export async function startEmbeddedMinio(opts: StartEmbeddedMinioOptions): Promise<EmbeddedMinioHandle> {
  const port = opts.port ?? DEFAULT_PORT;
  const consolePort = opts.consolePort ?? DEFAULT_CONSOLE_PORT;

  await fs.mkdir(opts.dataDir, { recursive: true });

  const child = spawn(opts.binaryPath, buildMinioServerArgs({ dataDir: opts.dataDir, port, consolePort }), {
    env: { ...process.env, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Keep a bounded tail of stderr so a startup failure's error message is actionable instead of
  // just "exited with code 1".
  let stderrTail = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-4000);
  });
  child.on('error', (err) => {
    stderrTail += `\n[spawn error] ${err.message}`;
  });

  const endpoint = `http://127.0.0.1:${port}`;
  const earlyExit = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Error(`MinIO exited before becoming ready (code ${code ?? 'null'}, signal ${signal ?? 'null'}). stderr: ${stderrTail}`));
    });
  });
  // An unhandled rejection would otherwise surface once `stop()` later detaches this listener's
  // consumer; suppress it here since `waitUntilHealthy` below is the one real consumer.
  earlyExit.catch(() => undefined);

  async function stop(): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const forceKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
      child.once('exit', () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }

  // If anything from here on fails -- the health check times out, or bucket setup errors out --
  // we must not leave an orphaned MinIO process behind for the rest of the app's lifetime, since
  // the caller never receives a handle (and therefore no way to stop it) when this function
  // throws.
  try {
    await waitUntilHealthy(endpoint, earlyExit);

    const client = new Minio.Client({
      endPoint: '127.0.0.1',
      port,
      useSSL: false,
      accessKey: MINIO_ROOT_USER,
      secretKey: MINIO_ROOT_PASSWORD,
    });

    await ensureAnonymousDownloadBucket(client, BUCKET);
  } catch (err) {
    await stop().catch(() => undefined);
    throw err;
  }

  return {
    endpoint,
    accessKey: MINIO_ROOT_USER,
    secretKey: MINIO_ROOT_PASSWORD,
    bucket: BUCKET,
    stop,
  };
}
