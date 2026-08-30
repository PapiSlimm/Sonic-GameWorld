# Sonic GameWorld web app image — one Dockerfile, six Next.js apps, selected by the APP build arg
# (studio | marketplace | player | creator | admin | developer-portal).
#
# Build from the REPO ROOT:
#   docker build -f infrastructure/docker/web.Dockerfile \
#     --build-arg APP=studio --build-arg APP_PORT=3000 \
#     -t gameworld-studio .
#
# None of the six apps currently set `output: 'standalone'` in next.config.mjs, so this image
# ships full production node_modules (via `pnpm install --prod` on the pruned graph) rather than
# a standalone server bundle. Adding `output: 'standalone'` to each app's next.config.mjs (a small
# change owned by the apps/* packages, not this Dockerfile) would let this image switch to
# Next.js's standalone runner and shrink meaningfully — worth doing once traffic/cost justifies it.
syntax=docker/dockerfile:1

FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# ---- pruner ----
FROM base AS pruner
ARG APP
RUN test -n "$APP" || (echo "APP build arg is required, e.g. --build-arg APP=studio" && exit 1)
COPY . .
RUN pnpm dlx turbo@2.3.3 prune "@sonic-gameworld/${APP}" --docker

# ---- installer: install, build ----
FROM base AS installer
ARG APP
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY .npmrc pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY turbo.json tsconfig.base.json ./

# Next.js reads NEXT_PUBLIC_* at build time and bakes them into the client bundle — pass through
# whatever the deploy platform's build environment provides (render.yaml sets these per service).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_CDN_BASE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_CDN_BASE_URL=${NEXT_PUBLIC_CDN_BASE_URL}

RUN pnpm turbo run build --filter="@sonic-gameworld/${APP}..."
RUN pnpm install --prod --frozen-lockfile

# ---- runner ----
FROM node:20-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate \
    && groupadd --system --gid 1001 gameworld && useradd --system --uid 1001 --gid gameworld gameworld
WORKDIR /app
ARG APP
ENV GAMEWORLD_APP=${APP}
COPY --from=installer --chown=gameworld:gameworld /app .

USER gameworld
ENV NODE_ENV=production
ARG APP_PORT=3000
ENV APP_PORT=${APP_PORT}
EXPOSE 3000
# Most PaaS targets (Render included) inject $PORT at runtime and expect the process to bind to
# it; fall back to APP_PORT (the app's canonical dev port, per CONTRACTS.md §12) for `docker run`
# without an orchestrator setting PORT. Runs `next start` directly (via `pnpm --filter ... exec`,
# so pnpm's workspace resolution finds the app's own `next` binary) rather than `pnpm start`,
# which hardcodes each app's dev-time `-p` flag and would ignore $PORT.
CMD ["sh", "-c", "pnpm --filter \"@sonic-gameworld/${GAMEWORLD_APP}\" exec next start -p ${PORT:-$APP_PORT} -H 0.0.0.0"]
