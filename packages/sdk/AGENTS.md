# SDK change notes and release baselines

For public SDK changes, write `changes/<issue>.md`: one or more four-cell rows in the same form as the [change log](CHANGELOG.md), with `다음 릴리스 (#<issue>)` matching the filename. Include the affected packages, public behavior and consumer migration guidance; escape pipes inside cells with `\|`. Run `pnpm sdk:changelog --check`.

Read the built API diff in the CI summary or locally with `pnpm sdk:api --report`. PRs leave `CHANGELOG.md` and `tooling/sdk/api/*.api.txt` unchanged so parallel SDK changes do not conflict on shared release files.

The release lead folds notes and refreshes API baselines together, following [Slice close](../../.agents/conductor/PROFILE.md#slice-close). Package-specific guides below this folder still own package rules.
