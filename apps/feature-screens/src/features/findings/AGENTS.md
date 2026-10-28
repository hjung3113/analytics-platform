# Findings Feature Agent Guide

#597: paths below describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/feature-bridge`; standalone routes and `*Route` compositions are retired. Adapters under `src/test` are test-only.

## Ownership

This folder owns Finding screens and hooks: `FindingDetailPanel` and its panel tree (`FullFindingDetail`, `FindingExecutionSection`, the evidence/link modals, the Finding-owned Request Task draft host, `useFindingDetailController`), plus the Finding read/mutation hooks (`useFindingsList`, `useFindingDetail`, `useFindingStatusMutation`, `useEvidenceHighlights`, `useEvidenceMutations`, `useRequestTaskFromFinding`). The neutral `TaskRequestDraftCard` form and read presentation lives in `features/cross-system/request-task/`.

It does not own source object lifecycles or backend authorization truth.

## Route Boundary

- Finding list/detail selection uses the platform menu and host `selected` state. The router-free `features/findings/routes/findings-search.ts` schema is exported through `operator-screens/findings-search`. The standalone `/findings/:findingId` redirect is retired; no redirect table remains.

- This folder does not own the entity-link inventory or `/integration/links` — `EntityRelationRow`, `EntityLinksInventoryTable`, `LinkStatusBadge`, and `useEntityLinkInventory` stay under `features/integration/`.

## Rules

- Finding detail is evidence-first and keeps execution links visible.
- Finding detail composes `FindingDetailPanel` → `FullFindingDetail` with separate detail and execution section controllers. Requested-link selection, retry/focus handling, and the draft host belong to `FindingExecutionSection`.
- Surveys reach the Finding source-detail read and the Finding-owned Request Task draft host through `features/findings/public.ts`; new cross-feature uses of those flows go through it too, except code mounted in the platform bridge (Task Request review), which reads through `features/findings/hooks/useFindingDetail` directly; the bridge's Finding detail entry is `operator-screens/finding-detail`. Survey retains selected-Finding load/ready/error orchestration. Known boundary debt: the Cluster "link existing Finding" picker (`voc-cluster/components/modals/LinkExistingFindingModal.tsx`) still imports `useFindingsList` directly.
- Finding bridges evidence to execution, but backend permission checks remain authoritative; permission-limited content renders approved summaries or a request path.

## Key files

- `apps/feature-screens/src/features/findings/routes/FindingsScreen.tsx` — the list, its URL state and list status labels (bridge-safe, entry `operator-screens/findings`; the host renders every detail-slot branch through `renderDetail`).
- `apps/feature-screens/src/features/findings/hooks/useFindingsList.ts` — Finding list query.
- `apps/feature-screens/src/features/findings/components/FindingDetail/FindingDetailParts.tsx` — the detail as `DetailParts` (entry `operator-screens/finding-detail`); `FindingDetailPanel` frames them.
- `apps/feature-screens/src/test/host-adapters/features/findings/components/FindingDetail/FindingDetailPanel.tsx` — the standalone frame around the parts (header, back link slot).
- `apps/feature-screens/src/features/findings/components/FindingDetail/FullFindingDetail.tsx` — detail fields, actions, and status labels.
- `apps/feature-screens/src/features/findings/components/FindingDetail/FindingExecutionSection.tsx` — requested Task Request links, retry/focus state, and section actions.
- `apps/feature-screens/src/features/findings/components/FindingDetail/FindingRequestTaskDraftHost.tsx` — Finding-owned Task Request form host used by Finding and Survey.
- `apps/feature-screens/src/features/findings/public.ts` — supported source-read and Request Task host edge for other features (bridge-mounted readers use `hooks/useFindingDetail.ts`).
- `apps/feature-screens/src/features/findings/components/FindingDetail/useFindingDetailController.ts` — detail action and status state, excluding execution-section state.
- `apps/feature-screens/src/features/findings/hooks/useFindingStatusMutation.ts` — Finding status mutation.
- `apps/feature-screens/src/features/findings/components/FindingDetail/AddEvidenceModal.tsx` — add-evidence (highlight) dialog.
- `apps/feature-screens/src/features/findings/hooks/useEvidenceMutations.ts` — evidence link mutations.
- `apps/feature-screens/src/features/findings/components/FindingDetail/LinkEvidenceModal.tsx` — link-existing-evidence modal.
- `apps/feature-screens/src/features/findings/components/FindingDetail/LinkTaskModal.tsx` — link-Task dialog.
- `apps/feature-screens/src/lib/copy/permission-reasons.ts` — shared permission-blocked copy, including the Finding list.

## Verification

- Test Finding action CTAs, evidence summaries, and deep-link action restore when touched.

## Close-out contract (ADR-0067; VOC/Finding responsibility implemented by #1090)

- ADR-0067 implements source-owned owner display/edit/filter across all creation
  sources. Show Actor/team/null assignment from the server, never infer it from provenance
  or grant permissions. Preserve personal Survey source visibility before target disclosure.

## Survey evidence reuse (ADR-0064 / ADR-0065; #1110)

Survey-derived Finding/source/default summaries remain metadata-only; render excerpt
text only from freshly authorized active highlight DTOs, with safe unavailable state
after revoke/source denial. Preserve Finding URL/detail context.

`AddEvidenceModal` uses the Finding-local `SurveyEvidencePicker` and
`useSurveyEvidence` hooks: unfiltered, separately authorized `GET /surveys`, then
bounded `GET /surveys/:id/evidence-candidates` pages. Select a returned approval ID;
never offer a response UUID or editable Survey quote, or read personal Results.
Source and target Managed Systems may differ; show the source context without
filtering discovery by the target scope. Source/Survey changes and close reset
selection; retryable attachment errors retain selection/classification and attempt
key, while changed payloads get a new UUIDv4 key. Ineligible selections clear and
refresh safe candidates. Candidate reads returning 403/404/409/422 discard all loaded
pages and cursors for that Survey and clear selection. Retry starts at page one;
later transport failures cannot restore excerpts before a successful authorized read.
Backend target manage and source/suppression checks remain
authoritative.

`useAttachSurveyEvidenceMutation` posts only the selection/classifications to
`POST /findings/:id/survey-evidence`. Its hook-owned invalidation rereads Finding
detail/evidence/list and all Evidence inventory prefix variants through neutral
`lib/query/evidence-inventory-key.ts`, including inactive queries. Never import
Integration internals or cache quote text from the metadata-only mutation response.
VOC/note behavior and the existing VOC chooser remain unchanged.
