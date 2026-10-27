# Admin Feature Agent Guide

## Ownership

Admin owns frontend route composition for Managed System Registry, Analytics Areas, Permission Requests, active permission grants and denies, workspace settings, and administrative review queues.

It does not own source-system lifecycles, Entity Link relation semantics, or application-service permission decisions.

The canonical term is "Analytics Area" (per `docs/feedbackops/design/03-core-platform.md` and the actual routes/modules). "Product Area" in older docs is a legacy synonym for the same concept — do not treat them as two entities.

## Route Boundary

- Owns `/admin/managed-systems`, `/admin/analytics-areas`, `/admin/permissions/requests`, `/admin/permissions/grants`, and `/admin/settings` (implemented — `WorkspaceSettingsScreen`, see `apps/fo-frontend/src/features/admin/settings/`).
- Analytics Areas, Permission Requests, active permission grants and denies, Managed System Registry, and workspace settings are Admin routes, not top-level work routes.

## Invariants

- Analytics Area is business context, not a forced mirror of routes or code modules.
- Managed System Registry provides scope, filters, and default owners/reviewers; it does not create separate route trees.
- Explicit Deny overrides general Allow.
- Sensitive permission decisions are auditable.

## Rules

- Analytics Area management should use a compact tree and detail panel.
- Permission Request review should show requester, scope, reason, risk, expiration, and decision state.
- Managed System defaults prefill responsibility; they do not remove explicit owner/reviewer fields from records.
- Do not expose complex permission matrix builders in MVP.

## Key files

- `apps/fo-frontend/src/routes/_authed/admin/managed-systems.tsx` — mounts the Managed System registry.
- `apps/fo-frontend/src/routes/_authed/admin/analytics-areas.tsx` — mounts standalone Analytics Areas and wires its route URL search validator.
- `apps/fo-frontend/src/operator-screens/analytics-areas/index.ts` — router-free bridge entry; the screen's optional `renderDetail` prop hands `ClosableDetailParts` to the host drawer, while the standalone route omits it and keeps the Sheet.
- `apps/fo-frontend/src/operator-screens/admin-search/index.ts` — the platform bridge's router-free entry for the three admin search validators (`isAnalyticsAreasSearchValueValid`, `isPermissionGrantsSearchValueValid`, `isPermissionRequestsSearchValueValid`); the requests schema lives in `features/admin/permissions/permission-requests-schema.ts` (re-exported by `permission-requests-search.ts`) so the entry stays free of the enum-labels/`@fops/ui` barrel.
- `apps/fo-frontend/src/operator-screens/permission-requests/index.ts`, `…/permission-grants/index.ts` — the platform bridge's router-free entries for the two permission consoles (#764 g). Both screens read and write the URL through `useHostSearchWriter`, need a `HostSeamProvider`, and take two props: `autoSelect` (default `true` = the standalone rule, first visible item selected on load/tab change; the bridge passes `false`: selection from the URL only, a stale selection is still replace-dropped) and `renderDetail` (absent = `ListShell.detailPanel`, DOM unchanged; present = the screen builds `ClosableDetailParts` and renders `renderDetail(parts)` beside the list, so decision/revoke drafts stay in the screen tree). The admin gate stays in the standalone routes; the bridge menu's permission and the backend decide there.
- `apps/fo-frontend/src/routes/_authed/admin/permissions/requests.tsx` — mounts Permission Request review and validates URL state.
- `apps/fo-frontend/src/routes/_authed/admin/permissions/grants.tsx` — mounts active grants and denies and validates URL state.
- `apps/fo-frontend/src/routes/_authed/admin/settings.tsx` — mounts workspace settings.
- `apps/fo-frontend/src/operator-screens/managed-systems/index.ts` — router-free bridge entry for the Managed System screen.
- `apps/fo-frontend/src/operator-screens/settings/index.ts` — router-free bridge entry for workspace settings; the screen accepts the bridge `section` page key (`coverage`) and keeps the standalone `#coverage` hash fallback when the prop is `undefined`.
- `apps/fo-frontend/src/features/admin/managed-systems/ManagedSystemsScreen.tsx` — registry list and defaults.
- `apps/fo-frontend/src/features/admin/analytics-areas/AnalyticsAreasScreen.tsx` — Analytics Area page composition and optional host detail rendering.
- `apps/fo-frontend/src/features/admin/analytics-areas/AnalyticsAreasList.tsx` — Analytics Area tree list.
- `apps/fo-frontend/src/features/admin/analytics-areas/AnalyticsAreaDetail.tsx` — selected Analytics Area detail.
- `apps/fo-frontend/src/features/admin/permissions/permission-requests-screen.tsx` — request tabs, list, and status badges.
- `apps/fo-frontend/src/features/admin/permissions/permission-grants-screen.tsx` — active grants and denies with revoke/lift detail actions.
- `apps/fo-frontend/src/features/admin/permissions/permission-request-detail.tsx` — request detail and decision actions.
- `apps/fo-frontend/src/features/admin/permissions/permission-requests-search.ts` — request URL tabs and status labels.
- `apps/fo-frontend/src/features/admin/settings/WorkspaceSettingsScreen.tsx` — editable workspace settings.

## Verification

- Under the platform bridge (`useHostSeam().hostOwnsTitle`), the five admin screens (Managed System, Analytics Area, permission requests, permission grants, workspace settings) draw no title/subtitle of their own — the platform page head is the title (#764 p2); header actions (filters, register and grant buttons) stay. Standalone keeps every title. `admin/__tests__/admin-host-title.test.tsx` and `permission-screens.host.test.tsx` pin both.
- Test Analytics Area tree restore, Managed System default editing, permission approval/rejection/revocation states, explicit deny display, and blocked-state return paths when touched.

## Permission close-out contract

- ADR-0066 selected-detail revision-safe review uses `selected-permission-request-detail.tsx` and the shared-schema API adapter. Explained risk presentation (#1084) and direct-grant UI (#1086) remain separate implementation items.
- Clear decision drafts on request ID/revision changes; stale errors require refetch and fresh review, never auto-submit. Preserve tab/selected and Back restoration; cancelled history has no decision controls.
- Direct workspace.admin grants require explicit governance mode/confirmation; self grants follow permission_self_approval. Server scope candidates, required reason, open-ask review and explicit deny-lift guidance are authoritative. Capability grants never imply Role Level promotion.
- No client scores, email or restricted source text. Zero risk signals are shown only after successful calculation.

## Close-out contract (ADR-0067; Coverage editor shipped #1088, defaults shipped #1089–#1091)

- Shipped (#1088): the five Coverage band rows at `/admin/settings` (75/40 defaults,
  integer `0 <= warn < good <= 100` validation, save/discard/error/retry) and all-scope
  `dashboard-summary` invalidation after save; on a failed refetch Home and Coverage keep
  cached rows under an explicit error indication, while Integration shows its own explicit
  error state (system overview hidden, average stat omitted). Distinct Managed System
  reviewer Actor/team defaults are registry/storage in #1089; creation routing shipped in
  #1090/#1091. Respect server gates, audit and no-op semantics.
- Surface safe automatic-default configuration warnings. Known teams may render; no team
  CRUD/candidate listing or automatic reassignment is introduced.

## Suggestion opt-in (ADR-0068; shipped #1098)

The existing `/admin/settings` surface owns the single default-off Cluster
suggestion option row (`사용` / `사용 안 함`). Preserve existing policies and permission gates. Disabling
stops new suggestions while pending review remains available; explain that
boundary with Korean chrome. Suggestion review stays in `features/voc-cluster/`;
preview quota/model/scheduling consoles are not part of this addition.

Render the section only after `GET /voc-cluster-suggestions` returns `available:true`;
loading, errors and provider-disabled reads preserve the shipped settings layout.
The required boolean remains in resolved settings. Hidden saved values are preserved,
and only an edited field enters the existing partial PATCH/save bar.
