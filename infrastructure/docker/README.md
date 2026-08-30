# Docker images

Three multi-stage Dockerfiles, all built from the **repo root** (they need the full monorepo in
the build context to prune from) using [`turbo prune`](https://turbo.build/repo/docs/reference/prune)
to keep each image scoped to only the packages the target actually depends on, plus `pnpm` for
installs. All three run `prisma generate`, which needs normal internet access to fetch Prisma's
query-engine binaries — true for Render and GitHub Actions builds, not for network-restricted
sandboxes (see the root README's environment notes).

| Dockerfile | Builds | Selected by | Used by |
|---|---|---|---|
| [`api.Dockerfile`](./api.Dockerfile) | `services/api` | — (one target) | `render.yaml`'s `gameworld-api` service, `docker-compose.yml`'s `api` service |
| [`workers.Dockerfile`](./workers.Dockerfile) | all 6 `workers/*` packages, in one image | `WORKER` **runtime** env var (`all` or one worker name — see [`workers-entrypoint.mjs`](./workers-entrypoint.mjs)) | `render.yaml`'s single combined `gameworld-workers` service (`WORKER=all`), `docker-compose.yml`'s `workers` service |
| [`web.Dockerfile`](./web.Dockerfile) | one `apps/*` Next.js app | `APP` **build** arg (`studio`\|`marketplace`\|`player`\|`creator`\|`admin`\|`developer-portal`) | `render.yaml`'s 6 web services, one `docker build --build-arg APP=...` each |

## Build examples

```bash
# from the repo root
docker build -f infrastructure/docker/api.Dockerfile -t gameworld-api .

docker build -f infrastructure/docker/workers.Dockerfile -t gameworld-workers .
docker run -e WORKER=asset-processing -e DATABASE_URL=... -e REDIS_URL=... gameworld-workers
docker run -e WORKER=all              -e DATABASE_URL=... -e REDIS_URL=... gameworld-workers

docker build -f infrastructure/docker/web.Dockerfile \
  --build-arg APP=studio --build-arg APP_PORT=3000 \
  --build-arg NEXT_PUBLIC_API_URL=https://api.sonicgameworld.com \
  --build-arg NEXT_PUBLIC_WS_URL=wss://api.sonicgameworld.com \
  --build-arg NEXT_PUBLIC_CDN_BASE_URL=https://cdn.sonicgameworld.com \
  -t gameworld-studio .
```

## Design notes

* **`WORKER` is a runtime env var, not a build arg** — one image serves either the combined
  background service (`WORKER=all`, every worker as its own child process, per
  `workers-entrypoint.mjs`) or a single dedicated worker, with no rebuild needed to switch. This
  matches the assignment's "one combined workers background service with `WORKER=all`" shape
  while still letting you split any one worker (e.g. `asset-processing`, the heaviest queue) out
  to its own scaled service later just by deploying the same image with a different `WORKER`
  value — no new Dockerfile.
* **`APP` is a build arg, not a runtime env var** — Next.js apps need `NEXT_PUBLIC_*` values baked
  into the client bundle at `next build` time, so each app is genuinely a separate image build,
  not a runtime switch inside one image.
* **No `output: 'standalone'`** — none of the 6 Next.js apps set this in their `next.config.mjs`
  (owned by `apps/*`, outside this directory's scope), so `web.Dockerfile` ships full production
  `node_modules` rather than Next's standalone server bundle. Functionally correct, just a larger
  image than necessary; adding `output: 'standalone'` to each app later is a drop-in size
  optimization that requires no Dockerfile change beyond swapping the final `CMD` for
  `node apps/$GAMEWORLD_APP/server.js`.
* **Non-root runtime user** in every image (`gameworld:gameworld`, uid/gid 1001) per standard
  container hardening practice.
* **`services/api` and every `workers/*` package each carry their own `@prisma/client` dependency**
  pointed at `services/api/prisma/schema.prisma` via their own `package.json`'s `"prisma.schema"`
  field — `api.Dockerfile` runs `prisma:generate` once for `@sonic-gameworld/api`;
  `workers.Dockerfile` runs it once per worker via `pnpm -r --if-present run prisma:generate`
  across the pruned graph, so every worker's own generated client is present before `turbo build`.
