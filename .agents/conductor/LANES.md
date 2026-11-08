# Lanes and lead

Several Claude sessions work this repo at once. Each lane session owns one lane and runs issues per [`PROFILE.md`](PROFILE.md). The lead session assigns work, resolves conflicts and releases. Scripts carry the mechanical rules. This file holds only what needs judgment or a fixed protocol.

## Lanes

Each open issue has one `lane:*` label. The assignment comment on the issue is the source of truth.

| Label | Owns | Main paths | E2E port |
| --- | --- | --- | --- |
| `lane:sdk` | Public package contracts and parts, analysis workspace, SDK quality | `packages/sdk/*`, `tooling/sdk/`, `docs/contract/`, `docs/integration/sdk-*` | 4190 |
| `lane:platform` | App assembly, mock/real adapters, server conformance, sample menus, in-house rollout | `apps/platform-web`, `packages/adapters/{mock-server,http-adapter,server-conformance}`, `menus/*`, `platform/{admin,home,my-activity,notice-voc}` (not screen bridge consumers) | 4590 |
| `lane:arch` | Refactors, folder structure, glossary, boundary lint, CI, doc structure | `tooling/{eslint,gen-menu,tsconfig,css-selectors}`, `.github/workflows`, `docs/INDEX.md`, `docs/AGENTS.md`, `GLOSSARY.md` | 4690 |
| `lane:features` | Platform feature screens and core-server feature domains | `apps/platform-api`, `apps/feature-screens`, `packages/feature-{shared,ui}`, `packages/adapters/feature-bridge`, `ops/platform-api`, `platform/{dashboard,voc,findings,tasks,integration,surveys,feature-admin}`, feature bridges in `platform/{home,my-activity,notice-voc}`; `docs/{product/features,architecture/platform-api,design/features,user-guide/features}` | 4390 |
| `lane:ev` | equipment-visualization, AP side | `tools` space, host-module fixtures, EV tarball bumps | 4490 |
| `lane:site` | Intro site | `site/` | 4790 |
| `lane:ops` | Conductor profile, agent assets, owner-requested reports | `.agents/` (not this file), `docs/agents/` | 4990 |
| lead | Assignment, conflicts, release, board | `.planning/`, release notes, this file | 4890 |

Run E2E with `E2E_PORT=<port>` and base-path E2E with `E2E_BASE_PATH_PORT=<port+1>`.

## Request classification (lead)

Take the first match:

1. **Kernel duty** (06 §4 list, `packages/sdk/kernel/AGENTS.md`): contracts/runtime → `lane:sdk`; wiring into the app → `lane:platform`. Changing an 06 contract is an owner decision.
2. **SDK piece:** if the rest is a domain-free part another menu could use once menu-specific parts become menu declarations → `lane:sdk` ([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)).
3. **Menu share:** sample menu → `lane:platform` (touch only what the platform contract needs). Feature consumer/bridge → `lane:features`. EV module → `lane:ev`. In-house menus are not built here: point to `docs/integration/in-house-rollout.md` §5 and close the issue.

- **Mixed request:** split it by class. The SDK issue goes first.
- **Bugs:** go to the lane that owns the confirmed cause, not the symptom.
- **Promotion candidates:** go in `.planning/backlog.md` with their current consumers. Promote when 2–3 real consumers exist.

## Start coordination paths

(Not `scripts/shared-paths.sh`: that list decides the merge path, this one decides who must be told before editing.) Any lane may edit these, but first it sends `lane-send.sh 착수 <#n> "<paths>"` and posts the same line on the issue. The lead runs `shared-overlap.sh --paths <paths>` (open PR file lists) and sets the order.

- Public API of `packages/sdk/{contracts,kernel,components,shell}`
- `apps/platform-web/src/menus.ts`, 06 contract docs
- Root `package.json`, `pnpm-lock.yaml`, `turbo.json`, `.github/workflows`
- `apps/platform-e2e`
- The "next release" row in `packages/sdk/CHANGELOG.md`, the `docs/adr/README.md` table, ADR numbers (reservation: [addenda/traps.md](addenda/traps.md))
- `addenda/traps.md`, `docs/agents/operations.md` (append only)
- The four screen bridge entry lists ([addenda/traps.md](addenda/traps.md))
- `.planning/README.md`: lanes edit only their own issue rows. The lead owns order and layout.

## Machine resources

| Rule | How |
| --- | --- |
| Before starting a worker, a lane session or a heavy step | Run `bash .agents/conductor/scripts/capacity.sh`. Start only if `start=yes`. `workers=` and `lanes=` are machine-wide limits. |
| Take any lock or slot | Use `bash .agents/conductor/scripts/with-lock.sh <heavy.lock\|browser.lock\|merge.lock\|worker-slot-N> "<purpose>" -- <command>` in the background. Never `mkdir` a lock by hand: `with-lock.sh` writes the owner, PID and token, and releases on exit. |
| Worker slot | `with-lock.sh worker-slot-N "<W name> <role>" -- bash -c 'python3 $ENGINE/launch-worker.py …; rc=$?; while [ $rc -eq 12 ]; do bash ~/.claude/skills/orca-dispatch-recipes/scripts/worker-wait.sh --state <json>; rc=$?; done; exit $rc'`. The slot is held only while the wrapped command runs, so a timeout checkpoint (12) re-waits inside it. Exit 13/14 also returns with the worker alive: answer it, then re-wait under the same slot name (`with-lock.sh` exit 75 = taken; wait for it). Reason: a released slot lets another lane start a worker over the machine limit. `export` `ENGINE`, `WAVE_STATE` and the names first if you use `bash -c`. `worker-wait.sh` closes a done worker's terminal. |
| `heavy.lock` (one machine-wide) | Root `pnpm test` and `build`, `probe.ts`, screen integration, and a full local `pnpm e2e` (only to reproduce a CI failure — send `<lane>: E2E` at start and end). Narrowed E2E (`-g`) and package checks take no lock. |
| `browser.lock` (one machine-wide) | Preview server, ego-browser, captures, UX review. Take `browser.lock` before `heavy.lock`. When the browser step ends, close its ego tabs, and quit ego lite (`osascript -e 'quit app "ego lite"'`) if no one else holds `browser.lock`. Reason: an idle ego lite kept ~2.4 GB on a machine already swapping. |
| `merge.lock` | See [addenda/merge.md](addenda/merge.md). |
| Stale locks | The lead runs `bash .agents/conductor/scripts/lock-audit.sh` at each periodic check and on each `막힘`. On exit 10, it tells the owner `[팀장] <lock> 풀어라`. The owner either releases it (`<lane>: 풀음 <lock>`) or replies `<lane>: 유지 <lock> <evidence>`. After `유지`, leave the lock alone. With no reply in 10 minutes, the lead releases it with `mv <lock> <lock>.released-$$ && trash <lock>.released-$$`. A `merge.lock` whose purpose says `ship` counts as stale only past the `ship-pr.sh` CI cap. |
| Lower capacity stage | Running work is never preempted. Only new starts are blocked. |
| Lane hosts (owner 2026-11-07) | Lanes and workers may run on any paired Orca host listed in `$AP_MAIN/.review/lanes/hosts.tsv` (local file). Limits, `start=` and `heavy.lock`/`browser.lock` are **per host**. The lead runs `bash .agents/conductor/scripts/hosts-capacity.sh` (also inside `lead-check.sh`) before every lane spawn and on every wake, and places a new lane on the host with `start=yes` and the most `free`, preferring the host where its area's DB/preview already runs. A lane's workers stay on the lane's host. Reason: one machine's limit capped the slice; the second host doubles it only if both are measured. |
| Remote host ramp | A newly added host starts at **lanes ≤ 2, workers ≤ 4** whatever its stage says. Raise it to its `capacity.sh` limits after 3 logged measurements (`capacity-log.tsv`) taken while it ran at the ramp ceiling stay green with no swap growth; drop back one step on any yellow/red. Record each limit change as one line in `LEAD.md` with the log lines it rests on. A host's own ceilings are set in its shell env (`CAPACITY_GREEN_WORKERS`/`_LANES`, `CAPACITY_YELLOW_*`, read by `capacity.sh`); owner 2026-11-08 raised the 16-core WSL host to 10 workers / 6 lanes. Reason: `capacity.sh` limits are tuned for the 16 GB Mac and the remote's real per-worker cost is unmeasured. |

## Lane session

1. **Start:** read your brief file (shape: [addenda/lane-brief.md](addenda/lane-brief.md)) and only the sections it names. The merge grant is the one written in it. Never use `AskUserQuestion`, because nobody watches this terminal.
2. **Owner decisions** go to the lead as `<lane>: 질문 #n`. These are prototype confirmations, 06 contract changes, deleting tests, 3+ new menu screens, and global tool updates. Park that issue and continue with other work. Decide everything else yourself and record it.
3. **Messages to the lead:** `bash .agents/conductor/scripts/lane-send.sh <병합|막힘|풀음|유지|질문|착수|대기|교대|main 깨짐|E2E> <#n|-> "<≤3 sentences>"`. It fixes the subject and Run format and sends only. Never use `run-use`, `check --wait` or `--ack`.
4. **Blocked** on a lock or slot for more than 5 minutes: send `<lane>: 막힘 #n <lock>, owner <owner>, since <t>, purpose <p>`.
5. **Prerequisite PR:** wait on it yourself in the background with `timeout <cap> bash -c 'until s=$(gh pr view <n> --json state -q .state); [ "$s" != OPEN ]; do sleep 60; done; echo "$s"'`. On `MERGED`, start. On `CLOSED` or a timeout, ask the lead.
6. **Between assignments:** start the next issue in the assignment comment's order. Run non-overlapping issues in parallel if capacity allows. When nothing is left, send `대기` and launch nothing.
   - After every wait result, in the same turn, launch the next work or send `대기 #n <blocker|none>` (blocker: capacity, file overlap, dependency or owner gate). A dependency wait is a `대기`, not silence. Reason: an idle lane is invisible to the lead until the 2 h check.
   - A re-review covers only the fix diff and the findings still open; never re-ask earlier rounds' checklists. Reason: re-asking every round makes each round as long as the first.
   - A placement or shape question found in review goes to a `?variant=` prototype (PROFILE §Review) before more fix rounds. Reason: fix rounds that explore placement repeat a review cycle per guess.
   - A minor or nit never starts another review round: fix it inline and merge (PROFILE §Size and path). A major or blocker that needs a round past the cap goes to the lead as `질문 #n 한도 <rounds>` (PROFILE §Size and path).
7. **Rotation:** after each assignment run `bash .agents/conductor/scripts/lane-rotate.sh`. On `rotate=after-issue`, finish the current issue, then rotate. On `rotate=now`, rotate now. To rotate, write `HANDOFF.md` (work in progress, held locks and slots, preview labels, worker names) and send `교대`.
8. **Merge:** per [addenda/merge.md](addenda/merge.md), on every path: `merge-precheck.sh`, merge, then `main-ci-watch.sh <merge sha>` in the background. The watch sends `main 깨짐` and writes the `main-red` marker itself; you fix main. `merge-precheck.sh` refuses every other merge (exit 4) until a fix PR merges with `--main-fix` and the watch clears the marker.
9. **Another lane's paths:** before editing a path another lane owns, send `착수` the same way. The lead sets the order.
10. **Tier:** follow the `tier=` in the assignment comment, and confirm it with `tier.sh` before ship ([PROFILE §Size and path](PROFILE.md)).

## Lead (팀장)

- **Scope beats keeping lanes busy.** Assign only work in the current release's scope (`board.py ready`); an idle lane is fine, unscoped work is not. Starting a line of another release needs the owner's words (`board.py set … --owner-ok`).
- **Judge state from command output, not screen text.** `lead-check.sh`, `board.py`, `gh` and `ps`/`lsof` decide whether a lane or worker is alive; a screen only tells you about dialogs.
- **Assignment:** label the issue and comment `배정: lane-<lane>, 분류 <Kernel|SDK 조각|SDK 운영|메뉴 몫|없음>, tier=<full|light>, 순서 …`. Set the tier from the planned paths and the Complexity list ([PROFILE §Size and path](PROFILE.md)).
- **Lead → lane:** use terminal input.
  1. Run `orca terminal wait --terminal <h> --for tui-idle`.
  2. Run `orca terminal read --screen`. Do not send if a permission or choice dialog, a feedback draft, or leftover input is on screen.
  3. Send with `orca terminal send --text "[팀장 …] …" --enter`.
  4. Send/keepalive warnings: see `orca-dispatch-recipes`.
- **Lane → lead:** the single Run. Only the lead runs `run-use` and `check --wait`. Keep `orca orchestration check --run <run> --terminal <lead> --wait --timeout-ms 7000000 --json` running in the background; after each wake, `--ack` and arm it again. On `consumer_fenced` or `waiter_exists`, run `run-use` again (and kill an orphan `orchestration check` process).
- **Event triggers.** The lead re-allocates on events, not on a timer; the 2 h check is only a safety net. Every handler ends with the re-allocation step (RA):
  - **RA:** for the lane the event touches, and for every idle lane (`lead-check.sh` prints an `idle-lane` finding; an open Orca terminal or a `running` state JSON alone does not make a lane alive), name the next work and send it, or name the blocker (capacity, file overlap, dependency, owner gate). Ready work is `board.py ready` (planned lines of the board's release), the plan graph and the assignment order — nothing else. Work for a later release or the backlog is never assigned: the lane gets `대기`, or closes, and the next slice starts only after the release ships and the owner sets its scope (owner, 2026-11-06). Start nothing new while `capacity.sh` says `start=no`; record `capacity` as the blocker. Close a lane only when the board has no planned line in its area.
  - **T1 `병합`:** check `state-<lane>/W-<n>*.json` for the tier's records (full: `impl*` and `review-final`; light: VERIFY has `tier=light` and numstat). If one is missing, send `[팀장] 규칙 #n: <missing>`; before merge the lane runs the missing step, after merge it runs a `review-final` on the merged diff. Then RA. The main-CI watch is the lane's (`main-ci-watch.sh` after every merge on every path, [addenda/merge.md](addenda/merge.md)); the lead does not run a second one. A red main CI pauses merges, not starts.
  - **T2 main CI green:** RA for lanes whose board line waits on that PR or node. A stacked branch rebases only after its own worker or reviewer has finished — never under a running review.
  - **T3 `대기 #n <blocker|none>`:** RA for that lane in the same wake. A dependency on an in-flight branch → tell the lane to stack on it (PROFILE §Launch).
  - **T4 a lane's last live worker ends** (`lead-check.sh` shows the lane idle): same as T3.
  - **T5 `질문 #n 한도 <rounds>`:** decide in the same wake — one more round with the reason recorded as `over-cap:`, a split, or the owner.
  - **T6 `질문` with an Artifact:** before forwarding, check that capture pixel sizes match their labels (`sips -g pixelWidth -g pixelHeight`); forward in the same wake.
  - **T7 owner answer:** record it on the issue and send it to the lane in the same wake.
  - **T8 the last planned PR of the slice opens:** start the slice-close `review-quality` once, on `<last tag>..main` plus the open PRs, under the load guard (§Machine resources). Reason: a half-way run plus a delta run costs two runs and loses the cross-PR view.
  - **T9 `막힘`:** run `lock-audit.sh` in the same wake. **`main 깨짐`:** the `main-red` marker already stops other lanes' merges (`merge-precheck.sh`); make sure the fix is assigned. **`교대`:** run `/clear` in that terminal, then send "Read <brief> and follow it; resume from HANDOFF.md".
- **Lanes:**
  - Spawn: `orca worktree create --name lane-<lane> --base-branch origin/main --agent claude --surface terminal --prompt "Read <brief> and follow it."`. The brief is `$AP_MAIN/.review/lanes/<lane>.md` and holds the label, Run id, merge grant, `AP_MAIN`, `WAVE_STATE=$AP_MAIN/.review/wave/state-<lane>`, and the port.
  - **Remote lane** (a second machine paired in Orca, e.g. environment `desktop`): spawn with `orca worktree create --environment desktop --repo path:<its clone> …`, the same brief copied to that clone's `.review/lanes/<lane>.md`, and `LANE_ORCA_ENV=<the lead machine's environment name on that host>` in the brief's Env line so `lane-send.sh` reaches the lead's Run. Its `WAVE_STATE`, board reads and capacity are that host's own (`capacity.sh` measures Linux too); the lead reads its screen with `orca terminal read --environment desktop`. `lead-check.sh` asks every host in `hosts.tsv` for `orca worktree ps`, so a remote lane's state is checked like a local one; its state dir, board lines and workers stay on that host and are not read. Lead → lane messages use `orca terminal send --environment desktop`. Reason: the Run lives on the lead's machine; a remote handle may send to it.
  - Close a lane after `대기` when it has no workers or previews left: close its terminal and remove its worktree in the same step. Reason: a leftover lane worktree still counts as a lane in `lead-check.sh` and reads as a stall.
  - **Cleanup (owner 2026-11-08):** a lane removes an issue's worktree, local branch, issue DB and previews in the same turn as its merge, and closes a finished worker's terminal as soon as it has read the result. A prototype worktree goes after the owner confirms: move its captures to `$AP_MAIN/.review/wave/<n>/proto/` first, and keep it only while an active brief still names it (then remove it when that implementation merges). Hosts without `trash` move discarded folders to `~/.local/share/Trash/files/`. Reason: finished tabs and worktrees piled up across eight lanes on two hosts.
  - Sessions the owner started count toward `lanes=`. Brief them the same way.
- **No-lane mode** (the lead runs the issues itself with workers): the PROFILE loop and the periodic check run unchanged; the `run-use`/`check --peek` resume steps run only when a Run exists.
- **Board:** `$AP_MAIN/.review/lanes/board.json`, managed with `python3 .agents/conductor/scripts/board.py` (schema, commands and the release rules: `board.py --help`). `LEAD.md` keeps only free-form notes. Nothing migrates automatically; the lead seeds the board. On every wake, assign each line from `board.py ready` if capacity allows: first to the lane that last touched the area, then to an idle lane, then to a clone lane (port +50).
- **Periodic check (every 2 h, armed with CronCreate; a safety net for missed events):** run `bash .agents/conductor/scripts/lead-check.sh` and act on every finding it prints (exit 10); it measures every lane host, so read each `host=` line and rebalance new starts (§Machine resources «Lane hosts»). Read the first line (`lanes seen N/M`) first: a `host-unknown` finding or `N < M` means lanes were not seen, which is not «all clear». Then read `gh pr list` and new issues for duplicates, and report only the board diff.
- **Stall watch (every 10 min):** `bash .agents/conductor/scripts/lead-check.sh --nudge` (cron on the lead's machine; the owner approves the crontab entry). It nudges an idle lane once per idle interval and wakes the lead once per `blocked-lane`, `monitoring-lane`, `gone-lane` or `host-unknown` finding. Reason: a lane cannot wake itself when its notifications stop or a dialog blocks it, and the 2 h check is too slow to catch that.
- **Board `updated` is progress, not editing:** `board.py set` refreshes `updated` only when `state`, `pr` or `worker` changes, so fixing a line's `next` does not silence the stale alarm; `board.py check` also alarms when a release with unfinished lines has had no line reach `done` for 4 h.
- **SDK release timing:** a lane adds only the "next release" row in `packages/sdk/CHANGELOG.md`. The lead releases the SDK when that row exists and main CI is green, and at once if a lane is waiting for it.
- **Release:**
  1. Run the slice-close `review-quality` (plus a `review-ux` walk-through if screens changed).
  2. Draft the release-docs PR. Do steps 1–2 alongside the last PRs' reviews. In it, set consumer packages in `menus/` and `platform/` `ap.sdk` and the gen-menu `SDK_RANGE` to the new SDK range (`menus/AGENTS.md`, `platform/AGENTS.md`); (nothing else updates them).
  3. Run a one-off doc audit with [addenda/doc-audit.md](addenda/doc-audit.md) (`review-doc`, persona doc-steward, as its work order says). Fold its findings into the release-docs PR.
  4. Run a full cold CI on the SHA to tag: `gh workflow run ci.yml --ref main -f full=true`. PR and main-push CI run only what changed (turbo cache; E2E specs picked by `.github/scripts/select-e2e.mjs`), so this run is the only whole, cold gate. Take the run id from `gh run list --workflow ci.yml --event workflow_dispatch --limit 1 --json databaseId` and require `headSha` = tag SHA and `success`. Rerun it if the SHA moves.
  5. Tag `sdk-v*` with the tarballs and a GitHub Release; at tag time also run `pnpm sdk:schemas --version X.Y.Z --out <empty-or-absent-schemas-dir>` and `gh release upload sdk-vX.Y.Z <schemas-dir>/contract-schemas-X.Y.Z.tgz <schemas-dir>/SHA256SUMS-schemas`. Ask the owner before tagging an app `v0.x`. For an app release, the site lane updates `site/`.
- **Lead rotation (팀장 이어받기):** before the skill's session limit, at a quiet point, update `LEAD.md`. A new lead resumes in this order, before any HANDOFF checklist, and reads `PROFILE.md` in full before the first launch (lead only; lanes read the named sections):
  1. `bash .agents/conductor/scripts/lead-check.sh` — machine, locks, wave state and board; act on every finding it prints
  2. this file
  3. `LEAD.md` (free-form notes only; the board is `board.json`)
  4. `run-use --id <run>`
  5. `check --peek`
  6. `orca terminal list`
  7. `CronList`: delete any earlier lead's periodic check, then re-arm one. Liveness comes from `lead-check.sh` output only; an open terminal alone does not make a lane or worker alive.
