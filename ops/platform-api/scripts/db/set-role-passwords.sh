#!/usr/bin/env bash
#
# Set the passwords of the two login roles from the environment (#1266 b1c, SEC-03/OPS-03).
#
# ADMIN-ONLY, JOB-ONLY. init.sql creates the login roles with the dev/CI literals (platform_app / platform_migrate);
# production never keeps them: this script runs before any login-role use and again for every rotation. It connects
# as the postgres superuser and runs ALTER ROLE ... PASSWORD on the roles that exist:
#
#   platform_app, platform_migrate    existing installs and everything after the 0076 cutover
#   fops_app, fops_migrate            a fresh volume before the cutover (init.sql names, renamed in place later)
#
# Each of app and migrate must exist under at least one of the two names; if neither exists the script fails and
# changes nothing. Idempotent: running it again sets the same passwords again. It does NOT stop sessions; for a
# rotation stop the backend and jobs first (docs: release/oidc-and-images.md "DB role passwords").
#
# Environment (all read from the environment only, never from arguments, never printed):
#   ROLE_PASSWORDS_ADMIN_URL      required. postgres://<superuser>@host:port/postgres, WITHOUT a password in the URL
#                                 (the password goes in PGPASSWORD, so it is never in a process argument).
#   PGPASSWORD                    the superuser password.
#   PLATFORM_APP_DB_PASSWORD      required. New password of platform_app / fops_app.
#   PLATFORM_MIGRATE_DB_PASSWORD  required. New password of platform_migrate / fops_migrate. Must differ from the app one.
#   Both passwords must match ^[A-Za-z0-9_-]{24,}$ so they can sit unencoded in postgresql://user:pass@host URLs
#   (generate with: openssl rand -hex 24).
#
# The passwords reach the server through psql variables imported with \getenv and quoted with :'name', so no secret
# is in an argument and no shell or SQL injection is possible. The effective target is resolved and validated BEFORE
# the first connection (scripts/db/pg-target.mjs), the PG* target variables are removed from the environment, and
# ports 5434 (the developer database) and 5439 (the shared verify cluster) are refused: ALTER ROLE is cluster-wide.
# Afterwards each role is logged into with its new password (SELECT current_user).
#
# Usage: set-role-passwords.sh

set -euo pipefail
set +x

OPS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_TOOL="$OPS_ROOT/scripts/db/pg-target.mjs"
LOG_TAG='set-role-passwords'
PASSWORD_RE='^[A-Za-z0-9_-]{24,}$'

log() { printf '[%s] %s\n' "$LOG_TAG" "$*" >&2; }
die() { printf '[%s] REFUSING: %s\n' "$LOG_TAG" "$1" >&2; exit "${2:-1}"; }

[ "$#" -eq 0 ] || die 'usage: set-role-passwords.sh (no arguments; configuration is read from the environment)' 2
command -v psql >/dev/null 2>&1 || die 'psql is required (version 15 or newer, for \getenv)'
command -v node >/dev/null 2>&1 || die 'node is required'

# 1. Target: resolved and refused before anything connects.
raw="${ROLE_PASSWORDS_ADMIN_URL:-}"
[ -n "$raw" ] || die 'set ROLE_PASSWORDS_ADMIN_URL to an admin connection to the postgres database (see the header of this script)' 2
canon="$(PG_TARGET_URL="$raw" node "$TARGET_TOOL" canonical PG_TARGET_URL 2>&1)" || die "ROLE_PASSWORDS_ADMIN_URL: $canon" 2
part() { PG_TARGET_URL="$canon" node "$TARGET_TOOL" part PG_TARGET_URL "$1"; }
port="$(part port)"
admin_user="$(part user)"
admin_db="$(part db)"
case "$port" in
  5434) die 'port 5434 is the local development database; ALTER ROLE is cluster-wide and would break it' 2 ;;
  5439) die 'port 5439 is the shared verify cluster; ALTER ROLE is cluster-wide and would break every worktree' 2 ;;
esac
[ "$admin_db" = postgres ] || die "the admin connection must use the postgres database, not $admin_db" 2
case "$admin_user" in
  fops_* | platform_*) die 'the admin connection must not use one of the application roles' 2 ;;
esac
if [ "$(PG_TARGET_URL="$canon" node -e 'process.stdout.write(new URL(process.env.PG_TARGET_URL).password)')" != '' ]; then
  die 'ROLE_PASSWORDS_ADMIN_URL must not contain a password (it would be a process argument); pass it in PGPASSWORD' 2
fi
# psql and the verification logins must connect where the checks above looked.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE PGOPTIONS PGPASSFILE

# 2. Passwords: present, well-formed, different.
[ -n "${PLATFORM_APP_DB_PASSWORD:-}" ] || die 'PLATFORM_APP_DB_PASSWORD is not set' 2
[ -n "${PLATFORM_MIGRATE_DB_PASSWORD:-}" ] || die 'PLATFORM_MIGRATE_DB_PASSWORD is not set' 2
[[ "$PLATFORM_APP_DB_PASSWORD" =~ $PASSWORD_RE ]] || die 'PLATFORM_APP_DB_PASSWORD must match ^[A-Za-z0-9_-]{24,}$ (openssl rand -hex 24)' 2
[[ "$PLATFORM_MIGRATE_DB_PASSWORD" =~ $PASSWORD_RE ]] || die 'PLATFORM_MIGRATE_DB_PASSWORD must match ^[A-Za-z0-9_-]{24,}$ (openssl rand -hex 24)' 2
[ "$PLATFORM_APP_DB_PASSWORD" != "$PLATFORM_MIGRATE_DB_PASSWORD" ] || die 'the app and migrate passwords must differ' 2
export PLATFORM_APP_DB_PASSWORD PLATFORM_MIGRATE_DB_PASSWORD

# psql output could echo a statement; print only the ERROR lines, with both passwords masked.
scrub() {
  local text="$1" line
  while IFS= read -r line; do
    case "$line" in ERROR:*|FATAL:*|psql:*)
      line="${line//$PLATFORM_APP_DB_PASSWORD/***}"
      printf '[%s]   %s\n' "$LOG_TAG" "${line//$PLATFORM_MIGRATE_DB_PASSWORD/***}" >&2 ;;
    esac
  done <<<"$text"
}

# 3. Which roles exist (names come from this fixed list only).
found="$(psql -X -v ON_ERROR_STOP=1 -tA "$canon" \
  -c "select rolname from pg_roles where rolcanlogin and rolname in ('platform_app','platform_migrate','fops_app','fops_migrate') order by rolname")" \
  || die 'could not list the login roles with the admin connection'
has() { case $'\n'"$found"$'\n' in *$'\n'"$1"$'\n'*) return 0 ;; *) return 1 ;; esac; }
app_roles=()
migrate_roles=()
for r in platform_app fops_app; do has "$r" && app_roles+=("$r"); done
for r in platform_migrate fops_migrate; do has "$r" && migrate_roles+=("$r"); done
[ "${#app_roles[@]}" -gt 0 ] || die 'neither platform_app nor fops_app exists as a login role; run scripts/db/init.sql on a fresh cluster first'
[ "${#migrate_roles[@]}" -gt 0 ] || die 'neither platform_migrate nor fops_migrate exists as a login role; run scripts/db/init.sql on a fresh cluster first'

# 4. One transaction; passwords come from the environment through \getenv, quoted by :'name'.
sql='\getenv app_pw PLATFORM_APP_DB_PASSWORD
\getenv migrate_pw PLATFORM_MIGRATE_DB_PASSWORD
BEGIN;
'
for r in "${app_roles[@]}"; do sql+="ALTER ROLE $r PASSWORD :'app_pw';"$'\n'; done
for r in "${migrate_roles[@]}"; do sql+="ALTER ROLE $r PASSWORD :'migrate_pw';"$'\n'; done
sql+='COMMIT;
'
if ! out="$(printf '%s' "$sql" | psql -X -q -v ON_ERROR_STOP=1 "$canon" 2>&1)"; then
  scrub "$out"
  die 'ALTER ROLE failed; no password was changed (single transaction)'
fi
log "set the password of: ${app_roles[*]} ${migrate_roles[*]}"

# 5. Prove each login with the new password.
login_url() { # login_url <role>
  PG_TARGET_URL="$canon" node -e '
    const u = new URL(process.env.PG_TARGET_URL);
    u.username = process.argv[1];
    u.password = "";
    process.stdout.write(u.toString());
  ' "$1"
}
verify() { # verify <role> <password>
  local who
  if ! who="$(PGPASSWORD="$2" psql -X -v ON_ERROR_STOP=1 -tA -c 'select current_user' "$(login_url "$1")" 2>&1)"; then
    scrub "$who"
    die "login as $1 with the new password failed"
  fi
  [ "$who" = "$1" ] || die "login as $1 returned an unexpected identity"
  log "verified login: $1"
}
for r in "${app_roles[@]}"; do verify "$r" "$PLATFORM_APP_DB_PASSWORD"; done
for r in "${migrate_roles[@]}"; do verify "$r" "$PLATFORM_MIGRATE_DB_PASSWORD"; done
log 'done'
