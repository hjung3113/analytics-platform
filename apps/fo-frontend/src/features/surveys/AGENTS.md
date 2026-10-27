# Surveys Feature Agent Guide

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
- Selected-Finding load/ready/error orchestration stays in Survey; source reads and the Finding-owned Request Task draft host come through `features/findings/public.ts`.
- Permission-limited responses must show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.

## Key files

- `apps/fo-frontend/src/features/surveys/routes/surveys-search.ts` — router-free list and detail search schemas + validators (`isSurveysSearchValueValid`, `isSurveyDetailSearchValueValid`); the two route files re-export them, and the bridge reads them through `operator-screens/surveys-search`.
- `apps/fo-frontend/src/features/surveys/routes/SurveysScreen.tsx` — bridge-safe Survey list screen (list context, URL selection, stale-drop, create) over the host seam; the host's `renderDetail(selectedId, slot)` is the detail slot. Entry `operator-screens/surveys`, which never reaches the detail tree.
- `apps/fo-frontend/src/routes/_authed/surveys/index.tsx` — Survey list route adapter: composes `SurveysScreen` with the `SurveyDetail` aside through a route-local seam (TanStack search/navigate).
- `apps/fo-frontend/src/routes/_authed/surveys/$surveyId.tsx` — Survey builder and detail route; the non-builder branch uses `SurveyListScreen`.
- `apps/fo-frontend/src/features/surveys/components/list/SurveyListScreen.tsx` — shared Survey list composition (toolbar, filters, create, detail slot) for the index and detail routes.
- `apps/fo-frontend/src/routes/_authed/surveys/$surveyId.results.tsx` — Survey results presentation and outer metadata states.
- `apps/fo-frontend/src/features/surveys/hooks/useSurveyResultsController.ts` — metadata/results/Follow-up reads, capability readiness, denial persistence, safe content selection, and document title.
- `apps/fo-frontend/src/features/surveys/policy/resultsReadDenial.ts` — sticky denial key/default registration, denial merge, and results-read projection.
- `apps/fo-frontend/src/routes/_authed/surveys/$surveyId.follow-up.tsx` — Survey follow-up route.
- `apps/fo-frontend/src/routes/_authed/surveys/participate.tsx` — answerable Surveys and response history.
- `apps/fo-frontend/src/routes/_authed/surveys/$surveyId_.respond.tsx` — respondent form deep link.
- `apps/fo-frontend/src/features/surveys/components/participation/SurveyParticipationScreens.tsx` — bridge-safe participation list and respondent form screens, used by the standalone routes (through `SurveyParticipationPage.tsx`) and the platform bridge (platform ADR-0071). Use `variant="embedded"` only in the platform.
- `apps/fo-frontend/src/features/surveys/routes/SurveyParticipationPage.tsx` — standalone wrappers: TanStack host seam and document title around the screens.
- `apps/fo-frontend/src/features/surveys/components/respond/` — shared preview and respondent question rendering/branching.
- `apps/fo-frontend/src/features/surveys/components/list/SurveyList.tsx` — Survey list rows and list states.
- `apps/fo-frontend/src/features/surveys/components/detail/SurveyDetail.tsx` — standalone Survey detail aside; frames the pieces of `SurveyDetailParts.tsx`.
- `apps/fo-frontend/src/features/surveys/components/detail/SurveyDetailParts.tsx` — Survey detail as `DetailParts` (`useSurveyDetailParts`: loading / not-found / blocked / error / full) plus the shared pieces; entry `operator-screens/survey-detail`.
- `apps/fo-frontend/src/features/surveys/routes/SurveyBuilderScreen.tsx` — bridge-safe Survey builder screen (data states, manage gate, Back with a dirty draft confirmed by the screen) over the host seam; the host owns `onBack`. Entry `operator-screens/survey-builder`. The standalone route adds the router blocker over `leaveGuard`; the bridge accepts draft loss on menu switch.
- `apps/fo-frontend/src/features/surveys/components/builder/SurveyBuilder.tsx` — Survey builder composition.
- `apps/fo-frontend/src/features/surveys/components/SurveyStatusBadge.tsx` — Survey status labels and badge styles.
- `apps/fo-frontend/src/features/surveys/components/results/SurveyResultsSummary.tsx` — result summary and follow-up actions.
- `apps/fo-frontend/src/features/findings/public.ts` — supported Finding source-read and Request Task host edge used by Survey results.
- `apps/fo-frontend/src/features/surveys/components/results/CreateFindingDraftPanel.tsx` — Finding draft from response excerpts.
- `apps/fo-frontend/src/features/surveys/routes/SurveyFollowUpRoute.tsx` — follow-up decisions view.
- `apps/fo-frontend/src/features/surveys/hooks/useSurveys.ts` — Survey, result, and mutation queries.

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
