# Admin Feature Agent Guide

## Ownership

Admin owns frontend route composition for Managed System Registry, Analytics Areas, Permission Requests, active permission grants and denies, workspace settings, and administrative review queues. It does not own source-system lifecycles, Entity Link relation semantics, or application-service permission decisions.

The canonical term is "Analytics Area" (per `docs/product/features/03-core-platform.md` and the actual routes/modules). "Product Area" in older docs is a legacy synonym for the same concept — do not treat them as two entities.

## Route Boundary

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

  - The bridge menu permission and backend enforce access; test-local hosts also pin the denied panel.

## Verification

- Under the platform bridge (`useHostSeam().hostOwnsTitle`), admin screens draw no title/subtitle of their own — the platform page head is the title (#764 p2); header actions (filters, register and grant buttons) stay. Standalone keeps every title.
- When touched: Analytics Area tree restore, Managed System default editing, permission approval/rejection/revocation states, explicit deny display, blocked-state return paths.

## Permission close-out contract

- Clear decision drafts on request ID/revision changes; stale errors require refetch and fresh review, never auto-submit. Preserve tab/selected and Back restoration; cancelled history has no decision controls.
- Direct workspace.admin grants require explicit governance mode/confirmation; self grants follow permission_self_approval. Server scope candidates, required reason, open-ask review and explicit deny-lift guidance are authoritative. Capability grants never imply Role Level promotion.
- No client scores, email or restricted source text. Zero risk signals are shown only after successful calculation.

## Close-out contract (FO ADR-0067)

- The five Coverage band rows live at `/admin/settings` (75/40 defaults; integer `0 <= warn < good <= 100` validation; save/discard/error/retry) with all-scope `dashboard-summary` invalidation after save. On a failed refetch, Home and Coverage keep cached rows under an explicit error indication, while Integration shows its own explicit error state (system overview hidden, average stat omitted).
- Distinct Managed System reviewer Actor/team defaults are registry/storage; creation routing is implemented. Respect server gates, audit and no-op semantics.
- Surface safe automatic-default configuration warnings. Known teams may render; no team CRUD, candidate listing or automatic reassignment is introduced.

## Suggestion opt-in (FO ADR-0068)

- The existing `/admin/settings` surface owns the single default-off Cluster suggestion option row (`사용` / `사용 안 함`). Preserve existing policies and permission gates.
  - Disabling stops new suggestions while pending review remains available; explain that boundary with Korean chrome.
  - Suggestion review stays in `features/voc-cluster/`; preview quota/model/scheduling consoles are not part of this addition.
- Render the section only after `GET /voc-cluster-suggestions` returns `available:true`; loading, errors and provider-disabled reads preserve the shipped settings layout. The required boolean remains in resolved settings. Hidden saved values are preserved, and only an edited field enters the existing partial PATCH/save bar.
