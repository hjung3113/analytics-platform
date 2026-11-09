# AGENTS.md — packages/eqv

Equipment-visualization (EV) domain packages: a reusable semantic equipment Top View and an explainable log replay. Merged into this repository by [ADR-0132](../../docs/adr/0132-eqv-merges-into-platform.md); the EV ADRs are frozen history in [`docs/adr/history/eqv/`](../../docs/adr/history/eqv/README.md), cited as `EV ADR-NNNN`. The root `AGENTS.md` and [`packages/AGENTS.md`](../AGENTS.md) apply here; on conflict they win.

## Contracts and terms

- Design and contracts: [`docs/design/features/equipment-visualization/INDEX.md`](../../docs/design/features/equipment-visualization/INDEX.md) says which document owns which contract (model, Replay, Onboarding, Views, Integration). Read the one you change before editing code.
- Terms: root `GLOSSARY.md`. EV words that collide with AP words are qualified «EV …» there; use the qualified form in prose that could be read as AP. Reason: «Occurrence» and «Template» mean different things in the two products.
- Citations: `EV ADR-NNNN` and `EV#N` are EV history; bare `ADR-NNNN` and `#N` are AP.
- Distinguish Proposed design from implemented behaviour. A design decision that breaks a format or API gets an AP ADR first.

## Package boundaries

- `core` and `renderer` import no `@ap/*`. Reason: the domain model and renderer must build and test without the platform (EV ADR-0001, kept by ADR-0132).
- `editor`, `replay`, `ui`, `views`, `platform-adapter` and `apps/eqv-studio` import only `@ap/ui` and `@ap/contracts`; never `@ap/kernel`, `@ap/shell` or `@ap/components`. The boundary lint (`tooling/eslint`, `eqv-packages.js`) enforces it. Reason: one design system, no dependency on Kernel internals.
- Only `platform-adapter` reads the host port. It reads data through declared `defineEndpoint` endpoints with `host.query`; no domain methods are added to the host contract. Reason: auth, Scope, time, route, context, permissions and audit stay with the platform.
- Import another package only through its `package.json` `exports`. Dependencies are `workspace:*`; there are no tarball URLs.
- A UI pattern `@ap/ui` lacks (dense table, evidence badge, time slider) gets an EV component in `@eqv/ui` built on `@ap/ui` primitives and tokens, then screens use it. No screen-local restyling. Reason: the platform design system stays the only source of look.

## Domain invariants

- Source of truth is Catalog + Layout + Topology + MappingVersion + Observations, never a flattened SVG.
- Geometry and connectivity are different data. Never infer a physical port or robot trajectory from visual adjacency (EV ADR-0004, EV ADR-0006).
- Robot arm count and blade count are independent; uncertain kinematics is `unknown`.
- Preserve stable IDs, units, layers, ports, semantic groupings, schema versions and data provenance.
- Replay labels every facet (location, material identity, start, end) `observed`, `derived`, `illustrative` or `unknown` (EV ADR-0003). Visual interpolation is never log evidence.
- Replay consumes source-paired Occurrences ordered by Record Sequence and never pairs Start/End itself (EV ADR-0002).
- Site Wall-clock is exactly `YYYY-MM-DDTHH:mm:ss.fff`; other precision is rejected, never truncated (EV ADR-0009).
- If a domain rule conflicts with a generic framework habit, the domain rule wins.

## Data and fixtures

- Synthetic data only: no company-confidential reference images, logs, secrets or private network addresses. Prefer tests on the six generalized equipment archetypes over claims of OEM-faithful depiction. Reason: the data is committed to a shared repository.
- Assets (templates, primitives, synthetic equipment, layouts, observations, onboarding files) are in `packages/eqv/assets` (provenance: `assets/NOTICE.md`); test fixtures are in `packages/eqv/fixtures`. Sanitized, permissioned internal data belongs in a separate deployment layer, not here.
- Asset or schema changes: validate XML/JSON, unique IDs, valid port endpoints and levels, no hierarchy cycles, viewBox, no executable SVG content, snapshots.

## Stable identifiers

- Keep `eqv:topview` (menu id), `eqv:view` (permission) and `/tools/eqv-topview` (route) unchanged. Reason: they are linked and stored by users and other menus; renaming them is a decision-level change (root `AGENTS.md`, UI test B).

## Tests and checks

- Run from the repo root: `pnpm --filter @eqv/<pkg> run lint|typecheck|test` for the package you changed; the Studio and the platform spec follow the root `AGENTS.md` verification section (`eqv.spec.ts` in `apps/platform-e2e` with `pnpm exec playwright test -g "<describe>"`).
- Replay changes cover: deterministic reducer, ties, open Occurrences (`end=null`), Data Quality Issues, Time Anomalies, Watermark and Binding boundaries, invalid mappings, duplicate wafer occupancy, evidence fidelity.
- UI changes: check in the browser, keyboard and a11y, and compare side by side with a platform screen of the same kind; default browser controls fail it.
- Behaviour changes and bug fixes: write the failing test first. Test behaviour, not implementation; one test per concept, `it.each` for variants; no tests of trivial passthrough. Reason: test code is a liability.
- Docs-only changes run `pnpm docs:links` only.
