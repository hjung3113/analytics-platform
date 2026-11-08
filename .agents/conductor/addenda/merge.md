# Merge procedure (lane sessions)

Read this only when you merge a PR. Merges run one at a time machine-wide. CI runs in parallel.

## Every path

1. **Ship check:** `bash .agents/conductor/scripts/ship-check.sh <issue> <worktree>` (`WAVE_STATE` exported). Chain the merge on it with `&&`. On exit 1, run the missing record step first ([PROFILE §Size and path](../PROFILE.md)).
2. **Precheck:** `bash .agents/conductor/scripts/merge-precheck.sh <pr> <branch> <head-sha>` immediately before the merge (inside `merge.lock` on the short-lock path). Exit 4: main CI is red or `main-red` exists; merge only the fix, with `--main-fix`. Exit 3: rebase, then CI again.
3. **Merge**, then **watch main:** `bash .agents/conductor/scripts/main-ci-watch.sh <merge sha>` in the background, with `LANE_NAME` set. It sends `main 깨짐` when that run is red, and sets the marker from the newest main run (red writes, green clears; a run still going keeps a red). After re-running a red run, start the watch again. It changes into `AP_MAIN` itself, so any cwd works, even a worktree you remove right after. You fix a red main.
4. **After:** confirm the issue is closed, archive `.review/` to `$WAVE_BRIEFS/<n>/`, clean up the worktree and terminal, delete the remote branch, and for a planned graph run `plan-graph.py mark`.

## Which merge

| PR touches | Merge |
| --- | --- |
| A shared path (list: `scripts/shared-paths.sh`) | **Locked ship:** hold `merge.lock` through CI, and run the precheck in the lock right before the merge (see below). `ship-pr.sh` neither calls the precheck nor accepts `--main-fix`, so do not give it `--merge`. |
| Anything else | **Short lock:** `ship-pr.sh --branch … --base main --title … --body-file …` without `--ci`/`--merge`; wait for the head's CI outside the lock (every check in `gh pr checks <n> --json name,bucket` passes, feature checks included, an empty list is not a pass); then |

```bash
export PRN=<n> BR=<branch> SHA=<head sha>
bash .agents/conductor/scripts/with-lock.sh merge.lock "$PRN merge" -- bash -c 'bash .agents/conductor/scripts/merge-precheck.sh "$PRN" "$BR" "$SHA" && gh pr merge "$PRN" --squash --match-head-commit "$SHA"'
```

Locked ship, in the background (`PRN`/`BR` are the PR number and branch; add `--main-fix` to the precheck for the fix PR). Main can turn red while the lock waits on CI, so the gate runs after CI, on the final head:

```bash
export PRN=<n> BR=<branch>
bash .agents/conductor/scripts/with-lock.sh merge.lock "$PRN ship" -- bash -c 'ship-pr.sh … --ci && SHA=$(gh pr view "$PRN" --json headRefOid --jq .headRefOid) && bash .agents/conductor/scripts/merge-precheck.sh "$PRN" "$BR" "$SHA" && gh pr merge "$PRN" --squash --match-head-commit "$SHA"'
```

- exit 75 (lock held) → retry. Merge refused for a conflict → rebase and ship again.
- A locked ship that ends with exit 20/21/22 releases the lock; fix the problem, then ship again.
- A CI job that failed on a diagnosed flake (the cause is identified and not in the PR) gets one rerun of the failed job only (`gh run rerun <run-id> --failed`), then `gh run watch <run-id>`; a second failure is a real failure to diagnose, not another rerun. Reason: rerunning the whole workflow repeats the cold jobs, and repeated reruns hide a real regression.
