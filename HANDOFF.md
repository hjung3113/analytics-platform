# HANDOFF — lane ev (#1607 absorb EV repo, release v0.34.0)

Written 2026-11-10 by the outgoing lane session. Treat as history; verify state first (`plan-graph.py status`, `gh pr list`, `git log origin/main`).

## Read first
- Brief: `$AP_MAIN/.review/lanes/ev.md` (limits, merge grant, reporting via `lane-send.sh` only; env: AP_MAIN, CONDUCTOR_MAIN=/home/hjung/orca/projects/analytics-platform, WAVE_STATE=$AP_MAIN/.review/wave/state-ev, WAVE_BRIEFS=$AP_MAIN/.review/wave, LANE_NAME=ev, LANE_RUN=run_cc75190f8433, LANE_ORCA_ENV=mac; export each on its own line — zsh expands `export A=x B=$A` before assigning).
- Plan: `$AP_MAIN/.review/1607-plan.md` (graph; `python3 ~/.agents/skills/issue-wave-conductor/scripts/plan-graph.py status <plan>`), plan review `.review/1607-plan-review.md`, ADR-0132 on main, checklist `docs/design/features/equipment-visualization/absorption-checklist.md`.
- Merge hold is lifted (v0.32.0 tagged at 8253baabf). Merge grant: after CI and review green, merge and report. Squash except #1622 (done, merge commit). Do NOT archive/delete/change the EV repo.

## State (graph nodes -> issues)
- Merged: 1607a #1609 (PR #1616 ADR-0132), 1607d #1612 (PR #1619 lint presets), 1607b #1610 (PR #1622 history under `products/eqv`, merge commit), 1607c #1611 (PR #1623 core+renderer to `packages/eqv`, src exports).
- Ready next: **1607c2 #1618** (replay, ui, views, editor, platform-adapter -> `packages/eqv/*`). Then 1607e #1613 (Studio -> `apps/eqv-studio`), 1607f #1614 (platform-web -> workspace:*; remove tarball URLs, peerDependencyRules exception, vite inline; fix `scripts/prod-graph.ts` mock-data match for `/packages/eqv/platform-adapter/src/mock-data/` with a negative test; verify=full), 1607g #1615 (docs, EV ADR history to `docs/adr/history/eqv`, GLOSSARY merge, skill, CODEOWNERS, AP ADR amendments; the `lane:ev` PROFILE.md row is the lead's — report by lane-send).
- After the last node: `lane-send.sh 대기 - "<one sentence>"`. Steps 4-11 of the owner plan are NOT started and need the owner's confirmation (do not start).

## Method that worked (per node)
1. Verify facts on origin/main, write brief `$WAVE_BRIEFS/<id>-task.md` (sections Facts / Do / Invariants / Impact / Acceptance / `Sentinel (last line of .review/W-<id>-REPORT.md): <!-- W-<id>-DONE -->`), companions into `$WAVE_BRIEFS`.
2. `plan-graph.py mark <plan> <id> active`, then `with-lock.sh worker-slot-N "<purpose>" -- bash -c 'python3 $ENGINE/launch-worker.py <id> <slug> ...'` (role impl-complex; ENGINE=~/.agents/skills/issue-wave-conductor/scripts). Mechanical git mv can be done by the lane first and the worker launched with `--reuse` after naming the worktree branch `feat/<id>-<slug>` (launcher checks the branch name). `capacity.sh` must say start=yes (it was blocked by CPU load once; poll).
3. Worker leaves changes uncommitted (AP rule); lane commits, pushes, opens PR (body: Part of #1607, Closes #node; ends with the Claude Code line). Review: `review-plan.py`, write `.review/W-<id>-FINAL-TASK.md` in the worktree (copy 00-REVIEW-RULES.md, brief, plan), launch `worker-launch.sh --role review-final ...` under `with-lock.sh worker-slot-2`; one fix round, then merge through `with-lock.sh merge.lock ... merge-precheck.sh && gh pr merge --squash --match-head-commit`. `mark <id> merged --pr N` (a todo node must be `mark ... active` first), `lane-send.sh 병합`.
- Reviews found real issues each time (turbo test inputs for shared assets, bare `#N` leftovers, lockfile churn from version pins). Keep dependency versions aligned with AP (jsdom ^26.1.0, react ^19.3.0, vite ^7.3.6, vitest ^3.2.7); zod 4.6.5 only in @eqv/core.
- CI notes: GitHub sometimes never schedules E2E shard 3/4 or 4/4 or the Platform test job (`Platform contracts (E2E)` / `Platform workspace` then fail): rerun with `gh run rerun <id> --failed` or push an empty commit. `tooling/eslint feature.test.ts` flake is #1437. A red `main` push CI blocks merge-precheck (MAIN-RED); rerun the main run if it is the same infra symptom.
- Scratchpad tools (may be gone): venv with git-filter-repo and `rehearse.sh` under the old scratchpad; no longer needed (history merge done).

## Open threads / decisions recorded
- Plan review follow-ups, not nodes: P11 `@source` scan of tests in package stylesheets; P12 zod 4 vs zod 3 shared schema (server slice).
- 1607d started with `--force --note` (ADR dependency was docs-only). Decided ambiguous terms: `발행` (not 게시), release number `v0.34.0`.
- Pending owner-facing: nothing queued as `질문`. EV archive is the owner's call after the checklist is true.

## Held resources
- No locks held. Worktrees: `lane-ev` (this one, detached/clean except this file), `1607c-eqv-core-renderer` (merged; remove it: `orca worktree rm` / ship cleanup), `1607d-eqv-lint-presets` (merged; remove). Orca terminals of finished workers were closed by worker-wait. Stale `worker-slot-*.released-*` dirs in `$AP_MAIN/.review` are harmless (trash missing on WSL).
