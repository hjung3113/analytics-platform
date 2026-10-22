# Build context is the repository root (docker-compose.release.yml `context: ../..`): FeedbackOps is part of the root pnpm
# workspace and its lockfile, and consumes @ap/ui from packages/ui (ADR-0066, #642).
FROM node:26.7.0-bookworm-slim AS build

WORKDIR /workspace
# Node >= 25 no longer ships corepack.
RUN npm install -g pnpm@11.1.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY products/feedbackops/package.json ./products/feedbackops/package.json
COPY products/feedbackops/tsconfig.base.json ./products/feedbackops/tsconfig.base.json
COPY products/feedbackops/apps/frontend/package.json ./products/feedbackops/apps/frontend/package.json
COPY products/feedbackops/packages/shared/package.json ./products/feedbackops/packages/shared/package.json
COPY products/feedbackops/packages/ui/package.json ./products/feedbackops/packages/ui/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY tooling/eslint/package.json ./tooling/eslint/package.json
COPY tooling/tsconfig/package.json ./tooling/tsconfig/package.json
# packages/ui/tsconfig.json extends @ap/tsconfig/base.json, which vite reads when it transforms @ap/ui source.
COPY tooling/tsconfig/base.json ./tooling/tsconfig/base.json
RUN pnpm install --filter @fops/frontend... --frozen-lockfile

COPY products/feedbackops/apps/frontend ./products/feedbackops/apps/frontend
COPY products/feedbackops/packages/shared ./products/feedbackops/packages/shared
COPY products/feedbackops/packages/ui ./products/feedbackops/packages/ui
COPY packages/ui ./packages/ui
RUN pnpm --filter @fops/frontend build

# Unprivileged variant: nginx runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.27.5-alpine AS runtime
ENV BACKEND_URL=http://backend:3001 NGINX_ENVSUBST_FILTER=^BACKEND_URL$
COPY --from=build /workspace/products/feedbackops/apps/frontend/dist/ /usr/share/nginx/html/
COPY products/feedbackops/apps/frontend/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "--header", "Accept: text/html", "http://127.0.0.1:8080/index.html"]
