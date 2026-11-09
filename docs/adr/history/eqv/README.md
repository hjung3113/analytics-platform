# EV ADR history (frozen)

The 16 ADRs of the equipment-visualization (EV) repository, copied unchanged in body when EV merged into the platform ([ADR-0132](../../0132-eqv-merges-into-platform.md), #1607). Each file carries a banner; do not edit them. New EV decisions are written as AP ADRs in `docs/adr/`.

Citation forms: `EV ADR-NNNN` is a file here; bare `ADR-NNNN` is an AP ADR in `docs/adr/`. `EV#N` is an issue or PR of the EV repository; bare `#N` is AP. In the copies, bare `#N` and bare `ADR-NNNN` were rewritten to the EV forms (39 `#N` and 59 `ADR-` references; the ones that cite AP, such as «AP ADR-0010», «analytics-platform #332», «AP #806», were left). Frontmatter `status` is as written in each file (only the ADR number inside was rewritten to `EV ADR-`).

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

## Open EV issues at absorption, not migrated

Open in the EV repository on 2026-11-10 (16). Moving or closing them belongs to the archive step ([absorption checklist](../../../design/features/equipment-visualization/absorption-checklist.md) condition 6) and is the owner's call. Numbers are `EV#N`.

- EV#239 Top View material marker overlap W11 (follow-up of EV#236)
- EV#187 SDK deferred
- EV#184 Polish deferred
- EV#177 Wrap-up and platform integration as an SDK
- EV#170 Layout assembly deferred
- EV#169 Custom part SVG, ADR proposal
- EV#160 Layout edit deferred
- EV#153 Journey deferred
- EV#146 Replay UI deferred
- EV#134 Replay UI deferred
- EV#105 Import deferred
- EV#91 Conductor preview tooling port
- EV#60 Studio deferred
- EV#3 M2 Replay
- EV#2 M1 Standalone Studio
- EV#1 M0 Design

Not migrated: not implemented. Reopen condition: the owner decides at archive time; the deferred trackers go to `.planning/backlog.md` or close, EV#239 becomes an AP issue.
