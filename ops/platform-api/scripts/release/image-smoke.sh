#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="$repo_root/docker-compose.release.yml"
env_file="${RELEASE_ENV_FILE:-$repo_root/.env.release}"
# The smoke has its own default project, separate from the operator default (`platform-api`, ADR-0097).
project_name="${RELEASE_PROJECT_NAME:-platform-api-smoke}"
# Operator project identities: the current default and the one before the platform rename (#1100 b). The smoke never
# uses them: its containers would collide with the operator's, and the legacy data volumes are named after them.
operator_project_names=(platform-api feedbackops-release-1060)
# Ownership marker (compose label `platform.release.owner`, see docker-compose.release.yml): the smoke only builds,
# starts or removes a project in which every container and volume is marked `smoke`.
export RELEASE_OWNER=smoke
owner_label=platform.release.owner
# The smoke owns its data: both volumes are forced here, over anything in the caller's environment or .env.release
# (the shell wins over --env-file), so startup can never mount an operator volume and `--down` (down -v) can never
# remove one. The compose file's pinned legacy volume names are for operator installs only.
export RELEASE_POSTGRES_VOLUME="${project_name}_smoke-postgres-data"
export RELEASE_MINIO_VOLUME="${project_name}_smoke-minio-data"
backend_url="http://localhost:${RELEASE_BACKEND_PORT:-3001}"
status=failed
reason=unexpected-command-failure

emit_verdict() {
  printf '{"status":"%s","reason":"%s"}\n' "$status" "$reason"
}
trap emit_verdict EXIT

compose=(
  docker compose
  --project-name "$project_name"
  --env-file "$env_file"
  -f "$compose_file"
)

fail() {
  reason="$1"
  exit 1
}

for operator_project in "${operator_project_names[@]}"; do
  if [[ "$project_name" == "$operator_project" ]]; then
    fail "smoke-project-is-an-operator-project-use-another-RELEASE_PROJECT_NAME"
  fi
done

# Fails closed, before any build/up/run/down: lists the project's containers (running or not) and volumes and refuses
# if any is not marked as smoke-owned (or the listing itself fails). A clean project and the smoke's own previous stack
# pass, so the script stays repeatable.
assert_project_is_smoke_owned() {
  local kind listing line owner volume
  for kind in container volume; do
    if [[ "$kind" == container ]]; then
      listing="$(docker ps --all --filter "label=com.docker.compose.project=$project_name" \
        --format "{{.Names}}|{{.Label \"$owner_label\"}}")" || fail "ownership-check-failed"
    else
      # Also the two volumes the run will mount, by name: one that exists without our marker is not ours even if
      # it carries no compose project label.
      listing="$(docker volume ls --filter "label=com.docker.compose.project=$project_name" \
        --format "{{.Name}}|{{.Label \"$owner_label\"}}")" || fail "ownership-check-failed"
      for volume in "$RELEASE_POSTGRES_VOLUME" "$RELEASE_MINIO_VOLUME"; do
        listing+=$'\n'"$(docker volume ls --filter "name=$volume" \
          --format "{{.Name}}|{{.Label \"$owner_label\"}}" | awk -F'|' -v want="$volume" '$1 == want')" \
          || fail "ownership-check-failed"
      done
    fi
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      owner="${line#*|}"
      if [[ "$owner" != smoke ]]; then
        printf 'foreign %s in project %s: %s\n' "$kind" "$project_name" "${line%%|*}" >&2
        fail "project-holds-resources-not-owned-by-the-smoke-use-another-RELEASE_PROJECT_NAME"
      fi
    done <<<"$listing"
  done
}

# Pure identity report (no Docker, no .env.release): what a run would start and which volumes it owns.
if [[ "${1:-}" == "--print-identity" ]]; then
  [[ "$#" -eq 1 ]] || fail "usage: image-smoke.sh [--down|--print-identity]"
  printf '{"project":"%s","postgresVolume":"%s","minioVolume":"%s"}\n' \
    "$project_name" "$RELEASE_POSTGRES_VOLUME" "$RELEASE_MINIO_VOLUME" >&2
  status=passed
  reason=identity-printed
  exit 0
fi

if [[ ! -f "$env_file" ]]; then
  fail "missing-.env.release-copy-.env.release.example-first"
fi

if [[ "${1:-}" == "--down" ]]; then
  [[ "$#" -eq 1 ]] || fail "usage: image-smoke.sh [--down|--print-identity]"
  assert_project_is_smoke_owned
  "${compose[@]}" down -v >&2
  status=passed
  reason=release-project-and-owned-volumes-removed
  exit 0
fi
[[ "$#" -eq 0 ]] || fail "usage: image-smoke.sh [--down|--print-identity]"
assert_project_is_smoke_owned

"${compose[@]}" build backend migrate >&2
"${compose[@]}" up -d postgres oidc minio >&2
# Fresh volume (#1100 a): staged immutable history as the bootstrap fops_migrate, the explicit admin role/database
# rename, then the ordinary platform_migrate migration. The admin URL lives only in this one-off job container.
"${compose[@]}" run --rm -T cutover >&2 || fail "cutover-failed"
# The ordinary migration job must now be a no-op as platform_migrate, with no admin credential.
"${compose[@]}" up -d migrate >&2

migration_id="$("${compose[@]}" ps --all --quiet migrate)"
[[ -n "$migration_id" ]] || fail "migration-container-not-created"
migration_deadline=$((SECONDS + 180))
migration_state=running
migration_exit_code=
while ((SECONDS < migration_deadline)); do
  migration_state="$(docker inspect --format '{{.State.Status}}' "$migration_id")"
  if [[ "$migration_state" == exited || "$migration_state" == dead ]]; then
    migration_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$migration_id")"
    break
  fi
  sleep 2
done
[[ "$migration_state" == exited && "$migration_exit_code" == 0 ]] \
  || fail "migration-failed-or-timed-out"

"${compose[@]}" up -d minio-bootstrap backend >&2

request() {
  local path="$1"
  local accept="$2"
  local response
  response="$(curl --silent --show-error --max-time 10 \
    -H "Accept: $accept" \
    --write-out $'\n%{http_code}' \
    "$backend_url$path")" || return 1
  response_status="${response##*$'\n'}"
  response_body="${response%$'\n'*}"
}

# Bounded wait: backend readiness (database, pg_boss, storage) directly (published through the OIDC provider's network namespace).
ready_deadline=$((SECONDS + 120))
ready=
while ((SECONDS < ready_deadline)); do
  if request /health/ready application/json && [[ "$response_status" == 200 ]]; then
    ready=1
    break
  fi
  sleep 2
done
[[ -n "$ready" ]] || fail "backend-readiness-timed-out"

if ! request /vocs application/json; then
  fail "json-api-request-failed"
fi
case "$response_status" in
  401|302|303|307|308) ;;
  *) fail "json-api-did-not-return-an-unauthenticated-response" ;;
esac
[[ "$response_body" != *"<!doctype html"* && "$response_body" != *"<html"* ]] \
  || fail "json-api-returned-spa-html"

auth_login_deadline=$((SECONDS + 120))
auth_login_ok=0
while ((SECONDS < auth_login_deadline)); do
  if request /auth/login text/html && [[ "$response_status" == 302 ]]; then
    auth_login_ok=1
    break
  fi
  sleep 2
done
[[ "$auth_login_ok" -eq 1 ]] || fail "oidc-login-did-not-redirect"

if ! request /attachments/00000000-0000-4000-8000-000000000001/download text/html; then
  fail "attachment-proxy-request-failed"
fi
[[ "$response_status" == 401 ]] \
  || fail "attachment-proxy-did-not-return-an-unauthenticated-response"
[[ "$response_body" != *"<!doctype html"* && "$response_body" != *"<html"* ]] \
  || fail "attachment-proxy-returned-spa-html"

if ! request /health text/html; then
  fail "legacy-health-proxy-request-failed"
fi
[[ "$response_status" == 200 && "$response_body" == *'"status":"ok"'* ]] \
  || fail "legacy-health-was-not-json"

readiness_deadline=$((SECONDS + 120))
readiness_ok=0
while ((SECONDS < readiness_deadline)); do
  if request /health/ready text/html; then
    if [[ "$response_status" == 200 \
      && "$response_body" == *'"database":"ok"'* \
      && "$response_body" == *'"pg_boss":"ok"'* \
      && "$response_body" == *'"storage":"ok"'* ]]; then
      readiness_ok=1
      break
    fi
  fi
  sleep 2
done
[[ "$readiness_ok" -eq 1 ]] || fail "readiness-failed-or-timed-out"

status=passed
reason=images-migrated-and-readiness-ok
