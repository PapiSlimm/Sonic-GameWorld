# syntax=docker/dockerfile:1
# Sonic GameWorld combined workers image — one image, all 6 BullMQ workers
# (ai-generation, analytics, asset-processing, builds, moderation, thumbnails), selected at
# runtime by the WORKER env var: a single worker name, or "all" to run every worker as its own
# child process in one container (see workers-entrypoint.mjs).
#
# Build from the REPO ROOT:
#   docker build -f infrastructure/docker/workers.Dockerfile -t gameworld-workers .

FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# sharp (thumbnails/asset-processing), @gltf-transform + meshoptimizer (asset-processing, wasm)
# and three (thumbnails, headless render stub) all need standard build tooling + OpenSSL for
# Prisma's query engine.
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- pruner: compute the minimal monorepo subset needed to build every worker together ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.3.3 prune \
      @sonic-gameworld/worker-ai-generation \
      @sonic-gameworld/worker-analytics \
      @sonic-gameworld/worker-asset-processing \
      @sonic-gameworld/worker-builds \
      @sonic-gameworld/worker-moderation \
      @sonic-gameworld/worker-thumbnails \
      --docker

# ---- installer: install the pruned dependency graph, generate Prisma (once per worker package,
# each pointed at services/api/prisma/schema.prisma via its own package.json "prisma.schema"), build ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY turbo.json tsconfig.base.json ./
COPY infrastructure/docker/workers-entrypoint.mjs ./infrastructure/docker/workers-entrypoint.mjs

# Needs internet access to fetch Prisma engine binaries — expected on Render/GitHub Actions, not
# in offline sandboxes. --if-present skips services/api (not part of this pruned graph) cleanly.
RUN pnpm -r --if-present run prisma:generate
RUN pnpm turbo run build \
      --filter=@sonic-gameworld/worker-ai-generation \
      --filter=@sonic-gameworld/worker-analytics \
      --filter=@sonic-gameworld/worker-asset-processing \
      --filter=@sonic-gameworld/worker-builds \
      --filter=@sonic-gameworld/worker-moderation \
      --filter=@sonic-gameworld/worker-thumbnails

RUN pnpm install --prod --frozen-lockfile

# ---- runner ----
FROM node:20-slim AS runner
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 gameworld \
    && useradd --system --uid 1001 --gid gameworld gameworld
WORKDIR /app
COPY --from=installer --chown=gameworld:gameworld /app .

USER gameworld
ENV NODE_ENV=production
# One of: all | ai-generation | analytics | asset-processing | builds | moderation | thumbnails
ENV WORKER=all
# workers-entrypoint.mjs opens a trivial /healthz HTTP endpoint on $PORT (default 8080) purely so
# platforms modeled around request-driven services (Cloud Run's Service resource — see
# infrastructure/terraform/cloud_run.tf) can health-check this otherwise-HTTP-less container.
# Render's `worker` service type ignores this entirely.
EXPOSE 8080
CMD ["node", "infrastructure/docker/workers-entrypoint.mjs"]
