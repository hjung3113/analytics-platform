# EV ADR history (frozen)

The 16 ADRs of the equipment-visualization (EV) repository, copied unchanged in body when EV merged into the platform ([ADR-0132](../../0132-eqv-merges-into-platform.md), #1607). Each file carries a banner; do not edit them. New EV decisions are written as AP ADRs in `docs/adr/`.

Citation forms: `EV ADR-NNNN` is a file here; bare `ADR-NNNN` is an AP ADR in `docs/adr/`. `EV#N` is an issue or PR of the EV repository; bare `#N` is AP. In the copies, bare `#N` and bare `ADR-NNNN` were rewritten to the EV forms (38 `#N` and 58 `ADR-` references; the ones that cite AP, such as «AP ADR-0010», «analytics-platform #332», «AP #806», were left). Frontmatter `status` is as written in each file (only the ADR number inside was rewritten to `EV ADR-`).

| EV ADR | Title | Status as written | Relation to AP decisions |
| --- | --- | --- | --- |
| [0001](0001-standalone-packages-thin-platform-consumer.md) | Standalone packages are canonical, the platform is a thin consumer | superseded in part by EV ADR-0012 | Placement superseded by AP ADR-0132 (packages live in `packages/eqv/*`); platform independence of `core`/renderer and `--eqv-*` token ownership still hold |
| [0002](0002-occurrence-input-contract.md) | Replay input is a source-paired Occurrence | accepted | Holds; contract owner is `REPLAY-CONTRACT.md` |
| [0003](0003-facet-evidence-levels.md) | Four Evidence Levels, per facet | accepted | Holds |
| [0004](0004-three-layout-graphs.md) | Three separate layout graphs | accepted | Holds |
| [0005](0005-scoped-alias-rules-flattened-mapping.md) | Scoped Alias Rules flattened into an immutable Mapping Version | accepted | Holds |
| [0006](0006-component-footprint-size.md) | Component footprint kept as optional size | accepted | Holds |
| [0007](0007-publish-writes-revision-mapping-baseline-binding.md) | Publish write order, bindings file last | accepted | Holds |
| [0008](0008-platform-design-system-fops-ui.md) | EV screens use the platform design system | accepted | Rule holds (EV UI uses `@ap/ui`); the `@fops/ui` submodule text is superseded by EV ADR-0013 and AP ADR-0132 (workspace dependency) |
| [0009](0009-site-wall-clock-millisecond-precision.md) | Site Wall-clock fixed at millisecond precision | accepted | Holds |
| [0010](0010-studio-data-import.md) | Studio import endpoints, outside the data root | accepted | Holds; Studio now lives in `apps/eqv-studio` (#1613) |
| [0011](0011-replay-resolves-layout-by-revision.md) | Replay resolves Layout by pinned Revision | accepted | Holds |
| [0012](0012-platform-first-sdk-host.md) | Platform is the default host | accepted | Placement and release sections superseded by AP ADR-0132; the host boundary (SDK consumed only in `platform-adapter`) holds |
| [0013](0013-platform-sdk-release-tarballs.md) | Platform SDK consumed as Release tarballs | accepted | Superseded by AP ADR-0132: `@ap/*` are workspace dependencies, no tarball URLs |
| [0014](0014-eqv-release-tarballs.md) | `@eqv/*` published as dist tarballs | accepted | Superseded by AP ADR-0132: `@eqv/*` are workspace packages, no EV release tarballs |
| [0015](0015-template-promotion.md) | Promote a published Layout Revision to a Template | accepted | Holds |
| [0016](0016-holding-site-position.md) | Optional Component-local `position` on a Holding Site | accepted | Holds |

The EV-side list of what AP ADR-0132 replaces is: EV ADR-0001 (placement), 0008 (design-system source), 0012 (host boundary wording), 0013 and 0014 (tarballs).

## Import record

The EV history was imported once with `git filter-repo` (PR #1622, merge `24846c332`, 2026-11-09). The `products/eqv/` copy it created was deleted after the EV repository was archived (2026-10-31, #2208); the commits stay in git history.

- Basis: EV `develop` fdb5fa6 + `main` 43248b7 (the only `main`-only content is one cherry-pick of EV#236, and `develop` has a commit with the same patch-id).
- New hashes (old → new): EV `develop` `fdb5fa6d30561f860205a288100c18b78b94d0b0` → `c25af235bb328893b366d5736532d65cc8e29b34`, EV `main` `43248b75a569cff2f4f04a4d3cf7979780ba406d` → `a8adb675265c9d74a745342f2617f216ecfc40b5`. The merged import tip is `82a3ee67952652309d09b4dd196fe5321e076510`. Apart from the excluded `.claude/` and `HANDOFF.md`, the 452 files at both tips match the originals in path, mode and blob.
- Excluded: `.claude/`, `HANDOFF.md`, and the EV tags (`v0.1.0`, `v0.2.0` and `eqv-v*` collide with AP tags or keep their release files in the EV repository). Commit messages had `#N` rewritten to `EV#N`; file contents were not.

## Open EV issues at absorption

Sixteen EV issues were open on 2026-11-10. Their disposition (imported, carried to a step, backlog or dropped) is owned by the [absorption checklist](../../../design/features/equipment-visualization/absorption-checklist.md) ([ADR-0132](../../0132-eqv-merges-into-platform.md)); this folder keeps only the frozen ADRs.
