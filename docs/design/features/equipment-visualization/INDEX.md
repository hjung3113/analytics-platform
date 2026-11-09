# Equipment visualization (EV) — design and contract documents

Moved from the EV repository when EV merged into the platform ([ADR-0132](../../../adr/0132-eqv-merges-into-platform.md), #1607). The documents keep the wording of EV; `#N` and `ADR-` references were rewritten to `EV#N` and `EV ADR-NNNN`. Paths written inside them (`packages/core`, `packages/platform-adapter`, `apps/studio`, `assets/`) are EV-repository paths; the table below gives where the code is now. Other path words inside the documents are history.

## Which document owns which contract

| Document | Owns |
| --- | --- |
| [DESIGN-v0.4](DESIGN-v0.4.md) | Domain model: Catalog, Layout, Topology, Mapping Version, Observations; product goal and non-goals; Studio storage |
| [REPLAY-CONTRACT](REPLAY-CONTRACT.md) | Replay input (Occurrence batch), reducer rules, Evidence Levels, Replay Key, Wall-clock handling |
| [ONBOARDING](ONBOARDING.md) | Inventory → Template proposal → Mapping Board → Publish → Drift; data import |
| [VIEWS](VIEWS.md) | Top View, Focus and Fleet screens, replay layer, view rules |
| [INTEGRATION](INTEGRATION.md) | Host module contract use, declared endpoints, `platform-adapter` (the tarball-install parts are history, see ADR-0132) |
| [ASSET-REVIEW](ASSET-REVIEW.md) | Review of the imported v0.3 asset pack and what was kept |
| [DELIVERY-PLAN](DELIVERY-PLAN.md) | EV delivery slices (history; AP planning is `.planning/`) |
| [RESEARCH](RESEARCH.md) | Background research (reference only) |
| [GLOSSARY](GLOSSARY.md) | EV-only terms; the root `GLOSSARY.md` wins on conflict («EV Occurrence», «EV Template», «EV Coverage») |
| [absorption-checklist](absorption-checklist.md) | What must be true before the EV repository is archived |
| [agents/](agents/domain.md) | Agent notes of the EV repository (issue tracker, labels, domain-doc reading). History: AP uses `docs/agents/`; the EV repository's issue tracker is not used after archive |

Decisions are in [`docs/adr/history/eqv/`](../../../adr/history/eqv/README.md) (frozen, `EV ADR-NNNN`); new EV decisions are AP ADRs.

## Where the implementation lives now

| EV repository path | Here |
| --- | --- |
| `packages/core`, `renderer`, `editor`, `replay`, `ui`, `views`, `platform-adapter` | `packages/eqv/<name>` (`@eqv/<name>`) |
| `assets/` | `packages/eqv/assets` (provenance: `NOTICE.md`) |
| test fixtures | `packages/eqv/fixtures` |
| `apps/studio` | `apps/eqv-studio` (after #1613) |
| `.agents`-style skill `reference-to-semantic-topview` | `.agents/skills/reference-to-semantic-topview` |
| repository rules (`AGENTS.md`) | [`packages/eqv/AGENTS.md`](../../../../packages/eqv/AGENTS.md) |

Stable identifiers: menu `eqv:topview`, permission `eqv:view`, route `/tools/eqv-topview`.

The history copy `products/eqv/` stays until the owner confirms the archive.
