# Lead profile — analytics-platform

Lead-only sections of the conductor profile; workers and reviewers do not read it. Root `AGENTS.md` wins on conflict.

## Lead duties

- **Bot PRs** (Dependabot, `.github/dependabot.yml`): the lead reads the lockfile diff and the PR CI, then merges a green one like any PR. If CI is red, the lead closes it or hands the fix to a worker on the bot branch; a dependency that cannot move gets an `ignore` entry with its reason and a backlog row. Each major upgrade is its own issue. Reason: a lockfile change reruns almost every package, so one weekly bundle costs one PR's CI.
- App `v0.x` tags: at slice start ask once: 'tag when the tag SHA's main-push CI is green?'. If not chosen, ask once, alone, just before the tag. Record the answer on the release issue.
- **Direct edits:** the lead edits light-tier diffs and small-tier diffs of at most 100 changed lines in one package itself; the review the tier requires is unchanged. Larger work, or work after the lead's context has been compacted, goes to a worker. Reason: measured faster than a worker round with the same review yield.
- **Subagents:** retro, audit and data-gathering subagents run at most 2–3 at a time, and one agent judges the result. Reason: gathering fans out, judgment does not.
- **Periodic check:** what the lead reports to the owner is, per open PR, the three `PR guard` numbers (changed lines and files, pushes, scope verdict) and whether the capture link is in the PR body. Board drift and terminal hygiene stay in the tool output. Reason: a check that relays board warnings never showed the lead a fifth fix round or a 1,000-line PR.
- **Idle lanes:** on every lane message and every periodic check, the lead runs `hosts-capacity.sh` and names each lane with no running work. An idle lane on a `start=yes` host gets work that can start now: the next release-scope issue, or the parts of a waiting issue that do not depend on the running one (a security or design review, a regression check, a spec). A dependency between issues sequences their merges, not their starts. Reason: chaining four issues on one lane left the desktop host idle for 8–11 hours of a 22-hour slice.

## Release spec

The lead keeps one file per release, `.planning/releases/<version>.md`: the owner's decisions quoted with dates, the scope issues, an «결정 안 됨» list, and the screen checklist below. The lead re-reads it before every merge. Reason: owner criteria held only in the lead's context are lost at compaction.

The scope section is `## 범위`: the issue numbers the owner picked at release start, as `#n`, plus the release issue. CI reads this section from `main` ([`PROFILE.md`](PROFILE.md) §Size and path, Mechanical caps), so a PR that closes an unlisted issue is red until it carries `owner-ok:scope` (applied by the owner, or by the lead after the owner's yes, [`PROFILE.md`](PROFILE.md) §Size and path) or the number is added here in its own labelled PR. The lead never adds a number on its own; a bug found mid-release goes to the owner as `질문 #n` with the fix size, or waits for the next release. Reason: the scope is the owner's.

## Screen check

Before merging a screen-changing PR the lead looks at its 1440×900 before/after captures and checks six things: the captures are 1440×900; terms and hierarchy match `GLOSSARY.md`; Panel and card frames do not mix on one screen; nothing is cut off, overlapping, or left as empty space after a collapse; nothing changed beyond the owner's decisions in the release spec; every action is a real one-line button labelled for what it does, never bare text or an indented link. Any miss is fixed before merge or becomes an owner question. Reason: a capture nobody looks at before merge catches nothing; bare text or an indented link does not read as an action.

## Request classification

Classification picks the area (PROFILE §Lanes table, for paths and E2E port); the lead assigns the issue to that area's lane.


Take the first match:

1. **Kernel duty** (06 §4 list, `packages/sdk/kernel/AGENTS.md`): contracts/runtime → `lane:sdk`; wiring into the app → `lane:platform`. Changing an 06 contract is an owner decision.
2. **SDK piece:** if the rest is a domain-free part another menu could use once menu-specific parts become menu declarations → `lane:sdk` ([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)).
3. **Menu share:** sample menu → `lane:platform` (touch only what the platform contract needs). Feature consumer/bridge → `lane:features`. EV module → `lane:ev`. In-house menus are not built here: point to `docs/integration/in-house-rollout.md` §5 and close the issue.

- **Mixed request:** split it by class. The SDK issue goes first.
- **Bugs:** go to the lane that owns the confirmed cause, not the symptom.
- **Promotion candidates:** go in `.planning/backlog.md` with their current consumers.

## Slice close

Release order. Reason: once the slice's work is merged, the tag waits only for the main-push CI of its SHA; everything else runs before it or after it.

  1. Alongside the last PRs' reviews, run in parallel: the slice-close `review-quality` (plus the per-slice screen walk-through of [`PROFILE.md`](PROFILE.md) §Pre-go-live if screens changed), the one-off doc audit ([addenda/doc-audit.md](addenda/doc-audit.md), `review-doc`, persona doc-steward), and the release-docs branch. The release-docs branch is built locally and pushed once, after the three checks have reported and their fixes are folded in; open the PR at that push. Reason: each check's fix pushed on its own took the PR past the PR guard's push cap. In that PR, fold the SDK change record (`pnpm sdk:changelog --release X.Y.Z`, then, after building the SDK packages, `pnpm sdk:api --update`) and set consumer packages in `menus/` and `platform/` `ap.sdk` and the gen-menu `SDK_RANGE` to the new SDK range (`menus/AGENTS.md`, `platform/AGENTS.md`); nothing else updates them. If the SDK changes, build the SDK on the PR head (`pnpm sdk:pack --version X.Y.Z --out <d>`, `pnpm sdk:schemas --version X.Y.Z --out <d2>`, `pnpm sdk:consumer-check <d>`).
  2. The tag SHA is the release-docs PR's merge commit. A PR merged after it goes to the next release; never hold the tag for it, and never hold other merges for the tag. Reason: holding merges until the tag left lanes idle for hours, then forced a burst of rebases.
  3. Read the main-push CI run of the tag SHA: `gh run list --workflow ci.yml --event push --commit <sha> --json databaseId,conclusion,headSha`; require `success`. A failure outside the diff (runner network, registry, a known flake) gets one rerun of the failed job, then a fix.
  4. Tag when that run succeeds and no `release-blocker` is open; an open `bug` issue does not hold the tag. Tag `sdk-v*` with the tarballs and a GitHub Release (assets: the nine tarballs, `ap-start-kit-<V>.tgz` and `SHA256SUMS`; `sdk:pack` writes the tarballs, then `node tooling/sdk/sdk-kit.mjs --tarballs <d>` adds the kit and its checksum line and `node tooling/sdk/sdk-kit-check.mjs <d>` checks it), and upload `<d2>/contract-schemas-X.Y.Z.tgz` and `<d2>/SHA256SUMS-schemas` with `gh release upload sdk-vX.Y.Z`. App `v0.x` tags: if the §Lead duties answer is yes, tag on this step without asking again.
  5. After the tag, without holding it: run the real-server suite (`pnpm --filter @ap/platform-e2e run e2e:real`) on a throwaway database, by the procedure in [`apps/platform-e2e/AGENTS.md`](../../apps/platform-e2e/AGENTS.md#procedure), and post the pass/fail counts and the gate table on the release issue. A failing spec is diagnosed (product defect or stale test, [expected-behavior](../../docs/product/expected-behavior/README.md#판단-기준) «판단 기준»); a product defect gets a patch release, a stale test an issue for the next release. Reason: CI does not run it, so stale real specs go unnoticed without it (#1660 answer 3); it checks test upkeep, not the tagged build.
  6. After the tag and the step 5 record (real-server counts and gate table) are on the release-scope issue, the lead closes that issue. Reason: the issue holds the release's records, so it stays open until they are posted, and an open release-scope issue then means only that the release is not finished.

- **Weekly cold run:** once a week, with the Monday Dependabot review, the lead runs `gh workflow run ci.yml --ref main -f full=true`. PR and main-push CI run only what changed (turbo cache; E2E specs picked by `.github/scripts/select-e2e.mjs`, none for server-only PRs; `Platform test` leaves out `@ap/platform-api`, which `integration` runs), so this run is the only whole, cold check. A failure gets a `bug` issue. Reason: a cold run per tag found runner failures, not code defects.
- **Gate table:** after tagging (step 5), the lead posts the table of the global `references/lanes.md` §Gate measurement on the release issue, with two rows: `tier=small` (count and findings of major or worse) and bundles (PRs, issues per PR, median changed source lines, PR CI runs per PR). Add four numbers: median issue-to-merge time, review rounds per PR (median and max), minutes `main` was red, and the share of `start=no` capacity checks. v0.44 baseline: 7.9 h, max 8, 385 min, 9 of 27. The lead re-sizes the [`PROFILE.md`](PROFILE.md) §Size and path bundle limits from the bundle row.
- **SDK release timing:** a lane adds only its `packages/sdk/changes/<issue>.md` fragment. The lead releases the SDK when a fragment (or a leftover `다음 릴리스` row) exists and main CI is green, and at once if a lane is waiting for it.
- **Intro site (paused):** do not update, test, capture or deploy `site/`, and leave it out of release reports and questions; a release does not deploy Pages (manual `workflow_dispatch` only). Reason: the owner will restructure the site later and paused it until then. Reopen: when the owner says to resume the site.

Tag with the full SHA (`git rev-parse origin/main`, `gh release create --target "$SHA"`). `app-preview.py status` must show no tracked previews at the end.
