# Shared production-shaped stack for the offline start and rollback checks. Callers own the EXIT trap.

disposable_stack_init() {
  local temp_root
  temp_root="${TMPDIR:-/tmp}"
  scratch="$(mktemp -d "${temp_root%/}/ap-$1.XXXXXXXX")"
  project="$1-$(printf '%s' "${scratch##*.}" | tr '[:upper:]' '[:lower:]')"
  compose=(docker compose --project-name "$project" --env-file "$scratch/env"
    -f "$ops/docker-compose.production.yml" -f "$ops/docker-compose.offline-start.yml")
  project_started=0
}

disposable_stack_configure() {
  local key value
  # Export these values so a caller's production settings cannot override the disposable project configuration.
  export OFFLINE_TAG="$1" OFFLINE_TLS_DIR="$scratch" COMPOSE_PROFILES=''
  export RELEASE_OWNER="$project" RELEASE_POSTGRES_VOLUME="$project-postgres" RELEASE_MINIO_VOLUME="$project-minio"
  export MINIO_IMAGE=bitnamilegacy/minio:2024.7.16-debian-12-r0
  export EDGE_BIND=127.0.0.1 EDGE_PORT=8080
  export WORKSPACE_ID=54d0040f-7131-442a-8e58-7cdee4af2a38
  export OIDC_ISSUER_URL=https://oidc:8080/default OIDC_CLIENT_ID=offline-start
  export OIDC_REDIRECT_URI=https://offline-start.invalid/auth/callback TRUSTED_PROXY_HOPS=2
  export NOTIFICATION_EMAIL_CHANNEL=mock STORAGE_S3_BUCKET=platform-attachments
  for key in POSTGRES_PASSWORD PLATFORM_APP_DB_PASSWORD PLATFORM_MIGRATE_DB_PASSWORD OIDC_CLIENT_SECRET \
    MINIO_ROOT_PASSWORD; do
    value="$(openssl rand -hex 24)"
    export "$key=$value"
  done
  # `mc admin user svcacct add` takes an access key of 3-20 and a secret key of 8-40 characters.
  for key in MINIO_ROOT_USER STORAGE_S3_ACCESS_KEY_ID; do
    value="$(openssl rand -hex 8)"
    export "$key=$value"
  done
  STORAGE_S3_SECRET_ACCESS_KEY="$(openssl rand -hex 16)"
  export STORAGE_S3_SECRET_ACCESS_KEY
  : > "$scratch/env"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=oidc \
    -addext 'subjectAltName=DNS:oidc' -keyout "$scratch/issuer.key" -out "$scratch/issuer.pem"
  openssl pkcs12 -export -inkey "$scratch/issuer.key" -in "$scratch/issuer.pem" \
    -out "$scratch/issuer.p12" -passout pass:offline-start
  chmod a+r "$scratch/issuer.pem" "$scratch/issuer.p12"
}

disposable_stack_pull() {
  # Cache third-party images before starting the offline portion. No release image is selected by this pull.
  "${compose[@]}" pull --policy missing postgres minio oidc
}

disposable_stack_install() {
  local wait_seconds=240
  project_started=1
  "${compose[@]}" up -d --pull never --no-build --wait --wait-timeout "$wait_seconds" postgres oidc
  "${compose[@]}" run --rm -T --no-deps --pull never set-role-passwords
  "${compose[@]}" run --rm -T --no-deps --pull never cutover
  "${compose[@]}" up -d --pull never --no-build --wait --wait-timeout "$wait_seconds" edge
}

disposable_stack_ready() {
  "${compose[@]}" exec -T backend node -e \
    "fetch('http://127.0.0.1:3001/health/ready', {signal: AbortSignal.timeout(5000)}).then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
}

disposable_stack_down() {
  if [ "$project_started" = 1 ]; then
    if [ "$1" != 0 ]; then "${compose[@]}" logs --no-color --tail 80 >&2 || true; fi
    "${compose[@]}" down --volumes
  fi
}
