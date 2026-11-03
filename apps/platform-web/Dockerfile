# Production web edge image (#1266 b1d): nginx serving the PREBUILT real web bundle and proxying /api and /auth to the
# backend. It packages apps/platform-web/dist; it does not build the web (the workspace closure is most of the repo).
# Build only through ops/platform-api/scripts/release/build-web-image.sh, which runs `build:real-prod` first. The build
# context is the repo root; apps/platform-web/Dockerfile.dockerignore limits it to dist and the edge config.
FROM nginx:1.27.5-alpine

COPY apps/platform-web/dist /usr/share/nginx/html
COPY ops/platform-api/edge/nginx.conf /etc/nginx/conf.d/default.conf

# Fail the build when the bundle is missing or empty rather than shipping an edge that serves 404 for the SPA.
RUN test -s /usr/share/nginx/html/index.html

EXPOSE 80
