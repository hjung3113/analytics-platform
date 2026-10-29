#!/usr/bin/env bash
# Pre-merge record gate (#1142): the records PROFILE requires before a PR merges, checked by one command.
# Called from addenda/merge.md on both merge paths. Runs tier.sh in the worktree, then:
#   tier=full      requires W-<issue>-VERIFY.md (in $WAVE_STATE, $WAVE_BRIEFS, or the archived
#                  $WAVE_BRIEFS/<issue>/) with a `review-plan:` line, and a review-final record:
#                  W-<issue>-FINAL.json or a W-<issue>-FINAL*.md report with a filled `Verdict:` line
#                  (PENDING/TBD skeletons do not count).
#   ux=required    requires a UX record (W-<issue>-UX.json) or a `ux-skip: <evidence path>` line in
#                  VERIFY whose path exists (relative paths resolve against the worktree).
# Exit 0 all records present; 1 anything missing (each missing item printed); 2 usage / tier unreadable /
#   review-plan.py unusable (nonzero exit, output not a JSON with ok:true and a supported ux value).
# Env: WAVE_STATE, WAVE_BRIEFS (default $AP_MAIN/.review/wave; AP_MAIN defaults to the git common dir),
#   SHIP_CHECK_TIER (self-test only: a literal tier.sh output line, skips tier.sh),
#   SHIP_CHECK_UX   (self-test only: `required` or `optional`, skips review-plan.py).
#   SHIP_CHECK_PLAN / SHIP_CHECK_PLAN_RC (self-test only: literal review-plan.py stdout and exit status,
#   skips running review-plan.py).
# usage: ship-check.sh <issue> <worktree> [--help|--self-test]
 set -u
 SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
 ENGINE=${ENGINE:-$HOME/.agents/skills/issue-wave-conductor/scripts}
 
 usage() { echo "usage: ship-check.sh <issue> <worktree>" >&2; exit 2; }
 missing() { MISSING="${MISSING:+$MISSING
 }ship-check: $1"; }
 
# review-plan.py stdout -> `required`|`optional` on stdout. Any other output is a failure (Q1):
# prints the reason and returns 1. ux must be required|optional, or false/none (the engine's "no UX").
plan_ux() {
  python3 - "$1" <<'PYEOF'
import json, sys
try:
    obj = json.loads(sys.argv[1])
except ValueError:
    print('not valid JSON'); sys.exit(1)
if not isinstance(obj, dict) or obj.get('ok') is not True:
    print('no ok:true'); sys.exit(1)
ux = obj.get('ux')
if ux in ('required', 'optional'):
    print(ux)
elif ux is False or ux is None or ux == 'none':
    print('optional')
else:
    print(f'unsupported ux value: {ux!r}'); sys.exit(1)
PYEOF
}
 
self_test() {
  local T rc pass
  T=$(mktemp -d "${TMPDIR:-/tmp}/ap-ship-check-self-test.XXXXXX") || return 1
  cleanup() { rm -rf "$T"; }
  pass=0
  fail() { echo "self-test failed: $1"; cleanup; exit 1; }
  expect() { # <exit> <label>
    [ "$1" -eq "$rc" ] && { pass=$((pass + 1)); return 0; }
    fail "$2: exit $rc, expected $1"
  }
  mkdir -p "$T/state" "$T/briefs/1142" "$T/wt"
  export WAVE_STATE="$T/state" WAVE_BRIEFS="$T/briefs"
  # Q1: the plan is now read for every full-tier run; default it to a healthy optional JSON so the
  # record cases below test VERIFY/FINAL/UX, not review-plan.py in an empty fixture worktree.
  export SHIP_CHECK_PLAN='{"ok": true, "code": true, "ux": "optional", "flags": {}, "reasons": {}, "files": 3}'

  # usage
  bash "$0" >/dev/null 2>&1; rc=$?
  expect 2 "usage"

  # light tier needs no records
  SHIP_CHECK_TIER='tier=light verify=light merge=short why=' bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "light"

  # full tier: missing VERIFY
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=full:apps/platform-web/x.ts' \
    bash "$0" 1142 "$T/wt" >"$T/out"; rc=$?
  expect 1 "full missing verify"
  grep -q "W-1142-VERIFY.md not found" "$T/out" || fail "full missing verify: no VERIFY line"
  pass=$((pass + 1))

  # full tier: VERIFY without review-plan line
  printf 'tier=full, checks done\n' >"$T/state/W-1142-VERIFY.md"
  printf '{}\n' >"$T/state/W-1142-FINAL.json"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' bash "$0" 1142 "$T/wt" >"$T/out"; rc=$?
  expect 1 "no review-plan line"
  grep -q "no review-plan: line" "$T/out" || fail "no review-plan: message missing"
  pass=$((pass + 1))

  # full tier: complete (review-plan line + FINAL.json)
  printf 'review-plan: reviewers=review-final\nVerdict recorded\n' >"$T/state/W-1142-VERIFY.md"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "full with FINAL.json"

  # review-final via a report with a filled Verdict line (skeleton PENDING does not count)
  rm "$T/state/W-1142-FINAL.json"
  printf '## Review\nVerdict: PENDING\n' >"$T/state/W-1142-FINAL1.md"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 1 "PENDING skeleton rejected"
  printf '## Review\nVerdict: pass, one minor filed\n' >"$T/state/W-1142-FINAL1.md"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "Verdict report accepted"

  # ux=required without a record
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_UX=required \
    bash "$0" 1142 "$T/wt" >"$T/out"; rc=$?
  expect 1 "ux required missing"
  grep -q "no UX record" "$T/out" || fail "ux missing: no message"
  pass=$((pass + 1))

  # ux=required with an existing ux-skip evidence path (relative to the worktree)
  printf 'review-plan: reviewers=review-final\nux-skip: .review/ux-evidence.md\n' >"$T/state/W-1142-VERIFY.md"
  mkdir -p "$T/wt/.review" && printf '# evidence\n' >"$T/wt/.review/ux-evidence.md"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_UX=required \
    bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "ux-skip path accepted"
  printf 'ux-skip: .review/gone.md\n' >"$T/state/W-1142-UX-skip-only.md" # not read; VERIFY below is what counts
  printf 'review-plan: reviewers=review-final\nux-skip: .review/gone.md\n' >"$T/state/W-1142-VERIFY.md"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_UX=required \
    bash "$0" 1142 "$T/wt" >"$T/out"; rc=$?
  expect 1 "ux-skip path missing"
  grep -q "does not exist" "$T/out" || fail "ux-skip missing: no message"
  pass=$((pass + 1))

  # ux record via W-<n>-UX.json
  printf 'review-plan: reviewers=review-final\n' >"$T/state/W-1142-VERIFY.md"
  printf '{}\n' >"$T/state/W-1142-UX.json"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_UX=required \
    bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "UX.json accepted"

  # Q1: a failing plan, an error JSON, an empty output or an unsupported ux must block (exit 2),
  # not pass as optional. Records above are complete, so only the plan can fail here.
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_PLAN_RC=2 \
    SHIP_CHECK_PLAN='{"ok": false, "error": "uncommitted changes outside .review/"}' \
    bash "$0" 1142 "$T/wt" >"$T/out" 2>&1; rc=$?
  expect 2 "plan exit failure blocks"
  grep -q "review-plan.py exited 2" "$T/out" || fail "plan exit failure: no message"
  pass=$((pass + 1))
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' \
    SHIP_CHECK_PLAN='{"ok": false, "error": "git failed"}' \
    bash "$0" 1142 "$T/wt" >"$T/out" 2>&1; rc=$?
  expect 2 "error JSON blocks"
  grep -q "no ok:true" "$T/out" || fail "error JSON: no message"
  pass=$((pass + 1))
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_PLAN='' \
    bash "$0" 1142 "$T/wt" >"$T/out" 2>&1; rc=$?
  expect 2 "empty output blocks"
  grep -q "not valid JSON" "$T/out" || fail "empty output: no message"
  pass=$((pass + 1))
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' SHIP_CHECK_PLAN='review-plan: ok' \
    bash "$0" 1142 "$T/wt" >/dev/null 2>&1; rc=$?
  expect 2 "non-JSON output blocks"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' \
    SHIP_CHECK_PLAN='{"ok": true, "code": true, "ux": "sometimes"}' \
    bash "$0" 1142 "$T/wt" >"$T/out" 2>&1; rc=$?
  expect 2 "unsupported ux blocks"
  grep -q "unsupported ux value" "$T/out" || fail "unsupported ux: no message"
  pass=$((pass + 1))

  # Q1: a healthy plan JSON still passes with the same complete records.
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' \
    SHIP_CHECK_PLAN='{"ok": true, "code": true, "ux": "optional", "flags": {}, "reasons": {}, "files": 3}' \
    bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "optional plan JSON passes"
  SHIP_CHECK_TIER='tier=full verify=full merge=locked why=x' \
    SHIP_CHECK_PLAN='{"ok": true, "code": true, "ux": false, "flags": {}, "reasons": {}, "files": 3}' \
    bash "$0" 1142 "$T/wt" >/dev/null; rc=$?
  expect 0 "false plan JSON passes"

  cleanup
  echo "ship-check.sh self-test passed: $pass checks (usage, light, missing VERIFY, review-plan line, FINAL.json, Verdict report, PENDING rejected, ux missing, ux-skip pass/fail, UX.json, plan failure/error JSON/empty/non-JSON/unsupported ux block, optional/false plan passes)"
}

for a in "${1:-}" "${2:-}"; do
  case $a in
    --help|-h) awk '/^set -u/{exit} NR > 1 && /^#/ {sub(/^# ?/, ""); print}' "$0"; exit 0 ;;
    --self-test) self_test; exit $? ;;
  esac
done

[ $# -eq 2 ] || usage
issue=$1
worktree=$2
[ -d "$worktree" ] || { echo "ship-check: worktree $worktree is not a directory" >&2; exit 2; }

if [ -z "${WAVE_BRIEFS:-}" ]; then
  AP_MAIN=${AP_MAIN:-}
  if [ -z "$AP_MAIN" ]; then
    common=$(git -C "$worktree" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && AP_MAIN=$(dirname "$common")
  fi
  WAVE_BRIEFS=${AP_MAIN:+$AP_MAIN/.review/wave}
fi

# tier: tier.sh output line (or the self-test override).
if [ -n "${SHIP_CHECK_TIER:-}" ]; then
  tier_line=$SHIP_CHECK_TIER
  else
  tier_line=$(cd "$worktree" && bash "$SCRIPT_DIR/tier.sh" origin/main HEAD 2>/dev/null) || {
    echo "ship-check: tier.sh failed in $worktree" >&2
    exit 2
  }
fi
tier=light
case "$tier_line" in *'tier=full'*) tier=full ;; esac

# ux: review-plan.py's ux field (or the self-test overrides). The plan is read directly (Q1): a nonzero
# exit, or stdout that is not a JSON with ok:true and a supported ux value, is exit 2 — it must not
# pass as optional.
ux=optional
if [ -n "${SHIP_CHECK_UX:-}" ]; then
  ux=${SHIP_CHECK_UX}
elif [ "$tier" = full ]; then
  if [ -n "${SHIP_CHECK_PLAN+x}" ]; then
    plan=${SHIP_CHECK_PLAN:-} plan_rc=${SHIP_CHECK_PLAN_RC:-0}
  else
    plan=$(cd "$worktree" && python3 "$ENGINE/review-plan.py" "$worktree" --base origin/main --head HEAD 2>/dev/null)
    plan_rc=$?
  fi
  if [ "$plan_rc" -ne 0 ]; then
    echo "ship-check: review-plan.py exited $plan_rc${plan:+: $plan}" >&2
    exit 2
  fi
  plan_out=$(plan_ux "$plan") || {
    echo "ship-check: review-plan.py output unusable (${plan_out}): ${plan:-<empty output>}" >&2
    exit 2
  }
  ux=$plan_out
fi

# VERIFY: $WAVE_STATE/W-<n>-VERIFY.md, $WAVE_BRIEFS/W-<n>-VERIFY.md, or the archived copy.
verify=
verify_locations="${WAVE_STATE:-} ${WAVE_BRIEFS:-} ${WAVE_BRIEFS:+$WAVE_BRIEFS/$issue}"
for base in $verify_locations; do
  [ -n "$base" ] || continue
  if [ -f "$base/W-$issue-VERIFY.md" ]; then
    verify="$base/W-$issue-VERIFY.md"
    break
  fi
done

if [ "$tier" = full ]; then
  if [ -z "$verify" ]; then
    missing "W-$issue-VERIFY.md not found in $verify_locations"
  else
    grep -Eq '^[[:space:]]*review-plan:' "$verify" || missing "no review-plan: line in $verify"
  fi
fi

# review-final record: FINAL.json anywhere it is looked for, or a FINAL report with a filled Verdict line.
final_found=0
for base in $verify_locations; do
  [ -n "$base" ] || continue
  for f in "$base"/W-$issue-FINAL.json; do
    [ -e "$f" ] && final_found=1
  done
  if [ "$final_found" -eq 0 ]; then
    for f in "$base"/W-$issue-FINAL*.md; do
      [ -f "$f" ] || continue
      while IFS= read -r line; do
        value=$(printf '%s' "$line" | sed -n 's/^[[:space:]]*Verdict:[[:space:]]*//p' | tr -d '\r')
        if [ -n "$value" ] && ! printf '%s' "$value" | grep -Eq '^(PENDING|TBD)$'; then
          final_found=1
        fi
      done <"$f"
      [ "$final_found" -eq 1 ] && break
    done
  fi
  [ "$final_found" -eq 1 ] && break
done
[ "$tier" = full ] && [ "$final_found" -eq 0 ] && missing "no review-final record (W-$issue-FINAL.json or a W-$issue-FINAL*.md report with a Verdict: line) in $verify_locations"

# ux record or an ux-skip line whose evidence path exists.
if [ "$ux" = required ]; then
  ux_found=0
  for base in $verify_locations; do
    [ -n "$base" ] || continue
    [ -e "$base/W-$issue-UX.json" ] && ux_found=1
  done
  if [ "$ux_found" -eq 0 ] && [ -n "$verify" ]; then
    skip_path=$(sed -n 's/^[[:space:]]*ux-skip:[[:space:]]*//p' "$verify" | tail -1 | tr -d '\r')
    if [ -n "$skip_path" ]; then
      if [ ! -e "$skip_path" ] && [ ! -e "$worktree/$skip_path" ]; then
        missing "ux-skip path '$skip_path' does not exist"
        ux_found=1 # recorded the finding; do not also ask for a UX record
      else
        ux_found=1
      fi
    fi
  fi
  [ "$ux_found" -eq 0 ] && missing "no UX record (W-$issue-UX.json) and no ux-skip: line in ${verify:-VERIFY (not found)}"
fi

if [ -n "${MISSING:-}" ]; then
  printf '%s\n' "$MISSING"
  exit 1
fi
echo "ship-check: ok (tier=$tier ux=$ux issue #$issue)"
exit 0
