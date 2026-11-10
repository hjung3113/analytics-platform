# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Evidence, Coverage, Links, and integration recovery queues. It is the UI home for feature linking behavior, but does not own source object lifecycles or backend authorization truth. Finding screens and hooks live in `features/findings/`.

## Route Boundary

Code ownership and URL mount are not the same thing here:

- Owns both code and URL for Links, at `/integration/links`.
- Owns both code and URL for Coverage, at `/integration/coverage` (screen `features/integration/routes/CoverageScreen.tsx`, entry `operator-screens/coverage`).
- Owns the Integration Action Dashboard at `/integration` (screen `features/integration/routes/IntegrationDashboardScreen.tsx`, entry `operator-screens/integration-dashboard`).
- Owns Evidence at `/integration/evidence` (FO ADR-0065), a read-only ListShell with independent selected-detail reads.
- Findings is mounted at top-level `/findings` and owned by `features/findings/` (the platform bridge owns registration). The standalone `/findings/$findingId` redirect is retired (#597).
- Home may link into Integration-owned surfaces with selected object and action intent.

## Invariants

- Missing-link queues are policy-driven, not automatic guilt for every unlinked record.
- Visibility must respect backend-provided link summaries and permission states.

## Rules

- Coverage must be labeled as partial integration coverage.
- Link views must not imply arbitrary graph editing beyond approved relation types.
- Cross-system creation flows must preserve source context and return users to the original work surface when appropriate.
- Entity-link rows accept Entity Link DTOs only; VOC Cluster member presentation belongs to `features/voc-cluster/components/detail/VocClusterMemberRow.tsx`.

## Key files

Paths are relative to `apps/feature-screens/src/`.

- `features/integration/routes/integration-search.ts` — the four 연동 search schemas (dashboard, evidence, coverage, links) and their per-key validators, router-free; the platform bridge imports them directly.
- Test-only routes under `test/screen-host/routes/_authed/integration/` (`index.tsx`, `coverage.tsx`, `links.tsx`, `evidence.tsx`) mount the four surfaces with URL search validation (Evidence strict).
- `features/integration/routes/EvidenceScreen.tsx` — Evidence inventory and safe detail reconciliation (entry `operator-screens/evidence`); the panel is `ClosableDetailParts` rendered by the host.
- `features/integration/api/evidence-inventory.ts` — parsed read clients and `evidenceInventoryQueryKey()`, returning the shared `EVIDENCE_INVENTORY_QUERY_KEY` from `lib/query/evidence-inventory-key.ts` that Finding attachments (54-5) invalidate.
- `features/integration/routes/IntegrationDashboardScreen.tsx` — action dashboard (entry `operator-screens/integration-dashboard`); the selected recovery item is handed to the host as parts and rendered in place. Its test route composes it with route-local navigate; the route schema's `history` preprocess keeps `history=true` a boolean.
- `features/integration/recovery/useRecoveryQueueCore.tsx` — router-free recovery queue core and its seam adapter; the retired Home adapter exists only under `test/host-adapters` for retained behavior tests.
- `test/screen-host/features/integration/routes/CoverageRoute.tsx` — composes `CoverageScreen` (entry `operator-screens/coverage`; standalone `InternalLink` anchors); the screen holds coverage columns, labels and coverage states.
- `test/screen-host/features/integration/routes/LinksRoute.tsx` — composes `LinksScreen` (entry `operator-screens/entity-links`; owns its `ListShell`; the search box writes the `q` page key and the server searches readable endpoint titles and display IDs, #1374; the rows carry no checkbox, #1368); the screen holds Links list filters, tabs and selected state.
- `lib/copy/home.ts` — shared wording used by Coverage.
- `lib/copy/permission-reasons.ts` — shared blocked copy used by the link inventory.

## Verification

- When touched: missing-link queue behavior, coverage labels, link visibility states, deep-link action restore.

## Close-out contract (FO ADR-0067)

- Recovery composition lives in `recovery/`; `public.ts` exposes it to Home. Integration owns recovery composition; source routes own full workflows. The existing three shells remain.
- Scope/category/selection/hidden/history/return intent restores via URL; a readable resolved selection stays open. Render backend actions/visibility/hints without response identity leaks.
- Offer personal snooze (1/7 days), current-occurrence mute, hidden view/restore; refresh shared queries after source repairs.
- Coverage renders server bands and the neutral `no_data` state — no local rules. Server `computed_at`, last successful refresh and stale display are implemented on Coverage, Home and Integration; queue/detail clocks are independent.

## Analytics Area report (FO ADR-0069)

- Coverage's PageShell is extended with URL-backed `view=areas`; the default overview omits `view`.
- Keep Managed System/Area/paging state and source destinations per `docs/routes-and-layout.md` (under `apps/feature-screens/docs/`).
- Render unavailable, zero, zero-denominator, loading/error/denial separately; no stale prior-scope counts.
- Operational positive counts link to exact typed source filters; repairs remain on owning source routes.
- The secondary Area-tab link is on the existing Integration Coverage card; no new Admin/rail surface.

## Evidence inventory (FO ADR-0064/0065)

`/integration/evidence` is a read-only ListShell inventory of stored highlights across readable Findings. Findings owns `GET /evidence-highlights` and `GET /evidence-highlights/:id`; Survey owns the FO ADR-0064 safe projection. Integration renders only authorized DTOs, never raw links/private bindings/audit JSON or response URLs.

- URL keys, detail restoration and states: `apps/feature-screens/docs/routes-and-layout.md`.
- Eligibility-before-search/pagination: `docs/architecture/platform-api/api/findings.md`.
- Rows/panel identify the owning Finding; primary `Finding 보기` opens its detail and Back preserves Evidence context. Editing/attachment/execution remains in Finding detail, using #816's candidate/attach APIs. No standalone model, Unlinked tab or coverage KPI.
- Reuse Korean chrome/source labels and the shipped shell density; the prototype is a reference under FO ADR-0060. Verify desktop 1440, keyboard/focus, withheld/denied/empty/error and later-page selected detail before delivery by the conductor.
- Preserve ordinary Links/Coverage, VOC source/reporter rules and authored notes.
