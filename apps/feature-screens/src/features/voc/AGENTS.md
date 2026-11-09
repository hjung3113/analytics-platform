# VOC Feature Agent Guide

## Ownership

- Owns frontend route composition for VOC submission, inbox, triage, reporter-facing status, public updates, and VOC detail panels. Does not own Task status, Survey Response conversion, Finding persistence, or Entity Link visibility rules.
- Owns `/vocs` (single view-switching route covering inbox, triage, and create, mapped by the platform bridge). VOC Clusters are a separate feature (`features/voc-cluster/`, mounted at `/voc-clusters`) — see its AGENTS.md.
- May start Create Finding or Request Task flows without losing VOC list/detail context.

## Invariants

- VOC means customer- or user-submitted voice.
- Never expose Survey Response -> Create VOC.
- Reporter-facing VOC status and internal Task status stay visually and structurally separate.
- Task Done or Released must not automatically resolve VOC.
- Public Update, Reporter Reply, and Internal Comment are distinct communication surfaces.
- Reporter Summary must be public-safe: no raw Task statuses, internal comments, priority, developer discussion, severity, or confidence.
- Triage is a primary workspace, not just an Inbox filter. Unassigned VOC is a first-class operational failure mode.
- VOC creation requires Managed System, allows optional Analytics Area under the selected Managed System and optional Source Context, and must not ask Reporter for severity.
- Use list/detail layout and URL-selected detail state.
- Linked Findings, Tasks, and Evidence render through backend-approved summaries and `LinkedEntityTrail`.

## Recommendation surface

- The `유사 VOC 추천` section in the triage panel owns the ADR-0034 recommendation surface: per-candidate rows with confirm and dismiss actions, read from `GET /vocs/:id/recommendations`.
- `voc.similar_count` is the ADR-0031 same-Managed-System peer count. Show it with the label `같은 Managed System의 VOC N건` in detail and triage; never render it as an inbox row chip or a recommendation count.
- `available: false` carries two reasons, `provider_disabled` and `source_not_embedded`; each renders its own copy. Never collapse one into the other or render either as an empty candidate list.

## Bridge-mounted surfaces

- `routes/InboxScreen.tsx` — bridge-safe inbox/My VOC list (ADR-0071, entry `operator-screens/voc-inbox`): URL read/written through the host seam, detail via the host's `renderDetail`; `VocRouteShell` composes it with `VocDetailPanel`.
- `components/compose/VocComposeScreen.tsx` — retained VOC creation form, mounted by `packages/adapters/feature-bridge/src/pages/VocCompose.tsx`; no standalone create route (#597).
- `components/reporter/` — bridge-safe reporter perspective for the platform `내 VOC` (ADR-0071); the list is the public `PublicVocListScreen`, which the platform filters to the own VOCs. `ReporterVocDetail` draws a fixed read allowlist plus one write, the existing `ReporterReplyComposer` on the signed-in actor's own VOC (#1159); no public update, internal comment, triage, or Finding control.
- `components/public/` — bridge-safe 소통 › VOC (ADR-0110, #1288): `PublicVocListScreen` (`GET /vocs/public`), `PublicVocDetail` (renders `PublicVocView` only), and `VocReadingPane`, which reads `GET /vocs/public/:id` first and mounts `ReporterVocDetail` only for the server's `mine: true`.
  - A VOC that is not the actor's own never causes a reporter or operator request.
  - Responses are parsed with the shared strict schemas.

## Close-out contract (ADR-0067)

Real source owner display/edit/filter with defaults. Ordinary reporter create has no owner override; assigned VOC remains untriaged; optional triage owner stays valid. Render safe creation routing metadata and retain the source workflow.

## Optional draft preview (ADR-0068)

The create screen owns a feature-local semantic panel/hook under `유사 VOC 추천`; query `GET /vocs/similarity-preview/availability` once with a long stale time and no retries.

- Keep hooks unconditional; render no card/placeholder until available, or after a click reports `provider_disabled`.
- Keep the zero-paid-call `같은 Managed System의 최근 VOC` panel separate. Only `유사 VOC 확인` with provider-transmission disclosure calls the merged `POST /vocs/similarity-preview` route; typing/refocus/render/automatic retries never do.
- Actual text/MS changes clear pending/results/errors, abort and ignore late responses. Unchanged values and unrelated rerenders preserve the check; each explicit click gets a fresh key.
- While loading, keep the mounted check button focusable with `aria-disabled="true"` and the shared Button disabled styling; the synchronous in-flight guard blocks clicks and Enter/Space. Use native `disabled` only for an invalid draft; enable checking again after settlement when the draft is valid.
- Distinguish quota/provider/empty states, leave submit usable, and preserve UUID navigation's unsaved-change blocker.
- No draft VOC, dismiss/confirm/join, or extra continue step. Use the existing copy module and shared similarity-preview schemas with typed `apiRequest`. Saved recommendation states remain distinct from the preview union in `docs/architecture/platform-api/api/voc.md`.

## Verification

- When touched, test route restore, selected detail panels, triage filters, public update flows, forbidden Survey Response-to-VOC affordances, and reporter/internal status separation.
