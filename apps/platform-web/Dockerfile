# Production web edge image (#1266 b1d): nginx serving the PREBUILT real web bundle and proxying /api and /auth to the
# backend. It packages apps/platform-web/dist; it does not build the web (the workspace closure is most of the repo).
# Build only through ops/platform-api/scripts/release/build-web-image.sh, which runs `build:real-prod` first. The build
# context is the repo root; apps/platform-web/Dockerfile.dockerignore limits it to dist and the edge config.
FROM nginx:1.27.5-alpine

COPY apps/platform-web/dist /usr/share/nginx/html
# The nginx image renders /etc/nginx/templates/*.template into conf.d at start. Only PUBLIC_ATTACHMENT_ORIGIN is
# substituted (the filter), so nginx variables such as $uri stay. The value is a CSP source list item, default 'self'.
ENV NGINX_ENVSUBST_FILTER='^PUBLIC_ATTACHMENT_ORIGIN$'
ENV PUBLIC_ATTACHMENT_ORIGIN="'self'"
COPY ops/platform-api/edge/nginx.conf /etc/nginx/templates/default.conf.template

# Fail the build when the bundle is missing or empty rather than shipping an edge that serves 404 for the SPA.
RUN test -s /usr/share/nginx/html/index.html

EXPOSE 80
