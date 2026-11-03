#!/usr/bin/env bash
#
# Verify one backup directory without a database or docker (#1266 b6): manifest present, every payload file present
# with the recorded sha256, objects/ equal to the objects.sha256 inventory (no missing, changed or extra object), and
# object count/bytes equal to the manifest. Exit 0 = intact, 1 = problem (each one printed), 2 = usage.
#
#   bash scripts/backup/verify-backup.sh <backup-dir>
#
# This checks the files, not whether they restore; restore.sh does the restore-side checks.

set -Eeuo pipefail
set +x

BK_TAG=verify-backup
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$HERE/lib.sh"

case "${1:-}" in
  --help|-h) sed -n '3,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2; exit 0 ;;
  '') bk_die 'usage: verify-backup.sh <backup-dir>' 2 ;;
esac
[ "$#" -eq 1 ] || bk_die 'usage: verify-backup.sh <backup-dir>' 2
if bk_verify_dir "$1"; then
  bk_log "OK: $1 (checksums, inventory and counts match the manifest)"
else
  bk_log "FAILED: $1 is not an intact backup"
  exit 1
fi
