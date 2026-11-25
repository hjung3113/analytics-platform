#!/usr/bin/env bash
# Verify a pack-images.sh release unit on a disposable production Compose stack.
# Usage: offline-start-check.sh --unit <dir> --tag <tag>
# Needs Docker 28+, Compose with !reset and --wait, and OpenSSL.
# The three release tags are removed without force, then restored from the archives.
set -Eeuo pipefail

die() { echo "offline-start-check: $1" >&2; exit "${2:-1}"; }
unit=''
tag=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --unit|--tag)
      [[ -n "${2:-}" && "$2" != --* ]] || die "$1 requires a value" 2
      if [ "$1" = --unit ]; then unit="$2"; else tag="$2"; fi
      shift 2
      ;;
    -h|--help) sed -n '2,5s/^# //p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" 2 ;;
  esac
done
[ -n "$unit" ] || die '--unit is required' 2
[ -n "$tag" ] || die '--tag is required' 2
[[ "$tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] && [ "$tag" != local ] || die "invalid release tag '$tag'" 2
unit="$(cd -- "$unit" && pwd)" || die 'cannot open the release unit'
[ -f "$unit/SHA256SUMS" ] || die 'missing SHA256SUMS'

prefix=platform-release
names=(backend migrate web)
archives=()
for name in "${names[@]}"; do archives+=("$prefix-$name-$tag.tar.gz"); done
sboms=()
for name in "${names[@]}"; do sboms+=("$prefix-$name-$tag.cdx.json"); done
# sha256sum alone succeeds on a manifest with a missing row. Require exactly the three archives we will load and their
# three SBOMs (pack-images.sh, #2963).
awk -v files="${archives[*]} ${sboms[*]}" '
  BEGIN { n = split(files, want, " ") }
  { if (NF != 2 || $1 !~ /^[0-9a-fA-F]+$/ || length($1) != 64 || $0 != $1 "  " $2) exit 1
    seen[$2]++ }
  END { if (NR != n) exit 1; for (i = 1; i <= n; i++) if (seen[want[i]] != 1) exit 1 }
' "$unit/SHA256SUMS" || die 'SHA256SUMS must list exactly the three archives and three SBOMs for the requested tag'
if command -v sha256sum >/dev/null 2>&1; then sum=(sha256sum); else sum=(shasum -a 256); fi
(cd -- "$unit" && "${sum[@]}" -c SHA256SUMS) || die "SHA256SUMS check failed in $unit"

command -v docker >/dev/null 2>&1 || die 'docker is required' 2
ops="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
temp_root="${TMPDIR:-/tmp}"
scratch="$(mktemp -d "${temp_root%/}/ap-offline-start.XXXXXXXX")"
project="offline-start-$(printf '%s' "${scratch##*.}" | tr '[:upper:]' '[:lower:]')"
compose=(docker compose --project-name "$project" --env-file "$scratch/env"
  -f "$ops/docker-compose.production.yml" -f "$ops/docker-compose.offline-start.yml")
project_started=0

cleanup() {
  local status=$?
  if [ "$project_started" = 1 ]; then
    if [ "$status" != 0 ]; then "${compose[@]}" logs --no-color --tail 80 >&2 || true; fi
    "${compose[@]}" down --volumes || { if [ "$status" = 0 ]; then status=1; fi; }
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Export these values so a caller's production settings cannot override the disposable project configuration.
export OFFLINE_TAG="$tag" OFFLINE_TLS_DIR="$scratch" COMPOSE_PROFILES=''
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

# Cache third-party images before starting the offline portion. No release image is selected by this pull.
"${compose[@]}" pull --policy missing postgres minio oidc

for name in "${names[@]}"; do
  image="$prefix-$name:$tag"
  existing="$(docker image ls --format '{{.Repository}}:{{.Tag}}' --filter "reference=$image")"
  if [ -n "$existing" ]; then docker image rm --no-prune "$image"; fi
done
for archive in "${archives[@]}"; do
  docker load --platform linux/amd64 --input "$unit/$archive"
done
for name in "${names[@]}"; do
  image="$prefix-$name:$tag"
  arch="$(docker image inspect --platform linux/amd64 --format '{{.Os}}/{{.Architecture}}' "$image")" \
    && [ "$arch" = linux/amd64 ] || die "the unit did not restore $image for linux/amd64"
done

wait_seconds=240
project_started=1
"${compose[@]}" up -d --pull never --no-build --wait --wait-timeout "$wait_seconds" postgres oidc
"${compose[@]}" run --rm -T --no-deps --pull never set-role-passwords
"${compose[@]}" run --rm -T --no-deps --pull never cutover
"${compose[@]}" up -d --pull never --no-build --wait --wait-timeout "$wait_seconds" edge
"${compose[@]}" exec -T backend node -e \
  "fetch('http://127.0.0.1:3001/health/ready', {signal: AbortSignal.timeout(5000)}).then((r) => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"
echo 'offline-start-check: GET /health/ready returned 200'
