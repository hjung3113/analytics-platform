# Surveys Feature Agent Guide

#597: paths below describe semantic screen intents. Runtime registration belongs to platform menus and `@ap/fo-bridge`; standalone routes and `*Route` compositions are retired. Adapters under `src/test` are test-only.

## Ownership

Surveys owns frontend route composition for Survey creation, builder flows, responses, results, and survey-to-action CTAs.

It does not own VOC creation, Finding persistence, Task mutation, or permission decisions.

## Route Boundary

- Owns `/surveys`, `/surveys/:surveyId`, `/surveys/:surveyId/results`, `/surveys/:surveyId/follow-up`, `/surveys/participate`, and `/surveys/:surveyId/respond`.
- Survey-derived actions may link into Integration or Tasks through approved API contracts.

## Invariants

- Survey Response must never create VOC.
- Survey Response may create Finding or Evidence Highlight through approved actions.
- Hidden personal responses render through safe summaries only.
- Survey CTAs move from response insight to execution, not duplicate customer voice.
- Surveys are scoped to a Managed System in MVP.

## Rules

- Keep builder and result views simple for MVP.
- Result summaries should expose Create Finding and Request Task where permitted; Link Finding is deferred out of MVP scope (ADR-0037).
- Selected-Finding load/ready/error orchestration stays in Survey; source reads and the Finding-owned Request Task draft host come from `useFindingDetail` and `FindingRequestTaskDraftHost`, imported by their own modules (never `features/findings/public.ts`, which entry graphs ban).
- Permission-limited responses must show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.

## Key files

- `apps/feature-screens/src/features/surveys/routes/surveys-search.ts` — router-free list and detail search schemas + validators (`isSurveysSearchValueValid`, `isSurveyDetailSearchValueValid`); the bridge reads them through `operator-screens/surveys-search`.
- `apps/feature-screens/src/features/surveys/routes/SurveysScreen.tsx` — bridge-safe Survey list screen (list context, URL selection, stale-drop, create) over the host seam; the host's `renderDetail(selectedId, slot)` is the detail slot. Entry `operator-screens/surveys`, which never reaches the detail tree.
- `apps/feature-screens/src/features/surveys/components/list/SurveyListScreen.tsx` — shared Survey list composition (toolbar, filters, create, detail slot) for the index and detail routes.
- `apps/feature-screens/src/features/surveys/routes/SurveyResultsScreen.tsx` — bridge-safe Survey results screen (outer metadata states, header, summary) over the host seam. Entry `operator-screens/survey-results`; never imports `features/findings/public.ts` (the summary reaches `FindingRequestTaskDraftHost` and `useFindingDetail` by their own modules).
- `apps/feature-screens/src/features/surveys/hooks/useSurveyResultsController.ts` — metadata/results/Follow-up reads, capability readiness, denial persistence, safe content selection, and document title.
- `apps/feature-screens/src/features/surveys/policy/resultsReadDenial.ts` — sticky denial key/default registration, denial merge, and results-read projection.
- `apps/feature-screens/src/features/surveys/routes/SurveyFollowUpScreen.tsx` — bridge-safe follow-up screen. `selection` (host-owned, controlled: no auto-select, a filter switch or a stale id goes through `onSelect(null)`) and `renderDetail(parts)` (the host places the detail parts in place); absent = the review's own selection with first-open auto-select and the standalone aside. Entry `operator-screens/survey-follow-up`.
- `apps/feature-screens/src/features/surveys/components/participation/SurveyParticipationScreens.tsx` — bridge-safe participation list and respondent form screens, mounted by the platform bridge (platform ADR-0071); retired wrappers live only under `src/test`. Use `variant="embedded"` only in the platform.
- `apps/feature-screens/src/features/surveys/components/respond/` — shared preview and respondent question rendering/branching.
- `apps/feature-screens/src/features/surveys/components/list/SurveyList.tsx` — Survey list rows and list states.
- `apps/feature-screens/src/test/host-adapters/features/surveys/components/detail/SurveyDetail.tsx` — standalone Survey detail aside; frames the pieces of `SurveyDetailParts.tsx`.
- `apps/feature-screens/src/features/surveys/components/detail/SurveyDetailParts.tsx` — Survey detail as `DetailParts` (`useSurveyDetailParts`: loading / not-found / blocked / error / full) plus the shared pieces; entry `operator-screens/survey-detail`.
- `apps/feature-screens/src/features/surveys/routes/SurveyBuilderScreen.tsx` — bridge-safe Survey builder screen (data states, manage gate, Back with a dirty draft confirmed by the screen) over the host seam; the host owns `onBack`. Entry `operator-screens/survey-builder`. The bridge accepts draft loss on menu switch; test-local adapters retain the old blocker assertions without a runtime route.
- `apps/feature-screens/src/features/surveys/components/builder/SurveyBuilder.tsx` — Survey builder composition.
- `apps/feature-screens/src/features/surveys/components/SurveyStatusBadge.tsx` — Survey status labels and badge styles.
- `apps/feature-screens/src/features/surveys/components/results/SurveyResultsSummary.tsx` — result summary and follow-up actions.
- `apps/feature-screens/src/features/findings/hooks/useFindingDetail.ts`, `.../components/FindingDetail/FindingRequestTaskDraftHost.tsx` — Finding source-read and Request Task host pieces used by Survey results, imported by module path.
- `apps/feature-screens/src/features/surveys/components/results/CreateFindingDraftPanel.tsx` — Finding draft from response excerpts.
- `apps/feature-screens/src/features/surveys/hooks/useSurveys.ts` — Survey, result, and mutation queries.

## Verification

- Test builder route state, result summary CTAs, forbidden create-VOC affordances, hidden response summaries, and linked action pending/error states when touched.

## Close-out contract (ADR-0067; implemented)

- ADR-0067 preserves Survey-owned follow-up and personal disclosure boundaries (ADR-0055).
  Per-response hiding/history is Survey-owned/personal-gated; non-holders get
  safe Survey-level navigation/booleans, no opaque response-derived identity enumeration.
  Derived Finding ownership comes from the destination command after source authorization.

## Safe evidence projection (ADR-0064; Slice 53/54 implementation pending)

Survey-derived Finding summaries contain metadata only; approved text comes from
fresh authorized active highlight DTOs. Proposed/new #816 candidates expose
approval selections under result cohort/per-question suppression without personal
access or response IDs. No response URL reconstruction or new filters. Existing
response-addressed Create Finding retains its personal gate; existing linked
highlights keep their distinct source-read audience. Preserve result state and
selected-Finding orchestration; backend owns permission truth and attachment writes.
