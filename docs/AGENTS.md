# docs/ — platform design documents

The source of product and platform contracts. Check here what is decided before touching code. Entry point: [INDEX.md](INDEX.md) (reading paths per task). Remaining work and plans live in [`.planning/`](../.planning/README.md), not here.

## Ownership

- `contract/platform-ui-contract.md` (index, cross-area principles, governance, definition of done, and the «절 → 문서» table) and the per-area `contract/{kernel,components,chart,layout,cross-menu-links}.md`: global contracts and navigation IA. § numbers form one numbering system across the split documents; other documents consume them.
- `architecture/`: `01` data contract and operating policy, `03` backend, `04` frontend stack and review. `product/`: `02` domain catalog, `17` platform requirements, `existing-systems.md` (MARS·CLAS·BRAVO background). `overview/`: `00` overview, `05` list of contract decisions without an ADR. `design/`: `07` shell, `14`–`16` drill-down, multi-workspace, analysis board. Sample-menu contract notes (`08`, `09`, `11`–`13`) live in each menu's `docs/`. Number shorthands map to files in [INDEX.md](INDEX.md).
- `adr/`: decisions chosen among real alternatives, with reasons. List and format: [adr/README.md](adr/README.md). Detailed rules live in the owning document; the ADR links to it.
- `integration/`: repo structure, package boundaries, server and feature-screen connection contracts. `agents/`: issue-tracker setup and agent operations notes. `research/`, `reviews/`: still-useful investigation and evidence records, not authoritative sources.
- `guides/`: reader-specific step-by-step guides (usage and commands only; rules stay in the owning document, which the guide links to). Server run guide: `ops/platform-api/docs/release/run-guide.md`; per-package intros: each `packages/sdk/*/README.md`. Map: `design/guide-doc-map.md`.
- Feature docs: product intent and fields in `product/features/`; core-server and API contracts in `architecture/platform-api/`; cross-package feature designs in `design/features/`; current task instructions in `user-guide/features/`. Server internals are in `apps/platform-api/docs/`, feature-screen documents in `apps/feature-screens/docs/`, runbooks in `ops/platform-api/docs/release/`. For feature-domain implementation read `agents/feature-implementation.md`.
- `adr/history/feedbackops/`, `design/history/feedbackops-prototype/`, `user-guide/history/feedbackops/` and the former local-development README are frozen references, not live design sources. Navigation and superseding decisions are indexed in `integration/feature-history.md`.

## ADR numbering

- Platform ADRs are `ADR-NNNN`; historical feature ADRs (`docs/adr/history/feedbackops/`) are `FO ADR-NNNN`. The two number spaces overlap, so never cite a historical feature ADR without the prefix in platform documents or code comments (`pnpm docs:adr-citations` fails a bare `ADR-00NN` ≤ 0072 under the feature paths).
- Choose the next ADR number by this one procedure (other documents link to this line): `bash tooling/scripts/next-adr.sh` reads only the local tree, so fetch and compare `origin/main`, check open branches and worktrees, then reserve the chosen number by writing it in #598.

## Rules

- Keep the status words Decided / Candidate / Open / Deferred. Do not decide an Open item on your own. When it is decided, fix the source document and add one line to the `adr/README.md` table (ADR) or the `05` table (non-ADR). Questions that need an answer go in `.planning/`.
- Change a contract in its owning document only; other documents link to it. Never copy the same rule into several documents.
- Put a document in the folder of the scope it covers. One package/app/menu: that folder's `docs/` (outside `src/`, because Tailwind reads strings in `src/` as classes). Design or contract several packages follow: root `docs/`. Reason: whoever edits the code finds it beside the code. Move records of finished work to the same area's `history/` and state at the top that it is a past record.
- When a document and code disagree, find out which is right, then fix it. Do not report a document comparison as runtime verification.
- Keep no process records in documents (worker reports, review rounds, handoff history, "previously …" narration). Git history, issues and PRs carry them.
- After changing a document, run `pnpm docs:links` (relative link and anchor check).
- Design a new screen by `.agents/skills/analysis-platform-wireframe/SKILL.md`.
