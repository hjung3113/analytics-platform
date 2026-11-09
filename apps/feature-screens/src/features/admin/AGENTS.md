# Admin Feature Agent Guide

## Ownership

Admin owns frontend route composition for Managed System Registry, Analytics Areas, Permission Requests, active permission grants and denies, workspace settings, and administrative review queues. It does not own source-system lifecycles, Entity Link relation semantics, or application-service permission decisions.

The canonical term is "Analytics Area" (per `docs/product/features/03-core-platform.md` and the actual routes/modules). "Product Area" in older docs is a legacy synonym for the same concept — do not treat them as two entities.

## Route Boundary

- Owns `/admin/managed-systems`, `/admin/analytics-areas`, `/admin/permissions/requests`, `/admin/permissions/grants`, and `/admin/settings` (`WorkspaceSettingsScreen`, see `features/admin/settings/`).
- Analytics Areas, Permission Requests, active permission grants and denies, Managed System Registry, and workspace settings are Admin routes, not top-level work routes.

## Invariants

- Analytics Area is business context, not a forced mirror of routes or code modules.
- Managed System Registry provides scope, filters, and default owners/reviewers; it does not create separate route trees.
- Explicit Deny overrides general Allow.
- Sensitive permission decisions are auditable.

## Rules

- Analytics Area management uses a compact tree and detail panel.
- Permission Request review shows requester, scope, reason, risk, expiration, and decision state.
- Managed System defaults prefill responsibility; they do not remove explicit owner/reviewer fields from records.
- Do not expose complex permission matrix builders in MVP.

## Key files

Paths are relative to `apps/feature-screens/src/`. Screen components under `features/admin/` match their route one-to-one (`ManagedSystemsScreen`, `AnalyticsAreasScreen`/`AnalyticsAreasList`/`AnalyticsAreaDetail`, `permissions/permission-requests-screen`, `permission-grants-screen`, `permission-request-detail`, `permission-requests-search`, `settings/WorkspaceSettingsScreen`).

- `operator-screens/analytics-areas/index.ts` — router-free bridge entry; the screen's optional `renderDetail` prop hands `ClosableDetailParts` to the host drawer, while the standalone route omits it and keeps the Sheet.
- `operator-screens/admin-search/index.ts` — router-free bridge entry for the three admin search validators (`isAnalyticsAreasSearchValueValid`, `isPermissionGrantsSearchValueValid`, `isPermissionRequestsSearchValueValid`).
  - The requests schema lives in `features/admin/permissions/permission-requests-schema.ts` (re-exported by `permission-requests-search.ts`) so the entry stays free of the enum-labels/`@ap/feature-ui` barrel.
- `operator-screens/permission-requests/index.ts` and `…/permission-grants/index.ts` — router-free bridge entries for the two permission consoles (#764 g). Both screens read and write the URL through `useHostSearchWriter`, need a `HostSeamProvider`, and take two props:
  - `autoSelect` — default `true` = the standalone rule (first visible item selected on load/tab change); the bridge passes `false`: selection from the URL only, and a stale selection is still replace-dropped.
  - `renderDetail` — absent = `ListShell.detailPanel` (DOM unchanged); present = the screen builds `ClosableDetailParts` and renders `renderDetail(parts)` beside the list, so decision/revoke drafts stay in the screen tree.
  - The bridge menu permission and backend enforce access; test-local hosts also pin the denied panel.
- `operator-screens/managed-systems/index.ts` and `operator-screens/settings/index.ts` — router-free bridge entries; settings accepts the bridge `section` page key (`coverage`) and keeps the standalone `#coverage` hash fallback when the prop is `undefined`.

## Verification

- Under the platform bridge (`useHostSeam().hostOwnsTitle`), the five admin screens draw no title/subtitle of their own — the platform page head is the title (#764 p2); header actions (filters, register and grant buttons) stay. Standalone keeps every title. `admin/__tests__/admin-host-title.test.tsx` and `permission-screens.host.test.tsx` pin both.
- When touched: Analytics Area tree restore, Managed System default editing, permission approval/rejection/revocation states, explicit deny display, blocked-state return paths.

## Permission close-out contract

- ADR-0066 selected-detail revision-safe review uses `selected-permission-request-detail.tsx` and the shared-schema API adapter. Explained risk presentation (#1084) and direct-grant UI (#1086) remain separate implementation items.
- Clear decision drafts on request ID/revision changes; stale errors require refetch and fresh review, never auto-submit. Preserve tab/selected and Back restoration; cancelled history has no decision controls.
- Direct workspace.admin grants require explicit governance mode/confirmation; self grants follow permission_self_approval. Server scope candidates, required reason, open-ask review and explicit deny-lift guidance are authoritative. Capability grants never imply Role Level promotion.
- No client scores, email or restricted source text. Zero risk signals are shown only after successful calculation.

## Close-out contract (ADR-0067)

- The five Coverage band rows live at `/admin/settings` (75/40 defaults; integer `0 <= warn < good <= 100` validation; save/discard/error/retry) with all-scope `dashboard-summary` invalidation after save. On a failed refetch, Home and Coverage keep cached rows under an explicit error indication, while Integration shows its own explicit error state (system overview hidden, average stat omitted).
- Distinct Managed System reviewer Actor/team defaults are registry/storage; creation routing is implemented. Respect server gates, audit and no-op semantics.
- Surface safe automatic-default configuration warnings. Known teams may render; no team CRUD, candidate listing or automatic reassignment is introduced.

## Suggestion opt-in (ADR-0068)

- The existing `/admin/settings` surface owns the single default-off Cluster suggestion option row (`사용` / `사용 안 함`). Preserve existing policies and permission gates.
  - Disabling stops new suggestions while pending review remains available; explain that boundary with Korean chrome.
  - Suggestion review stays in `features/voc-cluster/`; preview quota/model/scheduling consoles are not part of this addition.
- Render the section only after `GET /voc-cluster-suggestions` returns `available:true`; loading, errors and provider-disabled reads preserve the shipped settings layout. The required boolean remains in resolved settings. Hidden saved values are preserved, and only an edited field enters the existing partial PATCH/save bar.
