# Integration Feature Agent Guide

#597: paths below describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/feature-bridge`; standalone routes and `*Route` compositions are retired. Adapters under `src/test` are test-only.

## Ownership

Integration owns frontend route composition for Evidence, Coverage, Links, and integration recovery queues.

It is the UI home for FeedbackOps linking behavior, but it does not own source object lifecycles or backend authorization truth.

Finding screens and hooks live in `apps/feature-screens/src/features/findings/`.

## Route Boundary

Code ownership and URL mount are not the same thing here:

- Owns both code and URL for Links, at `/integration/links`.
- Owns both code and URL for Coverage, at `/integration/coverage` (screen `features/integration/routes/CoverageScreen.tsx`, entry `operator-screens/coverage`).
- Owns the Integration Action Dashboard at `/integration` (screen `features/integration/routes/IntegrationDashboardScreen.tsx`, entry `operator-screens/integration-dashboard`).
- Owns Evidence at `/integration/evidence` (ADR-0065), a read-only ListShell with independent selected-detail reads.
- Findings is mounted at top-level `/findings` and owned by `apps/feature-screens/src/features/findings/`
  (the platform bridge owns registration). The standalone `/findings/$findingId` redirect is retired (#597).
- Home may link into Integration-owned surfaces with selected object and action intent.

## Invariants

- Missing-link queues are policy-driven, not automatic guilt for every unlinked record.
- Visibility must respect backend-provided link summaries and permission states.

## Rules

- Coverage must be labeled as partial integration coverage.
- Link views must not imply arbitrary graph editing beyond approved relation types.
- Cross-system creation flows must preserve source context and return users to the original work surface when appropriate.

## Key files

- `apps/feature-screens/src/features/integration/routes/integration-search.ts` — the four 연동 search schemas (dashboard, evidence, coverage, links) and their per-key validators, router-free; the platform bridge imports them directly.
- `apps/feature-screens/src/test/screen-host/routes/_authed/integration/index.tsx` — Integration dashboard route.
- `apps/feature-screens/src/test/screen-host/routes/_authed/integration/coverage.tsx` — Coverage route and URL search validation.
- `apps/feature-screens/src/test/screen-host/routes/_authed/integration/links.tsx` — Links route and URL filters.
- `apps/feature-screens/src/test/screen-host/routes/_authed/integration/evidence.tsx` — strict Evidence URL search validation.
- `apps/feature-screens/src/features/integration/routes/EvidenceScreen.tsx` — Evidence inventory and safe detail reconciliation (bridge-safe, entry `operator-screens/evidence`; the panel is `ClosableDetailParts` rendered by the host).
- `apps/feature-screens/src/test/screen-host/features/integration/routes/EvidenceRoute.tsx` — composes `EvidenceScreen` under the default host and frames the parts in the standalone detail slot.
- `apps/feature-screens/src/features/integration/api/evidence-inventory.ts` — parsed read clients and `evidenceInventoryQueryKey()`, which returns the shared `EVIDENCE_INVENTORY_QUERY_KEY` from `lib/query/evidence-inventory-key.ts` that Finding attachments (54-5) invalidate.
- `apps/feature-screens/src/features/integration/routes/IntegrationDashboardScreen.tsx` — Integration action dashboard (bridge-safe, entry `operator-screens/integration-dashboard`; the selected recovery item is handed to the host as parts and rendered in place).
- `apps/feature-screens/src/test/screen-host/features/integration/routes/IntegrationDashboardRoute.tsx` — composes the screen for `/integration` (route-local navigate; the route schema's `history` preprocess keeps `history=true` a boolean; frames the parts in the standalone detail slot).
- `apps/feature-screens/src/features/integration/recovery/useRecoveryQueueCore.tsx` — router-free recovery queue core and its seam adapter; the retired Home adapter now exists only under `src/test/host-adapters` for retained behavior tests.
- `apps/feature-screens/src/test/screen-host/features/integration/routes/CoverageRoute.tsx` — composes `CoverageScreen` (bridge-safe, entry `operator-screens/coverage`; standalone `InternalLink` anchors); the screen holds coverage columns, labels, and coverage states.
- `apps/feature-screens/src/test/screen-host/features/integration/routes/LinksRoute.tsx` — composes `LinksScreen` (bridge-safe, entry `operator-screens/entity-links`; owns its `ListShell`; the search box and row checkboxes are inert, D8); the screen holds Links list filters, tabs, and selected state.
- `apps/feature-screens/src/features/integration/components/EntityLinksInventoryTable.tsx` — Entity Link inventory rows and permission state.
- `apps/feature-screens/src/features/integration/components/EntityRelationRow.tsx` — relation summary within an inventory row.
- Entity-link rows accept Entity Link DTOs only. VOC Cluster member presentation belongs to `apps/feature-screens/src/features/voc-cluster/components/detail/VocClusterMemberRow.tsx`.
- `apps/feature-screens/src/features/integration/components/LinkStatusBadge.tsx` — Entity Link status labels and badge styles.
- `apps/feature-screens/src/features/integration/hooks/useEntityLinkInventory.ts` — Entity Link inventory query.
- `apps/feature-screens/src/lib/copy/home.ts` — shared wording used by Coverage.
- `apps/feature-screens/src/lib/copy/permission-reasons.ts` — shared blocked copy used by the link inventory.

## Verification

- Test missing-link queue behavior, coverage labels, link visibility states, and deep-link action restore when touched.

## Close-out contract (ADR-0067; 56-I implemented)

- ADR-0067 recovery composition lives in `recovery/`; `public.ts` exposes it to Home. Integration
  owns recovery composition, source routes own full workflows. Existing three shells remain.
- Scope/category/selection/hidden/history/return intent restores via URL; readable resolved
  selection stays open. Render backend actions/visibility/hints without response identity leaks.
- Offer personal snooze (1/7 days), current-occurrence mute, hidden view/restore; refresh shared
  queries after source repairs.
- Shipped (#1088): Coverage renders server bands and the neutral `no_data` state — no local
  rules. Server `computed_at`, last successful refresh and stale display are implemented on
  Coverage, Home and Integration; queue/detail clocks are independent.

## Analytics Area report (ADR-0069; shipped by #1079)

- Coverage's PageShell is extended with URL-backed `view=areas`; default overview omits `view`.
- Keep Managed System/Area/paging state and source destinations per `docs/design/features/routes-and-layout.md`.
- Render unavailable, zero, zero-denominator, loading/error/denial separately; no stale prior-scope counts.
- Operational positive counts link to exact typed source filters; repairs remain on owning source routes.
- The secondary Area-tab link is shipped on the existing Integration Coverage card; no new Admin/rail surface.

## Evidence inventory (ADR-0064/0065; implemented by #1107)

`/integration/evidence` is a read-only ListShell inventory of stored
highlights across readable Findings. Findings owns
`GET /evidence-highlights` and `GET /evidence-highlights/:id`; Survey owns the
ADR-0064 safe projection. Integration renders only authorized DTOs, never raw
links/private bindings/audit JSON or response URLs. See
`docs/design/features/routes-and-layout.md` for URL keys, detail restoration and states;
`docs/architecture/platform-api/api/findings.md` for eligibility-before-search/pagination.

Rows/panel identify the owning Finding; primary `Finding 보기` opens its detail
and Back preserves Evidence context. Editing/attachment/execution remains in
Finding detail, using #816's candidate/attach APIs. No standalone model, Unlinked
tab or coverage KPI. Reuse Korean chrome/source labels and shipped shell density;
prototype is a reference under ADR-0060. Verify desktop 1440, keyboard/focus,
withheld/denied/empty/error and later-page selected detail before delivery by the conductor.
Preserve ordinary Links/Coverage, VOC source/reporter rules and authored notes.
