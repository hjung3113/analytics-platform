#!/bin/zsh
# launch-worker.sh <issue> <slug> — Orca worktree from origin/main → branch feat/<issue>-<slug>, FeedbackOps submodule +
# pnpm install, close the setup shells, write the task (implementation rules + $WAVE_BRIEFS/<issue>-task.md) into
# .review/, then delegate launch and worker state to the shared worker-ops script.
# WORKER_ROLE defaults to impl; impl-mid, impl-complex and impl-fallback select the routing.tsv rows of those names.
# Optional WORKER_MODEL / WORKER_EFFORT override the shared routing.tsv for this session.
# Optional PRE_ADD='<pnpm filter> <pkg@exact> [...]' installs dependencies before the worker starts (workers have no
# network; FeedbackOps s70). pnpm may reformat package.json arrays: check the diff before committing.
# Needs: WAVE_STATE, WAVE_BRIEFS, AP_MAIN (main checkout path).
: "${WAVE_STATE:?}"; : "${WAVE_BRIEFS:?}"; : "${AP_MAIN:?}"; set -u
# The script cds into the new worktree, so a relative dir would silently resolve there (FeedbackOps Slice 46: three
# workers launched with an empty task). Resolve the dirs first.
WAVE_BRIEFS=${WAVE_BRIEFS:A}; WAVE_STATE=${WAVE_STATE:A}; AP_MAIN=${AP_MAIN:A}
N=$1; SLUG=$2
SHARED_LAUNCH=$HOME/.claude/skills/orca-dispatch-recipes/scripts/worker-launch.sh
[ -f "$SHARED_LAUNCH" ] || { echo "Missing shared launcher: $SHARED_LAUNCH (install orca-dispatch-recipes worker-ops scripts)" >&2; exit 2; }
[ -f "$WAVE_BRIEFS/$N-task.md" ] || { echo "Missing brief: $WAVE_BRIEFS/$N-task.md" >&2; exit 2; }
W=$HOME/orca/workspaces/analytics-platform/$N-$SLUG
orca worktree create --repo path:"$AP_MAIN" --name "$N-$SLUG" --base-branch origin/main --issue "$N" --setup skip --json >/dev/null 2>&1 || { echo "worktree create failed"; exit 1; }
cd "$W" || exit 1; git branch -m "feat/$N-$SLUG"; mkdir -p .review
# orca's setup does not install dependencies here (docs/agents/operations.md "새 worktree와 pnpm").
git submodule update --init --depth 1 -q -- products/feedbackops || { echo "submodule init failed"; exit 1; }
pnpm install --frozen-lockfile --config.optimistic-repeat-install=false > .review/install.log 2>&1 || { echo "pnpm install failed (see .review/install.log)"; exit 1; }
for h in $(orca terminal list --worktree path:"$W" --json 2>/dev/null | grep -o 'term_[a-z0-9-]*' | sort -u); do orca terminal close --terminal "$h" >/dev/null 2>&1; done
if [ -n "${PRE_ADD:-}" ]; then
  pa=(${=PRE_ADD})
  pnpm --filter "${pa[1]}" add --save-exact --config.confirmModulesPurge=false "${(@)pa[2,-1]}" < /dev/null > .review/pre-add.log 2>&1 \
    || { echo "PRE_ADD failed (see $W/.review/pre-add.log)"; exit 1; }
fi
# The shared launcher reads only the task; put the rules pointer first so its final sentinel stays the last line.
{ printf 'Read docs/agents/templates/impl-rules.md first and follow it.\n\n'; cat "$WAVE_BRIEFS/$N-task.md"; } > ".review/W-$N-TASK.md"
args=(--role "${WORKER_ROLE:-impl}" --cwd "$W" --task "$W/.review/W-$N-TASK.md"
  --report "$W/.review/W-$N-REPORT.md" --sentinel "<!-- W-$N-DONE -->" --name "W-$N"
  --state-dir "$WAVE_STATE")
[ -n "${WORKER_MODEL:-}" ] && args+=(--model "$WORKER_MODEL")
[ -n "${WORKER_EFFORT:-}" ] && args+=(--effort "$WORKER_EFFORT")
bash "$SHARED_LAUNCH" "${args[@]}"
