#!/bin/bash
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"  # zsh-invoked runs lost BASH_SOURCE (s61, s70)
# verify-be.sh <worktree> <issue> [module-filter...] — BE host checks (<worktree> is the repository checkout root): backend tsc, root typecheck, boundaries +
# fixture test, migration drift, packages/feature-shared vitest when touched, then backend integration on the throwaway DB
# described by $WAVE_STATE/env.verify.<issue> (platform_app role). Filters narrow the integration run (touched modules).
: "${WAVE_STATE:?set WAVE_STATE}"; W=$1; N=$2; shift 2
here=$(cd "$(dirname "$0")" && pwd)
# Feature path map (FEATURE_OPS, FEATURE_SHARED); `feature_ops` runs a script of the @ap/platform-api-ops tool package (ops/platform-api).
# shellcheck disable=SC1091
. "$here/../../paths.sh"
feature_ops() { pnpm -s --filter @ap/platform-api-ops run "$@"; }
L=$WAVE_STATE/vbe-$N; mkdir -p "$L"; export PATH=/opt/homebrew/opt/node@22/bin:$PATH; cd "$W" || exit 2
first_failure=0
check_names=(); check_codes=()
run_check() {
  local check_name=$1 check_log=$2 check_code; shift 2
  ("$@") > "$check_log" 2>&1
  check_code=$?
  check_names+=("$check_name"); check_codes+=("$check_code")
  if [ "$check_code" -ne 0 ] && [ "$first_failure" -eq 0 ]; then first_failure=$check_code; fi
}
run_vitest() { (cd "$1" && npx vitest run); }
print_summary() {
  local i
  printf '%-24s %s\n' 'Check' 'Exit'
  for ((i=0; i<${#check_names[@]}; i++)); do
    printf '%-24s %s\n' "${check_names[$i]}" "${check_codes[$i]}"
  done
}
run_check be-tsc "$L/be-tsc.log" pnpm --filter @ap/platform-api exec tsc --noEmit
run_check typecheck "$L/typecheck.log" feature_ops feature:typecheck
run_check boundaries "$L/boundaries.log" node "$FEATURE_OPS/scripts/check-boundaries.mjs"
run_check boundaries-test "$L/boundaries-test.log" node "$FEATURE_OPS/scripts/check-boundaries.test.mjs"
run_check drift "$L/drift.log" feature_ops gate:db-migration-drift
if { git diff --name-only origin/develop...HEAD; git status --short; } | grep -q "$FEATURE_SHARED"; then
  run_check shared-vitest "$L/shared.log" run_vitest "$FEATURE_SHARED"; fi
run_check integration "$L/integration.log" env PLATFORM_API_ENV_FILE="$WAVE_STATE/env.verify.$N" pnpm --filter @ap/platform-api test:integration "$@"
print_summary > "$L/summary.txt"
echo "be-tsc errors=$(grep -c 'error TS' "$L/be-tsc.log")" >> "$L/summary.txt"
tail -1 "$L/boundaries.log" >> "$L/summary.txt"
if [ -f "$L/shared.log" ]; then grep -E 'Tests ' "$L/shared.log" | tail -1 >> "$L/summary.txt"; fi
grep -E "Test Files|Tests " "$L/integration.log" | tail -2 >> "$L/summary.txt"
grep -E "FAIL " "$L/integration.log" | sort -u | head -15 >> "$L/summary.txt"
cat "$L/summary.txt"
exit "$first_failure"
