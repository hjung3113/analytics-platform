#!/usr/bin/env bash
# Production stack status (#1606): read-only report of which first-run steps are done, with the command for each
# missing one. Usage: stack-status.sh [env-file] (default .env.production); run from ops/platform-api in Bash.
# Optional: PROJECT (compose project, default platform-api). It changes nothing, makes no network call and prints no
# secret: it reads WORKSPACE_ID (a UUID) from the env file and asks Docker and Postgres for states and counts only.
# Exit 0 when every step is done, 1 when a step is missing, 2 on usage or when Docker is unreachable. Order and reasons: docs/release/oidc-and-images.md.
set -u

cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 2
env_file="${1:-.env.production}"
project="${PROJECT:-platform-api}"
if [ ! -f "$env_file" ]; then
  echo "usage: stack-status.sh [env-file]   ($env_file not found; cp .env.production.example .env.production first)" >&2
  exit 2
fi
P="docker compose -p $project --env-file $env_file -f docker-compose.production.yml"
# Hints print the literal text $P (define it once, see docs/release/oidc-and-images.md "Production stack").
L='$P'
printf 'P="%s"\n\n' "$P"
todo=0
ok()   { printf '[ok]   %s\n' "$1"; }
need() { printf '[todo] %s\n         -> %s\n' "$1" "$2"; todo=1; }
note() { printf '[note] %s\n' "$1"; }

# 1. env file
if pre="$(bash scripts/release/production-preflight.sh "$env_file" 2>&1)"; then
  ok "env file passes production-preflight"
else
  need "env file fails production-preflight: $(printf '%s' "$pre" | tr '\n' ' ' | cut -c1-300)" \
    "fix $env_file, then bash scripts/release/production-preflight.sh $env_file"
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon not reachable; start Docker, then rerun" >&2
  exit 2
fi

# 2. images (compose never pulls or builds the web image)
for image in platform-release-backend:local platform-release-migrate:local platform-release-web:local; do
  if docker image inspect "$image" >/dev/null 2>&1; then ok "image $image exists"; else
    case "$image" in
      *web*) need "image $image is missing (edge cannot start)" "bash scripts/release/build-web-image.sh" ;;
      *)     need "image $image is missing" "$L build" ;;
    esac
  fi
done

# MinIO is not built here and no registry serves it: it must be loaded from a `docker save` tar (#1617). compose has
# pull_policy never for it, so a missing image stops `up`; say so here with the exact command.
minio_image="$(sed -n 's#^ *image: *\(minio/minio:[^ ]*\).*#\1#p' docker-compose.production.yml | head -1)"
if [ -z "$minio_image" ]; then
  need "could not read the MinIO image tag from docker-compose.production.yml" "check the minio service in docker-compose.production.yml"
elif docker image inspect "$minio_image" >/dev/null 2>&1; then
  ok "image $minio_image exists ($(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$minio_image" 2>/dev/null))"
else
  need "image $minio_image is missing (minio and, through minio-bootstrap, the backend cannot start; no registry is used)" \
    "docker load -i <path>/minio-image.tar   (make the tar with 'docker save $minio_image -o minio-image.tar' on a machine of the same CPU architecture, see docs/release/run-guide.md «MinIO image»)"
fi

# 3. services
services="$($P ps -a --format '{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}' 2>/dev/null)" || services=""
if [ -z "$services" ] && ! $P config -q >/dev/null 2>&1; then
  note "compose cannot read $env_file (a required variable is empty); service states below are unknown, fix the env file first"
fi
svc() { printf '%s\n' "$services" | awk -F'|' -v s="$1" '$1==s {print; exit}'; }
state_of() { svc "$1" | cut -d'|' -f2; }
health_of() { svc "$1" | cut -d'|' -f3; }
exit_of() { svc "$1" | cut -d'|' -f4; }

if [ "$(state_of postgres)" = running ]; then ok "postgres is running"; else
  need "postgres is not running (new volume: run set-role-passwords and cutover first)" \
    "$L run --rm set-role-passwords && $L run --rm cutover && $L up -d"
fi

# 4. MinIO and bucket (minio-bootstrap creates the bucket only when missing; the backend waits for it)
if [ "$(state_of minio)" = running ] && [ "$(health_of minio)" = healthy ]; then ok "minio is running and healthy"; else
  need "minio is not running/healthy (attachments fail without it)" "$L up -d"
fi
if [ "$(state_of minio-bootstrap)" = exited ] && [ "$(exit_of minio-bootstrap)" = 0 ]; then
  ok "bucket provisioning (minio-bootstrap) finished with exit 0"
else
  need "bucket provisioning (minio-bootstrap) has not finished with exit 0" "$L up -d   # then: $L logs minio-bootstrap"
fi

# 5. migration job and backend
if [ "$(state_of migrate)" = exited ] && [ "$(exit_of migrate)" = 0 ]; then ok "migrate job finished with exit 0"; else
  need "migrate job has not finished with exit 0" "$L up -d   # then: $L logs migrate"
fi
if [ "$(state_of backend)" = running ] && [ "$(health_of backend)" = healthy ]; then ok "backend is running and ready"; else
  need "backend is not running/healthy" "$L up -d   # then: $L logs backend"
fi
if [ "$(state_of edge)" = running ]; then ok "edge is running"; else
  need "edge is not running" "bash scripts/release/build-web-image.sh && $L up -d"
fi

# 6. database steps (counts only)
ws="$(grep -E '^WORKSPACE_ID=' "$env_file" | head -1 | cut -d= -f2- | sed 's/[[:space:]]#.*$//' | tr -d "\"' ")"
if [ "$(state_of postgres)" = running ] && printf '%s' "$ws" | grep -Eq '^[0-9a-fA-F-]{36}$'; then
  q() { $P exec -T postgres psql -U postgres -d platform -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
  has_ws="$(q "select count(*) from core.workspaces where id = '$ws'")"
  if [ "$has_ws" = 1 ]; then ok "workspace row exists (bootstrap done)"; else
    need "workspace row is missing (bootstrap not run, or migrate/cutover not done)" "$L --profile bootstrap run --rm bootstrap"
  fi
  if [ "$has_ws" = 1 ]; then
    sys="$(q "select count(*) from core.actors where workspace_id = '$ws' and external_id = 'system'")"
    if [ "$sys" = 1 ]; then ok "system actor exists"; else
      need "system actor is missing" "$L --profile bootstrap run --rm bootstrap && $L restart backend"
    fi
    people="$(q "select count(*) from core.actors where workspace_id = '$ws' and actor_type <> 'system'")"
    admins="$(q "select count(*) from core.actors where workspace_id = '$ws' and actor_type <> 'system' and role_level = 'admin'")"
    if [ "${admins:-0}" -ge 1 ] 2>/dev/null; then ok "at least one admin exists"; else
      if [ "${people:-0}" -ge 1 ] 2>/dev/null; then
        need "no admin yet; ${people} person(s) have logged in" \
          "$L --profile admin run --rm set-actor-role --external-id <idp-sub> --role admin --reason \"first admin\""
      else
        need "no admin yet and nobody has logged in once" "the future admin signs in through the platform host, then run set-actor-role (docs/release/first-admin-bootstrap.md)"
      fi
    fi
  fi
else
  note "database steps skipped (postgres not running, or WORKSPACE_ID is not a UUID)"
fi

note "not checkable here: role passwords (set-role-passwords is safe to repeat) and whether the backend was restarted after bootstrap"
note "Admin role alone does not open menus that need Scope: real-server analysis menus stay closed until Scope grants exist (#1087)"
exit "$todo"
