# Lead profile — analytics-platform

Lead-only sections of the conductor profile. The lead reads this file and [`PROFILE.md`](PROFILE.md) §Flow, §Lanes and §Owner gates and questions; lanes and reviewers do not read it. Root `AGENTS.md` wins on conflict.

## Lead duties

- **Bot PRs** (Dependabot, `.github/dependabot.yml`: one grouped npm minor/patch PR and one GitHub Actions PR each Monday): the lead reads the lockfile diff and the PR CI, then merges a green one like any PR. If CI is red, the lead closes it or hands the fix to `lane:arch` on the bot branch; a dependency that cannot move gets an `ignore` entry with its reason and a backlog row. Majors are never opened by the bot: each is its own issue. Reason: a lockfile change reruns almost every package, so one weekly bundle costs one PR's CI.
- The lead updates `.planning/README.md` once, in the release-docs PR. Mid-slice progress is `board.py` output.
- App `v0.x` tags: at slice start ask once: 'tag when the tag SHA's main-push CI is green?'. If not chosen, ask once, alone, just before the tag. Record the answer on the release issue.

## Request classification

Take the first match:

1. **Kernel duty** (06 §4 list, `packages/sdk/kernel/AGENTS.md`): contracts/runtime → `lane:sdk`; wiring into the app → `lane:platform`. Changing an 06 contract is an owner decision.
2. **SDK piece:** if the rest is a domain-free part another menu could use once menu-specific parts become menu declarations → `lane:sdk` ([ADR-0052](../../docs/adr/0052-rich-content-stays-in-the-sdk.md)).
3. **Menu share:** sample menu → `lane:platform` (touch only what the platform contract needs). Feature consumer/bridge → `lane:features`. EV module → `lane:ev`. In-house menus are not built here: point to `docs/integration/in-house-rollout.md` §5 and close the issue.

- **Mixed request:** split it by class. The SDK issue goes first.
- **Bugs:** go to the lane that owns the confirmed cause, not the symptom.
- **Promotion candidates:** go in `.planning/backlog.md` with their current consumers. Promote when 2–3 real consumers exist.

## Slice close

Release order. Reason: once the slice's work is merged, the tag waits only for the main-push CI of its SHA; everything else runs before it or after it.

  1. Alongside the last PRs' reviews, run in parallel: the slice-close `review-quality` (plus the per-slice screen walk-through of [`PROFILE.md`](PROFILE.md) §Pre-go-live if screens changed), the one-off doc audit ([addenda/doc-audit.md](addenda/doc-audit.md), `review-doc`, persona doc-steward), and the release-docs PR. In that PR, fold the SDK change record (`pnpm sdk:changelog --release X.Y.Z`, then, after building the SDK packages, `pnpm sdk:api --update`) and set consumer packages in `menus/` and `platform/` `ap.sdk` and the gen-menu `SDK_RANGE` to the new SDK range (`menus/AGENTS.md`, `platform/AGENTS.md`); nothing else updates them. If the SDK changes, build the SDK on the PR head (`pnpm sdk:pack --version X.Y.Z --out <d>`, `pnpm sdk:schemas --version X.Y.Z --out <d2>`, `pnpm sdk:consumer-check <d>`).
  2. The tag SHA is the release-docs PR's merge commit. A PR merged after it goes to the next release; never hold the tag for it, and never hold other merges for the tag. Reason: holding merges until the tag left lanes idle for hours, then forced a burst of rebases.
  3. Read the main-push CI run of the tag SHA: `gh run list --workflow ci.yml --event push --commit <sha> --json databaseId,conclusion,headSha`; require `success`. A failure outside the diff (runner network, registry, a known flake) gets one rerun of the failed job, then a fix.
  4. Tag when that run succeeds and no `release-blocker` is open; an open `bug` issue does not hold the tag. Tag `sdk-v*` with the tarballs and a GitHub Release (assets: the nine tarballs, `ap-start-kit-<V>.tgz` and `SHA256SUMS`, as `sdk:pack` writes them), and upload `<d2>/contract-schemas-X.Y.Z.tgz` and `<d2>/SHA256SUMS-schemas` with `gh release upload sdk-vX.Y.Z`. App `v0.x` tags: if the §Lead duties answer is yes, tag on this step without asking again.
  5. After the tag, without holding it: run the real-server suite (`pnpm --filter @ap/platform-e2e run e2e:real`) on a throwaway database, by the procedure in [`apps/platform-e2e/AGENTS.md`](../../apps/platform-e2e/AGENTS.md#procedure), and post the pass/fail counts and the gate table on the release issue. A failing spec is diagnosed (product defect or stale test, [expected-behavior](../../docs/product/expected-behavior/README.md#판단-기준) «판단 기준»); a product defect gets a patch release, a stale test an issue for the next release. Reason: CI does not run it, so stale real specs go unnoticed without it (#1660 answer 3); it checks test upkeep, not the tagged build.

- **Weekly cold run:** once a week, with the Monday Dependabot review, the lead runs `gh workflow run ci.yml --ref main -f full=true`. PR and main-push CI run only what changed (turbo cache; E2E specs picked by `.github/scripts/select-e2e.mjs`, none for server-only PRs; `Platform test` leaves out `@ap/platform-api`, which `integration` runs), so this run is the only whole, cold check. A failure gets a `bug` issue. Reason: a cold run per tag cost 20–42 minutes per release and found runner failures but no code defect.
- **Gate table:** after tagging (step 5), the lead posts the table of the global `references/lanes.md` §Gate measurement on the release issue, with two rows: `tier=small` (count and findings of major or worse) and bundles (PRs, issues per PR, median changed source lines, PR CI runs per PR). The lead re-sizes the [`PROFILE.md`](PROFILE.md) §Size and path bundle limits from the bundle row.
- **SDK release timing:** a lane adds only its `packages/sdk/changes/<issue>.md` fragment. The lead releases the SDK when a fragment (or a leftover `다음 릴리스` row) exists and main CI is green, and at once if a lane is waiting for it.
- **Intro site:** updating `site/` is not a release step; site changes ship as their own PRs when the owner asks. The tag still triggers the Pages deploy of the tagged tree. Reason: the owner decides when the intro site changes; tying it to every release added a step the release did not need.

Tag with the full SHA (`git rev-parse origin/main`, `gh release create --target "$SHA"`). `app-preview.py status` must show no tracked previews at the end.
