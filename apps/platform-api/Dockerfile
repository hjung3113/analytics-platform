# syntax=docker/dockerfile:1.7
# Build context is the repository root (ops/platform-api/docker-compose.release.yml `context: ../..`): the feature code is part of the root pnpm
# workspace and its lockfile (ADR-0066, #642).
FROM node:26.7.0-bookworm-slim AS build

WORKDIR /workspace
# Node >= 25 no longer ships corepack.
RUN npm install -g pnpm@11.1.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY ops/platform-api/package.json ./ops/platform-api/package.json
COPY ops/platform-api/tsconfig.base.json ./ops/platform-api/tsconfig.base.json
# Workspace closure of @ap/platform-api (`pnpm --filter @ap/platform-api... ls`, prod and dev, transitively). The filtered
# install below links every one of them, so each manifest must be in the context: contract-schemas and feature-shared
# (runtime), contracts, http-adapter, server-conformance, eslint-config and tsconfig (dev only; migrate is built FROM build).
# .dockerignore allows exactly these paths.
COPY packages/sdk/contracts/package.json ./packages/sdk/contracts/package.json
COPY packages/sdk/contract-schemas/package.json ./packages/sdk/contract-schemas/package.json
COPY packages/adapters/http-adapter/package.json ./packages/adapters/http-adapter/package.json
COPY packages/adapters/server-conformance/package.json ./packages/adapters/server-conformance/package.json
COPY packages/feature-shared/package.json ./packages/feature-shared/package.json
COPY tooling/eslint/package.json ./tooling/eslint/package.json
COPY tooling/tsconfig ./tooling/tsconfig
COPY apps/platform-api/package.json ./apps/platform-api/package.json
RUN pnpm install --filter @ap/platform-api... --frozen-lockfile

# Sources only for what the build reads: contract-schemas (emits dist, extends @ap/tsconfig), feature-shared (extends
# ops/platform-api/tsconfig.base.json) and the API itself. The dev-only packages are never imported by emitted code
# (their only user is a type-check-only test excluded from tsconfig.json), so they stay manifest-only.
COPY packages/sdk/contract-schemas ./packages/sdk/contract-schemas
COPY packages/feature-shared ./packages/feature-shared
COPY apps/platform-api ./apps/platform-api
# contract-schemas exports its built dist, so it is built before the API's tsc resolves its types.
RUN pnpm --filter @ap/contract-schemas run build \
  && pnpm --filter @ap/platform-api run build \
  && pnpm --filter @ap/feature-shared exec tsc -p tsconfig.json --noEmit false

# pnpm deploy creates an isolated production dependency tree. Shared is
# TypeScript-only in the workspace, so stage its emitted JS and point only the
# deployed copy at it; the committed workspace package remains unchanged.
# contract-schemas already exports its own dist; its dist is copied over the deployed package so the emitted exports are
# present even if deploy's file selection skipped them.
# pnpm deploy hardlinks workspace files, so overwrite with --remove-destination
# and unlink package.json before rewriting it (never edit the shared inode).
# pnpm 11 deploy needs injected workspace packages. The flag is passed here, not set in pnpm-workspace.yaml, so platform
# packages keep linking their workspace dependencies. `--legacy` would skip the lockfile and re-resolve ranges. The
# auto-animate patch belongs to the frontend only, so deploy must tolerate it being unused for this package.
RUN pnpm --filter @ap/platform-api deploy --prod --config.inject-workspace-packages=true --config.allow-unused-patches=true /deploy \
  && mkdir -p /deploy/dist /deploy/node_modules/@ap/feature-shared/dist /deploy/node_modules/@ap/contract-schemas/dist \
  && cp -a --remove-destination apps/platform-api/dist/. /deploy/dist/ \
  && cp -a --remove-destination packages/sdk/contract-schemas/dist/. /deploy/node_modules/@ap/contract-schemas/dist/ \
  && cp -a --remove-destination packages/feature-shared/dist/. /deploy/node_modules/@ap/feature-shared/dist/ \
  && node --input-type=module -e 'import { readFileSync, rmSync, writeFileSync } from "node:fs"; const path = "/deploy/node_modules/@ap/feature-shared/package.json"; const pkg = JSON.parse(readFileSync(path, "utf8")); rmSync(path); pkg.main = "./dist/index.js"; pkg.exports = { ".": "./dist/index.js", "./enums": "./dist/enums/index.js" }; writeFileSync(path, JSON.stringify(pkg, null, 2));'

FROM build AS migrate
WORKDIR /workspace/apps/platform-api
# Job-only admin cutover (#1100 a): the release `cutover` service runs this image with an admin URL that the
# backend never receives. It needs psql, the script and its target validator at the repository-relative paths
# the script resolves (/workspace/ops/platform-api/...); init.sql ships with them for operators on a bare volume.
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*
COPY ops/platform-api/paths.sh /workspace/ops/platform-api/paths.sh
COPY ops/platform-api/scripts/db/cutover-0076-platform-identity.sh ops/platform-api/scripts/db/set-role-passwords.sh ops/platform-api/scripts/db/pg-target.mjs ops/platform-api/scripts/db/init.sql /workspace/ops/platform-api/scripts/db/
COPY --chmod=755 apps/platform-api/docker-migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/migrate-entrypoint"]
# Call the binaries directly: pnpm would try to resolve itself at runtime as the node user.
CMD ["node_modules/.bin/drizzle-kit", "migrate"]

FROM node:26.7.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /deploy/ ./
# Business systems the startup sync registers (#1289 node i, ADR-0110 decision 5): the committed file, read from this path.
COPY --chown=node:node apps/platform-web/platform-systems.json ./platform-systems.json
ENV PLATFORM_SYSTEMS_FILE=/app/platform-systems.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health/live').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/index.js"]
