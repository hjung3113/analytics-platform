#!/usr/bin/env bash
# Verdict of the required `Platform contracts (E2E)` check (#1019): which E2E result it needs, and the one-line summary of what ran.
# The check never reports Skipped; it passes from real results only:
#   docs-only run (CODE=false) or nothing selected (E2E=none) → pass, no shard was needed
#   everything else (all, a spec list, base-path-only, or empty because `changes` failed → everything ran) → the shard job result must be exactly `success`
#
#   CODE=<code output> E2E=<e2e output> E2E_BASE_PATH=<output> SHARD_RESULT=<needs result> .github/scripts/e2e-verdict.sh   exit 0 = pass; prints the summary line (also appended to $GITHUB_STEP_SUMMARY)
#   .github/scripts/e2e-verdict.sh --self-test
set -u

summary_line() { # <code> <e2e> <base_path>
  local code="$1" e2e="$2" base="$3"
  if [ "$code" = false ] || [ "$e2e" = none ]; then echo "E2E skipped: no affected spec"
  elif [ "$e2e" = all ] || [ -z "$e2e" ]; then echo "E2E: all"
  elif [ "$e2e" = base-path-only ]; then echo "E2E: base-path only (selection)"
  elif [ "$base" = true ]; then echo "E2E: $e2e + base-path (selection)"
  else echo "E2E: $e2e (selection)"
  fi
}

verdict() { # <code> <e2e> <shard result>
  if [ "$1" = false ] || [ "$2" = none ]; then return 0; fi
  [ "$3" = success ]
}

if [ "${1:-}" = "--self-test" ]; then
  bad=0
  expect() { # <name> <want exit> <want line> <code> <e2e> <base> <shard>
    local name="$1" want="$2" line="$3" code="$4" e2e="$5" base="$6" shard="$7" got out
    verdict "$code" "$e2e" "$shard"; got=$?
    out="$(summary_line "$code" "$e2e" "$base")"
    if [ "$got" -eq "$want" ] && [ "$out" = "$line" ]; then echo "ok   $name"; else echo "FAIL $name → exit $got '$out', want $want '$line'"; bad=1; fi
  }
  A="E2E: all"; S="E2E skipped: no affected spec"
  # name                          exit line                                         code   e2e                  base   shard
  expect "pr docs-only"           0 "$S"                                            false  none                 false  skipped
  expect "pr docs-only, shard ran" 0 "$S"                                           false  none                 false  success
  expect "pr code, all ok"        0 "$A"                                            true   all                  true   success
  expect "pr code, all fails"     1 "$A"                                            true   all                  true   failure
  expect "pr code, all cancelled" 1 "$A"                                            true   all                  true   cancelled
  expect "pr code, all skipped"   1 "$A"                                            true   all                  true   skipped
  expect "pr spec-only ok"        0 "E2E: hw-time.spec.ts (selection)"              true   hw-time.spec.ts      false  success
  expect "pr spec-only fails"     1 "E2E: hw-time.spec.ts (selection)"              true   hw-time.spec.ts      false  failure
  expect "pr spec-only skipped"   1 "E2E: hw-time.spec.ts (selection)"              true   hw-time.spec.ts      false  skipped
  expect "pr two specs + base"    0 "E2E: a.spec.ts b.spec.ts + base-path (selection)" true   "a.spec.ts b.spec.ts" true success
  expect "pr base-path-only ok"   0 "E2E: base-path only (selection)"               true   base-path-only       true   success
  expect "pr base-path-only fail" 1 "E2E: base-path only (selection)"               true   base-path-only       true   failure
  expect "pr nothing selected"    0 "$S"                                            true   none                 false  skipped
  expect "push with baseline ok"  0 "E2E: eqv.spec.ts (selection)"                  true   eqv.spec.ts          false  success
  expect "push without baseline"  0 "$A"                                            true   all                  true   success
  expect "push without baseline, red" 1 "$A"                                        true   all                  true   failure
  expect "dispatch full=true"     0 "$A"                                            true   all                  true   success
  expect "dispatch full=true red" 1 "$A"                                            true   all                  true   failure
  expect "dispatch full=false"    0 "$A"                                            true   all                  true   success
  expect "changes failed, shard ok"      0 "$A"                                     ""     ""                   ""     success
  expect "changes failed, shard red"     1 "$A"                                     ""     ""                   ""     failure
  expect "changes failed, shard skipped" 1 "$A"                                     ""     ""                   ""     skipped
  expect "changes failed, shard cancelled" 1 "$A"                                   ""     ""                   ""     cancelled
  expect "e2e output lost only"   1 "$A"                                            true   ""                   ""     skipped
  [ "$bad" -eq 0 ] && echo "e2e-verdict self-test passed"
  exit "$bad"
fi

code="${CODE:-}"; e2e="${E2E:-}"; base="${E2E_BASE_PATH:-}"; shard="${SHARD_RESULT:-}"
line="$(summary_line "$code" "$e2e" "$base")"
echo "$line (code=${code:-<empty>} e2e=${e2e:-<empty>} shards=${shard:-<empty>})"
[ -z "${GITHUB_STEP_SUMMARY:-}" ] || echo "$line" >> "$GITHUB_STEP_SUMMARY"
verdict "$code" "$e2e" "$shard"
