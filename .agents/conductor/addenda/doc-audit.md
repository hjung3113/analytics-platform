# Pre-release document audit — reviewer work order

Under [`LANES.md`](../LANES.md) §Lead, the lead uses this file to create a one-time reviewer's (`review-quality`) work order for release step 3. The first line must be "Read `~/.agents/agents/review-quality.md` and follow it as your role definition". If this work order conflicts with the persona, follow this work order. Read-only `gh issue view|list` and `gh pr view` are allowed. The reviewer writes only the report and does not edit files. The lead puts fixes in the release-docs PR (site findings go in the site PR).

## Inputs for the lead

- Version: `sdk-vX.Y.Z` or `vX.Y.Z`
- Range: `<previous tag>...HEAD`
- Final review report: `<path>`
- Release-docs PR branch (draft): `<branch>` (also include the site PR branch for app releases)

## Scope

Do not scan all of `docs/`. Review only: ① changed documents in the range (`git diff --name-only <range> -- '*.md'`); ② owner documents referenced by code changes in the range (each component in the change record → section 06 → package `AGENTS.md`); and ③ entry documents (root `AGENTS.md`, `docs/INDEX.md`, `docs/AGENTS.md`, `.planning/README.md`).

## Review checklist

1. **Navigation.** Can an agent reach an owner document in three steps: the "Where to start" table in root [`AGENTS.md`](../../../AGENTS.md) → the task-specific reading path in [`docs/INDEX.md`](../../../docs/INDEX.md) → the owner document? Follow that path for each contract and component changed in this release. Report broken paths and paths using old names.
2. **Stale documents.** Check whether the range still presents closed issues, superseded ADRs, missing paths, or removed components as current facts (`gh issue view <n> --json state`, `git ls-files`, and `rg`). For documents that are no longer needed (completed investigations or retired-flow notes), propose deletion, archiving, or moving them to `docs/research/`. The lead asks the owner before deleting.
3. **Contents and ownership.** Does each contract appear in only one place, as required by the ownership table in [`docs/AGENTS.md`](../../../docs/AGENTS.md) (no conflicting versions of the same rule)? Does `docs/INDEX.md` match the actual file structure? Are folder `AGENTS.md` files paired with `CLAUDE.md` symlinks?
4. **Process history.** Do contract documents contain worker reports, review rounds, or "previously ..." narratives (`docs/AGENTS.md` rules)?
5. **Release docs.** Do the current-version change-log row and board release row in the release-docs PR draft match the merged PRs in the range? Also check the site PR draft for app releases.

## Report

This format takes precedence over the persona's slice-report format. `## Summary` (no more than 25 lines, `Verdict: ready|fix-before-release`, table `ID | Category (navigation|staleness|contents and ownership|process history|release docs) | file:line | problem | proposal`), `## Patch` (Replace/With), and `## Details`. Group deletion proposals separately. Do not write "probably" without evidence; list the commands used to verify.
