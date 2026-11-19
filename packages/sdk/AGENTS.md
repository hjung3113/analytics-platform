# SDK change notes and release baselines

For public SDK changes, write `changes/<issue>.md`: one or more four-cell rows in the same form as the [change log](CHANGELOG.md), with `다음 릴리스 (#<issue>)` matching the filename. Include the affected packages, public behavior and consumer migration guidance; escape pipes inside cells with `\|`. Run `pnpm sdk:changelog --check`.

PRs leave `CHANGELOG.md` and `tooling/sdk/api/*.api.txt` unchanged so parallel SDK changes do not conflict on shared release files.

Package-specific guides below this folder still own package rules.
