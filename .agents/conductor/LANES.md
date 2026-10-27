# Lanes and lead

Several Claude sessions work this repo at once. Each lane session owns one lane and runs issues per [`PROFILE.md`](PROFILE.md). The lead session assigns work, resolves conflicts and releases. Scripts carry the mechanical rules. This file holds only what needs judgment or a fixed protocol. Restructure planned in #1040.

## Lanes

Each open issue has one `lane:*` label. The assignment comment on the issue is the source of truth.

| Label | Owns | Main paths | E2E port |
| --- | --- | --- | --- |
| `lane:sdk` | Public package contracts and parts, analysis workspace, SDK quality | `packages/sdk/*`, `tooling/sdk/`, `docs/contract/`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | App assembly, mock/real adapters, server conformance, sample menus, in-house rollout | `apps/platform-web`, `packages/adapters/{mock-server,http-adapter,server-conformance}`, `menus/*` (not FO bridge menus) | 4590 |
| `lane:arch` | Refactors, folder structure, glossary, boundary lint, CI, doc structure | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:fo` | FeedbackOps | `apps/fo-*`, `packages/fo-*`, `packages/adapters/fo-bridge`, `docs/feedbackops/`, `ops/feedbackops/`, `menus/feedbackops/*`, the FO bridges in `menus/_global/*` | 4390 |
| `lane:ev` | equipment-visualization, AP side | `tools` space, host-module fixtures, EV tarball bumps | 4490 |
| `lane:site` | Intro site | `site/` | 4790 |
| `lane:ops` | Conductor profile, agent assets, owner-requested reports | `.agents/` (not this file), `docs/agents/` | 4990 |
| lead | Assignment, conflicts, release, board | `.planning/`, release notes, this file | 4890 |

Run E2E with `E2E_PORT=<port>` and base-path E2E with `E2E_BASE_PATH_PORT=<port+1>`.

## Request classification (lead)

Take the first match:

1. **Kernel duty** (06 §4 list, `packages/sdk/kernel/AGENTS.md`): contracts/runtime → `lane:sdk`; wiring into the app → `lane:platform`. Changing an 06 contract is an owner decision.
2. **SDK piece:** if the rest is a domain-free part another menu could use once menu-specific parts become menu declarations → `lane:sdk` ([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)).
3. **Menu share:** sample menu → `lane:platform` (touch only what the platform contract needs). FO bridge → `lane:fo`. EV module → `lane:ev`. In-house menus are not built here: point to `docs/integration/in-house-rollout.md` §5 and close the issue.

- **Mixed request:** split it by class. The SDK issue goes first.
- **Bugs:** go to the lane that owns the confirmed cause, not the symptom.
- **Promotion candidates:** go in `.planning/backlog.md` with their current consumers. Promote when 2–3 real consumers exist.

## Shared paths

Any lane may edit these, but first it sends `<lane>: 착수 #n <paths>` to the lead and posts the same line on the issue. The lead checks the paths against open PRs (`gh pr diff <n> --name-only`) and sets the order.

- Public API of `packages/sdk/{contracts,kernel,components,shell}`
- `apps/platform-web/src/menus.ts`, 06 contract docs
- Root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/workflows`
- `apps/platform-e2e`
- The "next release" row in `docs/integration/sdk-git-tag-consumption.md`, the `docs/adr/README.md` table, ADR numbers (reserve them on #598)
- `addenda/traps.md`, `docs/agents/operations.md` (append only)
- The four FO bridge entry lists ([addenda/traps.md](addenda/traps.md))
- `.planning/README.md`: lanes edit only their own issue rows. The lead owns order and layout.

On a rebase, keep both sides of a conflicting table or list row.

## Machine resources

| Rule | How |
| --- | --- |
| Before starting a worker, a lane session or a heavy step | Run `bash .agents/conductor/scripts/capacity.sh`. Start only if `start=yes`. `workers=` and `lanes=` are machine-wide limits. |
| Take any lock or slot | Use `bash .agents/conductor/scripts/with-lock.sh <heavy.lock\|browser.lock\|merge.lock\|worker-slot-N> "<purpose>" -- <command>` in the background. Never `mkdir` a lock by hand: `with-lock.sh` writes the owner, PID and token, and releases on exit. |
| Worker slot | Wrap both the launch and the wait: `with-lock.sh worker-slot-N "<W name> <role>" -- bash -c '<launch> && bash ~/.agents/skills/orca-dispatch-recipes/scripts/worker-wait.sh … --kill-on-timeout'`. `bash -c '…'` sees only exported variables, so `export` `WAVE_STATE` and the names first. The slot frees when the worker ends. On exit 13, send `continue` and wrap again. Wait only through `worker-wait.sh`: a hand-written sentinel wait never ends if the worker dies. |
| `heavy.lock` (one machine-wide) | Root `pnpm test` and `build`, `probe.ts`, FO integration, and a full local `pnpm e2e` (only to reproduce a CI failure — send `<lane>: E2E` at start and end). Narrowed E2E (`-g`) and package checks take no lock. |
| `browser.lock` (one machine-wide) | Preview server, ego-browser, captures, UX review. Take `browser.lock` before `heavy.lock`. |
| `merge.lock` | See [addenda/merge.md](addenda/merge.md). |
| Stale locks | The lead runs `bash .agents/conductor/scripts/lock-audit.sh` at each periodic check and on each `막힘`. On exit 10, it tells the owner `[팀장] <lock> 풀어라`. The owner either releases it (`<lane>: 풀음 <lock>`) or replies `<lane>: 유지 <lock> <evidence>`. After `유지`, leave the lock alone. With no reply in 10 minutes, the lead releases it with `mv <lock> <lock>.released-$$ && trash <lock>.released-$$`. A `merge.lock` whose purpose says `ship` counts as stale only past the `ship-pr.sh` CI cap. |
| Lower capacity stage | Running work is never preempted. Only new starts are blocked. |

## Lane session

1. **Start:** read your brief file. The merge grant is the one written in it. Never use `AskUserQuestion`, because nobody watches this terminal.
2. **Owner decisions** go to the lead as `<lane>: 질문 #n`. These are prototype confirmations, 06 contract changes, deleting tests, 3+ new menu screens, and global tool updates. Park that issue and continue with other work. Decide everything else yourself and record it.
3. **Messages to the lead** (Run messages, send only — never use `run-use`, `check --wait` or `--ack`):
   `orca orchestration send --run <run> --to run:<run> --from "$ORCA_TERMINAL_HANDLE" --type status --subject "<lane>: <병합|막힘|풀음|유지|질문|착수|대기|교대|main 깨짐|E2E> [#n]" --body "<≤3 sentences>"`
4. **Blocked** on a lock or slot for more than 5 minutes: send `<lane>: 막힘 #n <lock>, owner <owner>, since <t>, purpose <p>`.
5. **Prerequisite PR:** wait on it yourself in the background with `timeout <cap> bash -c 'until s=$(gh pr view <n> --json state -q .state); [ "$s" != OPEN ]; do sleep 60; done; echo "$s"'`. On `MERGED`, start. On `CLOSED` or a timeout, ask the lead.
6. **Between assignments:** start the next issue in the assignment comment's order. Run non-overlapping issues in parallel if capacity allows. When nothing is left, send `대기` and launch nothing.
7. **Rotation:** after each assignment, read `ctx:` with `orca terminal read --terminal "$ORCA_TERMINAL_HANDLE" --screen | grep -o 'ctx:[0-9]*%'`.
   - Above 60%: finish the current issue, then rotate.
   - Above 75%: rotate now.
   - To rotate, write `HANDOFF.md` (work in progress, held locks and slots, preview labels, worker names) and send `교대`.
8. **Merge:** per [addenda/merge.md](addenda/merge.md). If main CI goes red after your merge, send `main 깨짐` and fix it. The lead pauses other lanes' merges until then.
9. **Another lane's paths:** before editing a path another lane owns, send `<lane>: 착수 #n <paths>`. The lead sets the order.
10. **Tier:** follow the `tier=` in the assignment comment, and confirm it with `tier.sh` before ship ([PROFILE §Size and path](PROFILE.md)).
11. **New issue:** first run `gh issue list --state all --limit 20 --search "<keywords>"`. If the cause is the same, comment on the existing issue instead.

## Lead

- **Assignment:** label the issue and comment `배정: lane-<lane>, 분류 <Kernel|SDK 조각|SDK 운영|메뉴 몫|없음>, tier=<full|light>, 순서 …`. Set the tier from the planned paths and the Complexity list ([PROFILE §Size and path](PROFILE.md)).
- **Lead → lane:** use terminal input.
  1. Run `orca terminal wait --terminal <h> --for tui-idle`.
  2. Run `orca terminal read --screen`. Do not send if a permission or choice dialog, a feedback draft, or leftover input is on screen.
  3. Send with `orca terminal send --text "[팀장 …] …" --enter`.
  4. A "no turn start was observed" warning is not a failure. Confirm on screen and resend only if the text is missing.
- **Lane → lead:** the single Run. Only the lead runs `run-use` and `check --wait`. Keep `orca orchestration check --run <run> --terminal <lead> --wait --timeout-ms 7000000 --json` running in the background. After each wake, `--ack` the delivery and arm it again, so that `질문`, `막힘` and `main 깨짐` are handled at once, not at the 2 h check. Strip `{"_keepalive"` lines before parsing. On `consumer_fenced` or `waiter_exists`, run `run-use` again (and kill an orphan `orchestration check` process).
- **On messages:**
  - `막힘`: run `lock-audit.sh` in the same wake.
  - `main 깨짐`: pause other lanes' merges until the fix is merged.
  - `교대`: run `/clear` in that terminal, then send "Read <brief> and follow it; resume from HANDOFF.md".
  - `병합`: check `state-<lane>/W-<n>*.json` for the tier's records (full: `impl*` and `review-final`; light: VERIFY has `tier=light` and numstat). If one is missing, send `[팀장] 규칙 #n: <missing>`. Before merge, the lane runs the missing step. After merge, it runs a `review-final` on the merged diff.
- **Lanes:**
  - Spawn: `orca worktree create --name lane-<lane> --base-branch origin/main --agent claude --surface terminal --prompt "Read <brief> and follow it."`. The brief is `$AP_MAIN/.review/lanes/<lane>.md` and holds the label, Run id, merge grant, `AP_MAIN`, `WAVE_STATE=$AP_MAIN/.review/wave/state-<lane>`, and the port.
  - Close a lane after `대기` when it has no workers or previews left.
  - Sessions the owner started count toward `lanes=`. Brief them the same way.
- **Board:** keep goal lines in `LEAD.md` with dependency, owner and state. On every wake, assign each ready line if capacity allows: first to the lane that last touched the area, then to an idle lane, then to a clone lane (port +50).
- **Periodic check (every 2 h):**
  - Run `capacity.sh` and `lock-audit.sh`.
  - Read `gh pr list` and new issues (check for duplicates).
  - Read each lane screen for dialogs and `ctx:`.
  - Confirm the Run coordinator is the lead.
  - Report only the board diff.
- **SDK release timing:** a lane adds only the "next release" row in `docs/integration/sdk-git-tag-consumption.md`. The lead releases the SDK when that row exists and main CI is green, and at once if a lane is waiting for it.
- **Release:**
  1. Run the slice-close `review-quality` (plus a `review-ux` walk-through if screens changed).
  2. Draft the release-docs PR. Do steps 1–2 alongside the last PRs' reviews.
  3. Run a one-off doc audit with the `review-doc` role and [addenda/doc-audit.md](addenda/doc-audit.md). Fold its findings into the release-docs PR.
  4. Run a full cold CI on the SHA to tag: `gh workflow run ci.yml --ref main -f full=true`. PR and main-push CI run only what changed (turbo cache; E2E specs picked by `.github/scripts/select-e2e.mjs`), so this run is the only whole, cold gate. Take the run id from `gh run list --workflow ci.yml --event workflow_dispatch --limit 1 --json databaseId` and require `headSha` = tag SHA and `success`. Rerun it if the SHA moves.
  5. Tag `sdk-v*` with the tarballs and a GitHub Release. Ask the owner before tagging an app `v0.x`. For an app release, the site lane updates `site/`.
- **Lead rotation:** before the skill's session limit, at a quiet point, update `LEAD.md`. A new lead resumes in this order:
  1. this file
  2. `LEAD.md`
  3. `run-use --id <run>`
  4. `check --peek`
  5. `orca terminal list`
  6. re-arm the periodic check
