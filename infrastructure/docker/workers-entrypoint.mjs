#!/usr/bin/env node
// Entrypoint for the combined workers image (infrastructure/docker/workers.Dockerfile).
//
// Each worker package (workers/*) only starts its BullMQ Worker loop when its dist/index.js is
// run as the process entrypoint (`import.meta.url === file://${process.argv[1]}`), so — unlike a
// typical "import and call a start() function" combined runner — this script spawns each worker
// as its own child process rather than importing them in-process. WORKER selects which:
//
//   WORKER=asset-processing   node infrastructure/docker/workers-entrypoint.mjs   # one worker
//   WORKER=all                node infrastructure/docker/workers-entrypoint.mjs   # every worker, one process each
//
// This is the script infrastructure/docker/workers.Dockerfile's CMD runs; render.yaml's combined
// workers background service sets WORKER=all.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// This script is copied to /app/infrastructure/docker/ in the image; workers live at /app/workers/*.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const WORKERS = ['ai-generation', 'analytics', 'asset-processing', 'builds', 'moderation', 'thumbnails'];

function distEntry(name) {
  return path.join(REPO_ROOT, 'workers', name, 'dist', 'index.js');
}

function resolveSelection(worker) {
  if (!worker || worker === 'all') return WORKERS;
  if (!WORKERS.includes(worker)) {
    console.error(`Unknown WORKER "${worker}". Expected one of: all, ${WORKERS.join(', ')}`);
    process.exit(1);
  }
  return [worker];
}

const selection = resolveSelection(process.env.WORKER);

for (const name of selection) {
  const entry = distEntry(name);
  if (!existsSync(entry)) {
    console.error(`Worker "${name}" has no build output at ${entry} — was "turbo run build" run for it?`);
    process.exit(1);
  }
}

console.log(`[workers-entrypoint] starting: ${selection.join(', ')}`);

// BullMQ workers have no HTTP surface of their own, but a hosting platform modeled around
// request-driven services (Cloud Run's "Service" resource in infrastructure/terraform — Cloud
// Run Jobs run to completion, which doesn't fit a long-lived queue consumer) still expects the
// container to accept HTTP and pass a health check on $PORT. This tiny server exists solely to
// satisfy that: it does not front the workers in any functional way. Render's `worker` (Background
// Worker) service type has no such requirement, so this is a no-op there beyond one extra open
// port. Liveness is "the entrypoint process is alive"; readiness of the underlying queue
// connections is intentionally out of scope here — see each worker's own BullMQ `Worker` events
// (logged via pino) for that.
let allChildrenExited = false;
const server = createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(allChildrenExited ? 503 : 200, { 'Content-Type': 'text/plain' });
    res.end(allChildrenExited ? 'workers exited\n' : 'ok\n');
    return;
  }
  res.writeHead(404);
  res.end();
});
const healthPort = Number(process.env.PORT ?? 8080);
server.listen(healthPort, () => {
  console.log(`[workers-entrypoint] health endpoint listening on :${healthPort}/healthz`);
});

const children = selection.map((name) => {
  const child = spawn(process.execPath, [distEntry(name)], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    console.log(`[workers-entrypoint] worker "${name}" exited (code=${code}, signal=${signal})`);
    // In a single-worker container, exit with the child's code. In an "all" container, one
    // worker's own bug shouldn't be silently invisible — exit the whole process non-zero so the
    // platform's health check / restart policy notices, rather than limping along on 5 of 6 queues.
    process.exitCode = code ?? 1;
    shutdown('CHILD_EXIT');
  });
  return { name, child };
});

let shuttingDown = false;
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  allChildrenExited = true;
  console.log(`[workers-entrypoint] shutting down (${reason})`);
  for (const { name, child } of children) {
    if (!child.killed) {
      console.log(`[workers-entrypoint] sending SIGTERM to "${name}"`);
      child.kill('SIGTERM');
    }
  }
  server.close();
  // Give each worker's own graceful-shutdown handler (BullMQ `worker.close()`, event bus
  // `close()`, etc. — see workers/*/src/index.ts) a window to finish in-flight jobs cleanly.
  setTimeout(() => process.exit(process.exitCode ?? 0), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
