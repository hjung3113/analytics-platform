#!/usr/bin/env bash
# Capacity of every lane host (LANES §Machine resources «Lane hosts»): this machine, then each paired Orca host.
# Prints this machine's `capacity.sh` line unchanged, then one `host=<env> <capacity line>` per remote host
# (`host=<env> unknown why=<reason>` when it cannot be measured). Appends every line to the capacity log so limits can be
# calibrated from several sessions of measurements. Blocks nothing; exit is always 0.
# Hosts file (local, not committed): $AP_MAIN/.review/lanes/hosts.tsv, one `<orca environment>\t<repo clone path>` per line,
#   `#` comments allowed. No file = this machine only.
# The remote measurement runs main's `capacity.sh` (fetched, piped to bash) in a short-lived Orca terminal on that host and
#   closes it; it never checks out or pulls the remote clone.
# Env: AP_MAIN (default: this checkout's main worktree), HOSTS_FILE, CAPACITY_LOG (default $AP_MAIN/.review/lanes/capacity-log.tsv),
#   HOSTS_CAPACITY_TIMEOUT_S (per remote host, default 40).
# usage: hosts-capacity.sh [--no-log]
set -u
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
log=1
[ "${1:-}" = "--no-log" ] && log=0
if [ -z "${AP_MAIN:-}" ]; then
  common=$(git -C "$SCRIPT_DIR" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
fi
hosts=${HOSTS_FILE:-${AP_MAIN:+$AP_MAIN/.review/lanes/hosts.tsv}}
logf=${CAPACITY_LOG:-${AP_MAIN:+$AP_MAIN/.review/lanes/capacity-log.tsv}}
timeout_s=${HOSTS_CAPACITY_TIMEOUT_S:-40}
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

record() { # host line
  [ "$log" = 1 ] && [ -n "$logf" ] && { mkdir -p "$(dirname "$logf")" && printf '%s\t%s\t%s\n' "$now" "$1" "$2" >>"$logf"; } 2>/dev/null
  return 0
}

local_line=$(bash "$SCRIPT_DIR/capacity.sh" 2>&1)
echo "$local_line"
record local "$local_line"

[ -n "$hosts" ] && [ -r "$hosts" ] || exit 0

measure() { # env path → prints capacity line or "unknown why=…"
  local env=$1 path=$2 cmd out handle t line
  cmd="git -C '$path' fetch -q origin main 2>/dev/null; git -C '$path' show origin/main:.agents/conductor/scripts/capacity.sh | CAPACITY_STATE='$path/.review/capacity.last' bash; echo HOSTCAP-END"
  out=$(orca terminal create --environment "$env" --worktree "path:$path" --title "hosts-capacity" --command "$cmd" --json 2>&1) || {
    echo "unknown why=terminal create failed"; return; }
  handle=$(printf '%s' "$out" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["terminal"]["handle"])' 2>/dev/null)
  [ -n "$handle" ] || { echo "unknown why=no terminal handle"; return; }
  t=0
  line=
  while [ "$t" -lt "$timeout_s" ]; do
    out=$(orca terminal read --environment "$env" --terminal "$handle" 2>/dev/null)
    if printf '%s\n' "$out" | grep -q '^HOSTCAP-END'; then
      line=$(printf '%s\n' "$out" | grep -E '^(green|yellow|red) workers=' | tail -1)
      break
    fi
    sleep 2; t=$((t + 2))
  done
  orca terminal close --environment "$env" --terminal "$handle" >/dev/null 2>&1
  if [ -n "$line" ]; then echo "$line"; else echo "unknown why=no capacity line within ${timeout_s}s"; fi
}

while IFS=$'\t' read -r env path _; do
  case "$env" in ''|'#'*) continue ;; esac
  [ -n "${path:-}" ] || { echo "host=$env unknown why=no repo path in $hosts"; continue; }
  line=$(measure "$env" "$path")
  echo "host=$env $line"
  record "$env" "$line"
done <"$hosts"
exit 0
