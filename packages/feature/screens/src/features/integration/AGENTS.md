# Integration Feature Agent Guide

## Ownership

Integration owns frontend route composition for Evidence, Coverage, Links, and integration recovery queues. It is the UI home for feature linking behavior, but does not own source object lifecycles or backend authorization truth. Finding screens and hooks live in `features/findings/`.

## Route Boundary

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

Paths are relative to `packages/feature/screens/src/`.

## Verification

- When touched: missing-link queue behavior, coverage labels, link visibility states, deep-link action restore.

## Close-out contract (FO ADR-0067)

- Recovery composition lives in `recovery/`; `public.ts` exposes it to Home. Integration owns recovery composition; source routes own full workflows. The existing three shells remain.
- Scope/category/selection/hidden/history/return intent restores via URL; a readable resolved selection stays open. Render backend actions/visibility/hints without response identity leaks.
- Offer personal snooze (1/7 days), current-occurrence mute, hidden view/restore; refresh shared queries after source repairs.
- Coverage renders server bands and the neutral `no_data` state — no local rules. Server `computed_at`, last successful refresh and stale display are implemented on Coverage, Home and Integration; queue/detail clocks are independent.

## Analytics Area report (FO ADR-0069)

- Coverage's PageShell is extended with URL-backed `view=areas`; the default overview omits `view`.
- Keep Managed System/Area/paging state and source destinations per `packages/feature/screens/docs/routes-and-layout.md`.
- Render unavailable, zero, zero-denominator, loading/error/denial separately; no stale prior-scope counts.
- Operational positive counts link to exact typed source filters; repairs remain on owning source routes.
- The secondary Area-tab link is on the existing Integration Coverage card; no new Admin/rail surface.

## Evidence inventory (FO ADR-0064/0065)

`/integration/evidence` is a read-only ListShell inventory of stored highlights across readable Findings. Findings owns `GET /evidence-highlights` and `GET /evidence-highlights/:id`; Survey owns the FO ADR-0064 safe projection. Integration renders only authorized DTOs, never raw links/private bindings/audit JSON or response URLs.

- URL keys, detail restoration and states: `packages/feature/screens/docs/routes-and-layout.md`.
- Eligibility-before-search/pagination: `docs/architecture/platform-api/api/findings.md`.
- Rows/panel identify the owning Finding; primary `Finding 보기` opens its detail and Back preserves Evidence context. Editing/attachment/execution remains in Finding detail, using #816's candidate/attach APIs. No standalone model, Unlinked tab or coverage KPI.
- Reuse Korean chrome/source labels and the shipped shell density; the prototype is a reference under FO ADR-0060. Verify keyboard/focus, withheld/denied/empty/error and later-page selected detail before delivery by the conductor.
- Preserve ordinary Links/Coverage, VOC source/reporter rules and authored notes.
