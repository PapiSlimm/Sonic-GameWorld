# Sonic GameWorld API image (services/api) — multi-stage, turbo-pruned, pnpm-only.
#
# Build from the REPO ROOT so the full monorepo is in the build context:
#   docker build -f infrastructure/docker/api.Dockerfile -t gameworld-api .
#
# `prisma generate` runs during the build (this stage). This requires normal internet access to
# fetch Prisma's query-engine binaries from binaries.prisma.sh — true for both Render and GitHub
# Actions builds; it is NOT expected to work in network-restricted sandboxes.
syntax=docker/dockerfile:1

FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# Prisma's query engine + sharp (used by the asset pipeline types shared with services/api) need
# OpenSSL and basic build tooling present even on the slim base image.
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- pruner: compute the minimal monorepo subset needed to build @sonic-gameworld/api ----
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.3.3 prune @sonic-gameworld/api --docker

# ---- installer: install the pruned dependency graph, generate Prisma, build ----
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY turbo.json tsconfig.base.json ./

# `prisma generate` needs internet access to fetch engine binaries the first time — expected to
# work here (Render build / GitHub Actions), not in offline sandboxes.
RUN pnpm --filter @sonic-gameworld/api prisma:generate
RUN pnpm turbo run build --filter=@sonic-gameworld/api...

# Deliberately NOT pruning devDependencies here (unlike workers.Dockerfile): `prisma` is a
# devDependency of services/api, and render.yaml's preDeployCommand runs
# `services/api/node_modules/.bin/prisma migrate deploy` against this same image before cutting
# traffic over to it, so the CLI (not just the generated @prisma/client) needs to still be present
# in the final runtime image.

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
# services/api/src/config.ts reads API_PORT (NOT the platform-standard PORT — see the root
# README's cross-package notes). render.yaml sets both PORT and API_PORT to the same value so the
# service is correct however Render's Docker port-detection resolves it; for a bare `docker run`
# with neither set, API_PORT's own default (4000) applies.
EXPOSE 4000
CMD ["node", "services/api/dist/index.js"]
