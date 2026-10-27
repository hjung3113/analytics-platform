# Merge procedure (lane sessions)

Read this only when you merge a PR. Merges run one at a time machine-wide. CI runs in parallel.

## Which path

| PR touches | Path |
| --- | --- |
| A shared path: `tooling/sdk/api/`, `packages/sdk/{contracts,kernel,components,shell}/package.json`, root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/workflows/`, `apps/platform-e2e/` | **Locked ship:** `bash .agents/conductor/scripts/with-lock.sh merge.lock "<n> ship" -- <ship-pr.sh … --ci --merge …>` (run in background). The lock is held through CI. |
| Anything else | **Short lock:** steps 1–4 below. CI runs outside the lock. |

## Short lock (until conductor-engine#150 adds `--merge-lock`)

1. **Create:** run `ship-pr.sh --branch … --base main --title … --body-file …` without `--ci`, `--merge`, `--issue`, `--worktree`, `--archive-review`.
2. **Wait:** run `gh pr checks <n> --watch --fail-fast` in the background with a time cap. Then confirm that every check in `gh pr checks <n> --json name,bucket` passes.
3. **Merge:** first check outside the lock that the latest main push CI is not failing. Then:
   ```bash
   export PRN=<n> BR=<branch> SHA=<head sha>
   bash .agents/conductor/scripts/with-lock.sh merge.lock "$PRN merge" -- bash -c 'git fetch -q origin main && if git diff --name-only "$(git merge-base origin/main "$BR")" origin/main | grep -qE "^(tooling/sdk/api/|package\.json$|packages/sdk/(contracts|kernel|components|shell)/package\.json$|pnpm-lock\.yaml$|turbo\.json$|\.github/workflows/|apps/platform-e2e/)"; then echo REBASE-NEEDED; exit 3; fi; gh pr merge "$PRN" --squash --match-head-commit "$SHA"'
   ```
   - exit 3 → rebase, then restart at step 2.
   - exit 75 (lock held) → retry step 3 from the main-CI check.
   - merge refused for a conflict → restart at step 1.
4. **After:** watch the main push run. If it is red, send `<lane>: main 깨짐` and fix it. Then confirm the issue is closed, archive `.review/` to `$WAVE_BRIEFS/<n>/`, clean up the worktree and terminal, and delete the remote branch.

If a locked ship ends with exit 20/21/22, the lock is released when `with-lock.sh` exits. Fix the problem, then ship again.
