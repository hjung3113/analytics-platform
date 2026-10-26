#!/usr/bin/env bash
# 713b: prototypes/ -> archive/ (idempotent). Re-run after rebasing onto changes that mention prototypes/.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ -d prototypes ] && git mv prototypes archive
git grep -lI 'prototypes/kernel-' -- . ':!pnpm-lock.yaml' ':!.agents/conductor/moves' ':!*.log' ':!docs/adr/0090-repo-structure-by-branch.md' | xargs -r perl -pi -e 's#(^|[^A-Za-z0-9_-])prototypes/(?=kernel-)#$1archive/#g'
