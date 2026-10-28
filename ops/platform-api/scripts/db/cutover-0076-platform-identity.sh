#!/usr/bin/env bash
#
# Cutover 0076: database `feedbackops` -> `platform` and the nine fops_* roles -> platform_* (#1100 a, ADR-0097).
#
# ADMIN-ONLY, OPS-ONLY. The backend never reads CUTOVER_ADMIN_URL; only this script and the human running it do.
# Run it with the backend and every job worker STOPPED. It is a staged, resumable operation:
#
#   history  Replay migrations 0000..0075 (a byte-identical staged copy of the migration folder) as the OLD
#            migrate role fops_migrate. Fresh installs start here; an installation that already holds 0075 has
#            nothing to apply. drizzle-kit migrate has no "up to" target, hence the staged copy.
#   rename   Admin connection to the `postgres` database: rename the nine roles in ONE transaction, then rename the
#            database in a SEPARATE statement outside any transaction (PostgreSQL forbids renaming the database or
#            login you are connected to, and a rename inside a transaction block is not allowed for databases).
#   migrate  Ordinary `pnpm --filter @ap/platform-api db:migrate` as platform_migrate: applies 0076 and everything
#            after it. No admin credential is involved from here on, now and for all later migrations.
#   all      history, rename, migrate (default). Safe to repeat: every stage inspects the catalog first and does
#            nothing that is already done.
#
# State is read from the catalog, not from a side file, so a deliberate retry after any failure resumes correctly:
#   old roles + any one database   -> history/rename still pending
#   new roles + `feedbackops`      -> role rename done, database rename pending (resume)
#   new roles + `platform`         -> rename done; migrate applies whatever is missing
# Mixed old/new roles, both databases, or neither database fail closed WITHOUT changing anything.
#
# Passwords never change here. Role renames clear MD5 password hashes, so the script refuses MD5 roles before
# touching anything; reset them to SCRAM first (docs: 04-database-and-migrations.md, local recreation / credentials).
# Sessions are never terminated: if the old roles or database are in use the script lists counts and stops.
#
# Environment:
#   CUTOVER_ADMIN_URL           required. postgres://<superuser>:<pw>@host:port/postgres  (never the target database)
#   CUTOVER_OLD_MIGRATE_URL     optional. Existing installs: postgres://fops_migrate:<pw>@host:port/<current db>.
#                               Default: fops_migrate with the final bootstrap password (fresh installs).
#   DATABASE_URL_MIGRATE        required for `migrate`/`all`: postgres://platform_migrate:<pw>@host:port/platform
#   CUTOVER_OLD_DB / CUTOVER_NEW_DB   defaults feedbackops / platform
#   CUTOVER_ALLOW_DEV_DB=1      required to operate on port 5434 (a developer's local database)
#
# Usage: cutover-0076-platform-identity.sh [all|history|rename|migrate]

set -euo pipefail
set +x

OPS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck disable=SC1091
. "$OPS_ROOT/paths.sh"
BACKEND_DIR="$FO_REPO_ROOT/$FO_BACKEND"

LOG_TAG='cutover-0076'
LAST_HISTORY_TAG='0075_platform_usage_client_errors'
HISTORY_LEDGER_ROWS=76
ROLE_SUFFIXES=(migrate app survey_aggregate_owner survey_evidence_reader_owner survey_provenance_mutator_owner
  entity_links_view_owner entity_links_survey_mutator_owner survey_derived_finding_reader_owner core_audit_reader_owner)
OLD_DB="${CUTOVER_OLD_DB:-feedbackops}"
NEW_DB="${CUTOVER_NEW_DB:-platform}"

log() { printf '[%s] %s\n' "$LOG_TAG" "$*" >&2; }
die() { printf '[%s] REFUSING: %s\n' "$LOG_TAG" "$1" >&2; exit "${2:-1}"; }

csv() { # csv <prefix>: quoted, comma-separated role names for SQL IN lists
  local prefix=$1 out='' s
  for s in "${ROLE_SUFFIXES[@]}"; do out+="${out:+,}'${prefix}_${s}'"; done
  printf '%s' "$out"
}
OLD_LIST="$(csv fops)"
NEW_LIST="$(csv platform)"

url_part() { # url_part <url> host|port|user|db
  node -e '
    const u = new URL(process.argv[1]);
    const out = { host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), db: decodeURIComponent(u.pathname.slice(1)) };
    process.stdout.write(out[process.argv[2]]);
  ' "$1" "$2" 2>/dev/null || die 'a connection URL is not parseable'
}

url_with_db() { # url_with_db <url> <database>
  node -e '
    const u = new URL(process.argv[1]);
    u.pathname = "/" + encodeURIComponent(process.argv[2]);
    process.stdout.write(u.toString());
  ' "$1" "$2"
}

require_tools() {
  command -v psql >/dev/null 2>&1 || die 'psql is required'
  command -v node >/dev/null 2>&1 || die 'node is required'
}

require_admin() {
  ADMIN_URL="${CUTOVER_ADMIN_URL:-}"
  [ -n "$ADMIN_URL" ] || die 'set CUTOVER_ADMIN_URL to an admin connection to the postgres database (see the header of this script)'
  ADMIN_HOST="$(url_part "$ADMIN_URL" host)"
  ADMIN_PORT="$(url_part "$ADMIN_URL" port)"
  local admin_db admin_user
  admin_db="$(url_part "$ADMIN_URL" db)"
  admin_user="$(url_part "$ADMIN_URL" user)"
  if [ "$ADMIN_PORT" = 5434 ] && [ "${CUTOVER_ALLOW_DEV_DB:-}" != 1 ]; then
    die 'port 5434 is the local development database; set CUTOVER_ALLOW_DEV_DB=1 to operate on it deliberately' 2
  fi
  case "$admin_db" in
    "$OLD_DB" | "$NEW_DB") die "the admin connection must not use the database being renamed ($admin_db); connect to postgres" 2 ;;
  esac
  case "$admin_user" in
    fops_* | platform_*) die 'the admin connection must not use one of the roles being renamed' 2 ;;
  esac
}

adm() { psql -X -v ON_ERROR_STOP=1 -tA "$ADMIN_URL" "$@"; }

detect_state() {
  local old_n new_n
  old_n="$(adm -c "select count(*) from pg_roles where rolname in ($OLD_LIST)")"
  new_n="$(adm -c "select count(*) from pg_roles where rolname in ($NEW_LIST)")"
  if [ "$old_n" = 9 ] && [ "$new_n" = 0 ]; then ROLES=old
  elif [ "$old_n" = 0 ] && [ "$new_n" = 9 ]; then ROLES=new
  elif [ "$old_n" = 0 ] && [ "$new_n" = 0 ]; then
    die 'none of the nine roles exist (neither fops_* nor platform_*); run scripts/db/init.sql on a fresh cluster first'
  else
    die "mixed or conflicting role state (fops_*: $old_n of 9, platform_*: $new_n of 9); nothing was changed, resolve it by hand"
  fi
  local has_old has_new
  has_old="$(adm -c "select count(*) from pg_database where datname = '$OLD_DB'")"
  has_new="$(adm -c "select count(*) from pg_database where datname = '$NEW_DB'")"
  if [ "$has_old" = 1 ] && [ "$has_new" = 1 ]; then
    die "both databases '$OLD_DB' and '$NEW_DB' exist; nothing was changed, resolve it by hand"
  elif [ "$has_old" = 1 ]; then DBS=legacy; CUR_DB="$OLD_DB"
  elif [ "$has_new" = 1 ]; then DBS=final; CUR_DB="$NEW_DB"
  else die "neither database '$OLD_DB' nor '$NEW_DB' exists"
  fi
  log "state: roles=$ROLES database=$DBS ($CUR_DB)"
}

ledger_rows() { # ledger_rows <database>; prints the row count, 0 when there is no ledger yet
  local db_url
  db_url="$(url_with_db "$ADMIN_URL" "$1")"
  psql -X -v ON_ERROR_STOP=1 -tA "$db_url" \
    -c "select case when to_regclass('drizzle.__drizzle_migrations') is null then 0 else (select count(*) from drizzle.__drizzle_migrations) end"
}

refuse_active_sessions() { # refuse_active_sessions <roles-csv> <database> ...
  local roles=$1 count
  shift
  local dbs=''
  for d in "$@"; do dbs+="${dbs:+,}'$d'"; done
  count="$(adm -c "select count(*) from pg_stat_activity where pid <> pg_backend_pid() and (usename in ($roles) or datname in (${dbs:-''}))")"
  if [ "$count" != 0 ]; then
    adm -c "select coalesce(usename, '-') as role, coalesce(datname, '-') as database, coalesce(nullif(application_name, ''), '-') as application, count(*) from pg_stat_activity where pid <> pg_backend_pid() and (usename in ($roles) or datname in (${dbs:-''})) group by 1, 2, 3 order by 1, 2, 3" >&2 || true
    die "$count session(s) still use the roles or database being renamed; stop the backend, jobs and any psql sessions, then run this script again (it never terminates sessions)" 3
  fi
}

stage_history() {
  detect_state
  if [ "$ROLES" = new ]; then
    log 'history: skipped, the roles are already renamed (history was replayed before the rename)'
    return 0
  fi
  local old_url
  old_url="${CUTOVER_OLD_MIGRATE_URL:-}"
  if [ -z "$old_url" ]; then
    old_url="postgres://fops_migrate:platform_migrate@${ADMIN_HOST}:${ADMIN_PORT}/${CUR_DB}"
  fi
  [ "$(url_part "$old_url" user)" = fops_migrate ] || die 'CUTOVER_OLD_MIGRATE_URL must connect as fops_migrate'
  [ "$(url_part "$old_url" db)" = "$CUR_DB" ] || die "CUTOVER_OLD_MIGRATE_URL must name the current database ($CUR_DB)"
  [ "$(url_part "$old_url" host):$(url_part "$old_url" port)" = "$ADMIN_HOST:$ADMIN_PORT" ] || die 'CUTOVER_OLD_MIGRATE_URL must target the same server as CUTOVER_ADMIN_URL'

  local stage
  stage="$(mktemp -d)"
  trap "rm -rf '$stage'" RETURN
  node - "$BACKEND_DIR/migrations" "$stage" "$LAST_HISTORY_TAG" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [src, dst, lastTag] = process.argv.slice(2);
const journal = JSON.parse(fs.readFileSync(path.join(src, 'meta', '_journal.json'), 'utf8'));
const last = journal.entries.findIndex((e) => e.tag === lastTag);
if (last < 0) throw new Error(`journal has no ${lastTag}`);
const kept = { ...journal, entries: journal.entries.slice(0, last + 1) };
fs.mkdirSync(path.join(dst, 'meta'), { recursive: true });
fs.writeFileSync(path.join(dst, 'meta', '_journal.json'), JSON.stringify(kept, null, 2));
for (const entry of kept.entries) {
  const from = path.join(src, `${entry.tag}.sql`);
  const to = path.join(dst, `${entry.tag}.sql`);
  fs.copyFileSync(from, to);
  if (!fs.readFileSync(from).equals(fs.readFileSync(to))) throw new Error(`staged copy of ${entry.tag} differs`);
}
console.error(`staged ${kept.entries.length} immutable migrations through ${lastTag}`);
NODE
  log "history: replaying 0000..0075 as fops_migrate on $CUR_DB"
  (
    cd "$BACKEND_DIR"
    DRIZZLE_OUT="$stage" DATABASE_URL_MIGRATE="$old_url" pnpm exec drizzle-kit migrate
  )
  local rows
  rows="$(ledger_rows "$CUR_DB")"
  [ "$rows" = "$HISTORY_LEDGER_ROWS" ] || die "after history the ledger holds $rows rows, expected $HISTORY_LEDGER_ROWS" 4
  log 'history: ledger holds 0000..0075'
}

stage_rename() {
  detect_state
  if [ "$ROLES" = old ]; then
    local rows
    rows="$(ledger_rows "$CUR_DB")"
    [ "$rows" = "$HISTORY_LEDGER_ROWS" ] || die "the ledger of $CUR_DB holds $rows rows, expected exactly $HISTORY_LEDGER_ROWS (0000..0075); run the history stage first" 4
    local md5_roles
    md5_roles="$(adm -c "select string_agg(rolname, ', ' order by rolname) from pg_authid where rolname in ($OLD_LIST) and rolpassword like 'md5%'")"
    if [ -n "$md5_roles" ]; then
      die "role(s) $md5_roles have MD5 password hashes; ALTER ROLE ... RENAME clears them and would lock the login out. Reset them to SCRAM first (SET password_encryption = 'scram-sha-256'; ALTER ROLE <name> PASSWORD '<new>')" 5
    fi
    refuse_active_sessions "$OLD_LIST" "$CUR_DB"
    log 'rename: renaming the nine roles in one transaction'
    {
      echo 'BEGIN;'
      local s
      for s in "${ROLE_SUFFIXES[@]}"; do echo "ALTER ROLE fops_${s} RENAME TO platform_${s};"; done
      echo 'COMMIT;'
    } | adm >/dev/null
    ROLES=new
  else
    log 'rename: roles already renamed'
  fi
  if [ "$DBS" = legacy ]; then
    refuse_active_sessions "$NEW_LIST" "$OLD_DB"
    log "rename: renaming database $OLD_DB to $NEW_DB (separate statement, outside any transaction)"
    adm -c "ALTER DATABASE \"$OLD_DB\" RENAME TO \"$NEW_DB\"" >/dev/null
  else
    log "rename: database is already named $NEW_DB"
  fi
}

stage_migrate() {
  detect_state
  [ "$ROLES" = new ] || die 'the roles are not renamed yet; run the rename stage first' 4
  [ "$DBS" = final ] || die "the database is still named $OLD_DB; run the rename stage first" 4
  local url="${DATABASE_URL_MIGRATE:-}"
  [ -n "$url" ] || die 'set DATABASE_URL_MIGRATE to the platform_migrate connection of the platform database' 2
  [ "$(url_part "$url" user)" = platform_migrate ] || die 'DATABASE_URL_MIGRATE must connect as platform_migrate'
  [ "$(url_part "$url" db)" = "$NEW_DB" ] || die "DATABASE_URL_MIGRATE must name the $NEW_DB database"
  [ "$(url_part "$url" host):$(url_part "$url" port)" = "$ADMIN_HOST:$ADMIN_PORT" ] || die 'DATABASE_URL_MIGRATE must target the same server as CUTOVER_ADMIN_URL'
  log 'migrate: db:migrate as platform_migrate (applies 0076 and later)'
  (cd "$BACKEND_DIR" && pnpm exec drizzle-kit migrate)
  local marked
  marked="$(psql -X -v ON_ERROR_STOP=1 -tA "$url" -c "select count(*) from unnest(array['voc.guard_cluster_suggestion_bucket_delete()','voc.guard_similarity_preview_request_delete()','voc.guard_similarity_preview_budget_delete()']) s(sig) where obj_description(to_regprocedure(s.sig)::oid, 'pg_proc') = 'platform identity 0076: owner-based delete guard'")"
  [ "$marked" = 3 ] || die "0076 is not recorded after db:migrate ($marked of 3 guards attested)" 4
  log 'migrate: 0076 committed; the backend may start'
}

main() {
  local stage="${1:-all}"
  require_tools
  require_admin
  case "$stage" in
    history) stage_history ;;
    rename) stage_rename ;;
    migrate) stage_migrate ;;
    all) stage_history; stage_rename; stage_migrate ;;
    *) echo "usage: $0 [all|history|rename|migrate]" >&2; exit 2 ;;
  esac
}

main "$@"
