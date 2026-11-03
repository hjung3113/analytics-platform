#!/usr/bin/env bash
# Shared helpers of the backup scripts (#1266 b6). Sourced, never executed. bash 3.2 compatible (macOS hosts).
# No function here prints a credential; callers keep secrets in exported environment variables only.

BK_IMAGE_BACKEND_DEFAULT='platform-release-backend:local'
BK_IMAGE_MIGRATE_DEFAULT='platform-release-migrate:local'
# mc runs from the stack's own pinned MinIO server image (it ships the mc binary): no extra image to pull, and the
# separate minio/mc images are no longer published on Docker Hub. Override with BACKUP_MC_IMAGE only to use an internal
# registry copy of the same image; the entrypoint is always mc.
BK_MC_IMAGE_DEFAULT='minio/minio:RELEASE.2024-12-18T13-15-44Z'
BK_STAMP_RE='^[0-9]{8}T[0-9]{6}Z$'
# Fixed list of key tables whose row counts the manifest records (a table missing in an older schema is skipped;
# core.workspaces and the drizzle journal are required). core.sessions is deliberately absent (F10).
BK_COUNT_TABLES='core.workspaces core.actors core.audit_log core.entity_links core.notifications core.saved_views voc.vocs voc.voc_attachments voc.voc_internal_comments task.tasks finding.findings knowledge.knowledge_item permission.permission_grants pgboss.job drizzle.__drizzle_migrations'

bk_log() { printf '[%s] %s\n' "${BK_TAG:-backup}" "$*" >&2; }
bk_die() { printf '[%s] REFUSING: %s\n' "${BK_TAG:-backup}" "$1" >&2; exit "${2:-1}"; }

bk_sha256() { # bk_sha256 <file>
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi
}
bk_sha256_text() { # reads stdin
  if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print $1}'; else shasum -a 256 | awk '{print $1}'; fi
}
bk_size() { wc -c <"$1" | tr -d ' '; }

# BACKUP_ROOT: required, absolute, not "/", owned by the operator, not world-writable. Created 0700 when missing.
bk_check_root() {
  local root="${BACKUP_ROOT:-}"
  [ -n "$root" ] || bk_die 'set BACKUP_ROOT to the directory that holds the backups (absolute path, operator-owned)' 2
  case "$root" in /*) ;; *) bk_die "BACKUP_ROOT must be an absolute path, not '$root'" 2 ;; esac
  case "$root" in */..|*/../*|*/.|*/./*) bk_die 'BACKUP_ROOT must not contain . or .. segments' 2 ;; esac
  [ "$root" != / ] || bk_die 'BACKUP_ROOT must not be /' 2
  if [ ! -e "$root" ]; then
    mkdir -p "$root" && chmod 700 "$root" || bk_die "could not create BACKUP_ROOT $root"
  fi
  { [ -d "$root" ] && [ ! -L "$root" ]; } || bk_die "BACKUP_ROOT $root must be a real directory (not a symlink)" 2
  [ -O "$root" ] || bk_die "BACKUP_ROOT $root must be owned by the user running the backup" 2
  [ -z "$(find "$root" -maxdepth 0 -perm -0002 2>/dev/null)" ] || bk_die "BACKUP_ROOT $root must not be world-writable" 2
}

bk_check_keep() { # BACKUP_KEEP: positive integer, default 7
  BACKUP_KEEP="${BACKUP_KEEP:-7}"
  [[ "$BACKUP_KEEP" =~ ^[1-9][0-9]{0,3}$ ]] || bk_die "BACKUP_KEEP must be a positive integer, not '$BACKUP_KEEP'" 2
}

# Retention: keep the newest $2 backup directories under $1; never delete $3 (the one just written), anything that is
# not a timestamp-named real directory, or anything outside the root. Prints the names it removes.
bk_retention() { # bk_retention <root> <keep> <just-written-name>
  local root="$1" keep="$2" newest="$3" names name total=0 i=0 drop
  { [ -n "$root" ] && [ "$root" != / ] && [ -d "$root" ]; } || bk_die 'retention: invalid root' 2
  [[ "$newest" =~ $BK_STAMP_RE ]] || bk_die 'retention: the just-written backup name is not a timestamp' 2
  names="$(ls -1 "$root" 2>/dev/null | LC_ALL=C sort)"
  while IFS= read -r name; do
    [[ "$name" =~ $BK_STAMP_RE ]] || continue
    { [ -d "$root/$name" ] && [ ! -L "$root/$name" ]; } || continue
    total=$((total + 1))
  done <<<"$names"
  drop=$((total - keep))
  [ "$drop" -gt 0 ] || return 0
  while IFS= read -r name; do
    [ "$i" -lt "$drop" ] || break
    [[ "$name" =~ $BK_STAMP_RE ]] || continue
    { [ -d "$root/$name" ] && [ ! -L "$root/$name" ]; } || continue
    i=$((i + 1))
    [ "$name" != "$newest" ] || continue
    rm -rf -- "${root:?}/${name:?}"
    printf '%s\n' "$name"
  done <<<"$names"
}

# --- inventory of a directory tree: "<sha256>  ./<relative path>" sorted by path ---
bk_inventory() { # bk_inventory <dir>
  ( cd "$1" && LC_ALL=C find . -type f | LC_ALL=C sort | while IFS= read -r f; do
      printf '%s  %s\n' "$(bk_sha256 "$f")" "$f"
    done )
}
bk_tree_stats() { # bk_tree_stats <dir>  -> "<count> <bytes>"
  local n=0 b=0 f s
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    s="$(bk_size "$1/$f")"; n=$((n + 1)); b=$((b + s))
  done <<<"$(cd "$1" && LC_ALL=C find . -type f | LC_ALL=C sort)"
  printf '%s %s\n' "$n" "$b"
}

# --- manifest.json readers (the writer emits one `"key": value` per line, two-space indent per level) ---
bk_m_scalar() { # bk_m_scalar <manifest> <key>
  sed -n -E 's/^  "'"$2"'": "?([^",]*)"?,?$/\1/p' "$1" | head -1
}
bk_m_section() { # bk_m_section <manifest> <section>  -> "<key> <value>" lines
  sed -n -E '/^  "'"$2"'": \{/,/^  \}/p' "$1" | sed -n -E 's/^    "([^"]+)": "?([^",]*)"?,?$/\1 \2/p'
}
bk_m_section_value() { # bk_m_section_value <manifest> <section> <key>
  bk_m_section "$1" "$2" | awk -v k="$3" '$1 == k {print $2; exit}'
}

# verify-backup core: files, checksums, inventory, counts. No database, no docker. Returns 1 and prints each problem.
# The manifest does not checksum itself (F10); it is read as the reference.
bk_verify_dir() { # bk_verify_dir <backup-dir>
  local dir="$1" m bad=0 name want got entry stats cnt bytes
  m="$dir/manifest.json"
  { [ -d "$dir" ] && [ ! -L "$dir" ]; } || { bk_log "not a backup directory: $dir"; return 1; }
  [ -f "$m" ] || { bk_log "missing manifest.json in $dir"; return 1; }
  [ "$(bk_m_scalar "$m" format)" = 1 ] || { bk_log 'manifest format is not 1'; return 1; }
  for entry in "$dir"/* "$dir"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in
      manifest.json|platform.dump|globals.sql|objects.sha256|objects) ;;
      *) bk_log "unexpected entry in backup: $(basename "$entry")"; bad=1 ;;
    esac
  done
  [ -d "$dir/objects" ] || { bk_log 'missing objects/'; bad=1; }
  for name in platform.dump globals.sql objects.sha256; do
    want="$(bk_m_section_value "$m" files "$name")"
    if [ -z "$want" ]; then bk_log "manifest lists no checksum for $name"; bad=1; continue; fi
    if [ ! -f "$dir/$name" ]; then bk_log "missing file: $name"; bad=1; continue; fi
    got="$(bk_sha256 "$dir/$name")"
    [ "$got" = "$want" ] || { bk_log "checksum mismatch: $name"; bad=1; }
  done
  if [ -d "$dir/objects" ] && [ -f "$dir/objects.sha256" ]; then
    if ! bk_inventory "$dir/objects" | cmp -s - "$dir/objects.sha256"; then
      bk_log 'objects/ does not match objects.sha256 (changed, missing or extra object)'; bad=1
    fi
    stats="$(bk_tree_stats "$dir/objects")"; cnt="${stats% *}"; bytes="${stats#* }"
    [ "$cnt" = "$(bk_m_section_value "$m" objects count)" ] || { bk_log "object count $cnt differs from the manifest"; bad=1; }
    [ "$bytes" = "$(bk_m_section_value "$m" objects bytes)" ] || { bk_log "object bytes $bytes differ from the manifest"; bad=1; }
  fi
  [ "$bad" -eq 0 ]
}

# --- migration journal comparison (non-mutating; F6) ---
# Both inputs are files with one migration hash per line, in apply order. The database list must be a prefix of the
# image list. Prints the number of pending migrations; returns 1 (printing why) on divergence.
bk_journal_pending() { # bk_journal_pending <db-hashes-file> <image-hashes-file>
  local db_n img_n i=0 a b
  db_n="$(grep -c . "$1" || true)"; img_n="$(grep -c . "$2" || true)"
  if [ "$db_n" -gt "$img_n" ]; then
    bk_log "database has $db_n applied migrations, the target image only knows $img_n (older image than data)"; return 1
  fi
  if [ "$db_n" -gt 0 ]; then
    while IFS= read -r a && IFS= read -r b <&3; do
      i=$((i + 1))
      [ "$a" = "$b" ] || { bk_log "migration #$i differs between the database journal and the image"; return 1; }
      [ "$i" -lt "$db_n" ] || break
    done <"$1" 3<"$2"
  fi
  printf '%s\n' "$((img_n - db_n))"
}

# --- docker helpers shared by backup.sh, restore.sh and upgrade.sh (callers set PROJECT, ENV_FILE, COMPOSE_FILE) ---
bk_dc() { # compose with the production file; BK_COMPOSE_OVERRIDE adds a second file when set
  if [ -n "${BK_COMPOSE_OVERRIDE:-}" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$BK_COMPOSE_OVERRIDE" -p "$PROJECT" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT" "$@"
  fi
}
bk_psql() { # superuser psql through the socket inside the postgres container (trust auth; no password anywhere)
  bk_dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -tA -F '|' "$@"
}
bk_env_value() { # bk_env_value <env-file> <KEY>  (plain KEY=value / quoted; empty when absent)
  sed -n -E "s/^$2=//p" "$1" | head -1 | sed -E "s/^[\"']//; s/[\"']\$//"
}
bk_bucket() { # the attachment bucket the backend uses
  local b="${STORAGE_S3_BUCKET:-}"
  [ -n "$b" ] || b="$(bk_env_value "$ENV_FILE" STORAGE_S3_BUCKET)"
  b="${b:-platform-attachments}"
  [[ "$b" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || bk_die "unsafe bucket name '$b'" 2
  printf '%s\n' "$b"
}
# Export MC_HOST_bk for the running project's minio (credentials read inside the container; never in argv or files).
bk_mc_env() {
  local u p
  u="$(bk_dc exec -T minio printenv MINIO_ROOT_USER)" || bk_die 'could not read the MinIO user from the minio container'
  p="$(bk_dc exec -T minio printenv MINIO_ROOT_PASSWORD)" || bk_die 'could not read the MinIO password from the minio container'
  u="${u%$'\r'}"; p="${p%$'\r'}"
  [[ "$u$p" =~ ^[A-Za-z0-9_.-]+$ ]] || bk_die 'MinIO credentials with characters outside [A-Za-z0-9_.-] are not supported by the backup scripts'
  export MC_HOST_bk="http://$u:$p@minio:9000"
}
bk_mc() { # bk_mc <host-dir-or-empty> <mc args...> ; the compose network of $PROJECT; credentials via -e MC_HOST_bk (no value in argv)
  local dir="$1"; shift
  if [ -n "$dir" ]; then
    docker run --rm --network "${PROJECT}_default" -e MC_HOST_bk -e HOME=/tmp --user "$(id -u):$(id -g)" --entrypoint mc \
      -v "$dir:/data" "${BACKUP_MC_IMAGE:-$BK_MC_IMAGE_DEFAULT}" --quiet "$@"
  else
    docker run --rm --network "${PROJECT}_default" -e MC_HOST_bk -e HOME=/tmp --user "$(id -u):$(id -g)" --entrypoint mc \
      "${BACKUP_MC_IMAGE:-$BK_MC_IMAGE_DEFAULT}" --quiet "$@"
  fi
}
bk_bucket_stats() { # bk_bucket_stats <bucket> -> "<count> <bytes>" from a recursive listing of bk/<bucket>
  local out
  out="$(bk_mc '' ls --recursive --json "bk/$1")" || bk_die "could not list bucket $1"
  printf '%s\n' "$out" | { grep '"type":"file"' || true; } | { grep -o '"size":[0-9]*' || true; } | cut -d: -f2 \
    | awk '{n++; s+=$1} END {printf "%d %d\n", n+0, s+0}'
}
# Hashes of the migrations a migrate image would apply, in journal order (read-only: cat/sha256sum in a throwaway container).
bk_image_hashes() { # bk_image_hashes <image>
  local tags sums tag
  tags="$(docker run --rm --entrypoint cat "$1" migrations/meta/_journal.json | grep -o '"tag": *"[^"]*"' | sed -E 's/.*"([^"]*)"$/\1/')" \
    || bk_die "could not read the migration journal of image $1"
  sums="$(docker run --rm --entrypoint sh "$1" -c 'cd migrations && sha256sum *.sql')" || bk_die "could not hash migrations of image $1"
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    printf '%s\n' "$sums" | awk -v f="$tag.sql" '$2 == f {print $1; found=1} END {exit found ? 0 : 1}' \
      || bk_die "image $1 lists migration $tag but ships no $tag.sql"
  done <<<"$tags"
}
bk_db_hashes() { bk_psql -d platform -c 'select hash from drizzle.__drizzle_migrations order by id'; }
