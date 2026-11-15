# Surveys Feature Agent Guide

## Ownership

- Owns frontend route composition for Survey creation, builder flows, responses, results, and survey-to-action CTAs. Does not own VOC creation, Finding persistence, Task mutation, or permission decisions.
- Owns `/surveys`, `/surveys/:surveyId`, `/surveys/:surveyId/results`, `/surveys/:surveyId/follow-up`, `/surveys/participate`, and `/surveys/:surveyId/respond`. Survey-derived actions may link into Integration or Tasks through approved API contracts.

## Invariants

- Survey Response must never create VOC; it may create Finding or Evidence Highlight through approved actions.
- Hidden personal responses render through safe summaries only.
- Survey CTAs move from response insight to execution, not duplicate customer voice.
- Surveys are scoped to a Managed System in MVP.
- Keep builder and result views simple for MVP. Result summaries expose Create Finding and Request Task where permitted; Link Finding is deferred out of MVP scope (FO ADR-0037).
- Permission-limited responses show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.
- Selected-Finding load/ready/error orchestration stays in Survey; source reads and the Finding-owned Request Task draft host come from `useFindingDetail` and `FindingRequestTaskDraftHost`, imported by their own modules (never `features/findings/public.ts`, which entry graphs ban).

## Bridge-mounted surfaces

- `routes/surveys-search.ts` — router-free list and detail search schemas + validators (`isSurveysSearchValueValid`, `isSurveyDetailSearchValueValid`); the bridge reads them through `operator-screens/surveys-search`.
- `routes/SurveysScreen.tsx` — bridge-safe Survey list screen (list context, URL selection, stale-drop, create) over the host seam; the detail slot is the host's `renderDetail(selectedId, slot)`. Entry `operator-screens/surveys`, which never reaches the detail tree.
- `routes/SurveyResultsScreen.tsx` — bridge-safe Survey results screen (outer metadata states, header, summary) over the host seam. Entry `operator-screens/survey-results`; never imports `features/findings/public.ts` (the summary reaches `FindingRequestTaskDraftHost` and `useFindingDetail` by their own modules).
- `routes/SurveyFollowUpScreen.tsx` — bridge-safe follow-up screen, entry `operator-screens/survey-follow-up`. Host-owned `selection` is controlled: no auto-select, and a filter switch or stale id goes through `onSelect(null)`; `renderDetail(parts)` is where the host places the detail parts. Absent = the review's own selection with first-open auto-select and the standalone aside.
- `routes/SurveyBuilderScreen.tsx` — bridge-safe Survey builder screen (data states, manage gate, Back with a dirty draft confirmed by the screen) over the host seam; the host owns `onBack`. Entry `operator-screens/survey-builder`. The bridge accepts draft loss on menu switch; test-local adapters retain the old blocker assertions without a runtime route.
- `components/participation/SurveyParticipationScreens.tsx` — bridge-safe participation list and respondent form screens, mounted by the platform bridge (platform ADR-0071); retired wrappers live only under `src/test`. Use `variant="embedded"` only in the platform.
- `components/detail/SurveyDetailParts.tsx` — Survey detail as `DetailParts` (`useSurveyDetailParts`: loading / not-found / blocked / error / full); entry `operator-screens/survey-detail`. The standalone Survey detail aside under `src/test/host-adapters` frames these pieces.

## Close-out contract (FO ADR-0067; FO ADR-0055)

Survey-owned follow-up and personal disclosure boundaries: per-response hiding/history is Survey-owned and personal-gated; non-holders get safe Survey-level navigation/booleans, no opaque response-derived identity enumeration. Derived Finding ownership comes from the destination command after source authorization.

## Safe evidence projection (FO ADR-0064; #816 part pending)

- Survey-derived Finding summaries contain metadata only; approved text comes from fresh authorized active highlight DTOs.
- Proposed/new #816 candidates expose approval selections under result cohort/per-question suppression without personal access or response IDs. No response URL reconstruction or new filters.
- Existing response-addressed Create Finding retains its personal gate; existing linked highlights keep their distinct source-read audience.
- Preserve result state and selected-Finding orchestration; backend owns permission truth and attachment writes.

## Verification

- When touched, test builder route state, result summary CTAs, forbidden create-VOC affordances, hidden response summaries, and linked action pending/error states.
