# Surveys Feature Agent Guide

## Ownership

- Owns frontend route composition for Survey creation, builder flows, responses, results, and survey-to-action CTAs. Does not own VOC creation, Finding persistence, Task mutation, or permission decisions.
- Survey-derived actions may link into Integration or Tasks through approved API contracts.

## Invariants

- Survey Response must never create VOC; it may create Finding or Evidence Highlight through approved actions.
- Hidden personal responses render through safe summaries only.
- Survey CTAs move from response insight to execution, not duplicate customer voice.
- Surveys are scoped to a Managed System in MVP.
- Keep builder and result views simple for MVP. Result summaries expose Create Finding and Request Task where permitted; Link Finding is deferred out of MVP scope (FO ADR-0037).
- Permission-limited responses show approved summaries or request-access paths.
- Preserve Survey context during linked object creation.
- Selected-Finding load/ready/error orchestration stays in Survey; source reads and the Finding-owned Request Task draft host come from `useFindingDetail` and `FindingRequestTaskDraftHost`, imported by their own modules.

- Without a host `leaveGuard`, the Survey builder declares a dirty draft to the host seam's `useUnsavedGuard`, so the platform bridge asks before a menu switch drops it (#2533); test-local adapters retain the old blocker assertions without a runtime route.

## Close-out contract (FO ADR-0067; FO ADR-0055)

Survey-owned follow-up and personal disclosure boundaries: per-response hiding/history is Survey-owned and personal-gated; non-holders get safe Survey-level navigation/booleans, no opaque response-derived identity enumeration. Derived Finding ownership comes from the destination command after source authorization.

## Safe evidence projection (FO ADR-0064; #816 part pending)

- Survey-derived Finding summaries contain metadata only; approved text comes from fresh authorized active highlight DTOs.
- Proposed/new #816 candidates expose approval selections under result cohort/per-question suppression without personal access or response IDs. No response URL reconstruction or new filters.
- Existing response-addressed Create Finding retains its personal gate; existing linked highlights keep their distinct source-read audience.
- Preserve result state and selected-Finding orchestration; backend owns permission truth and attachment writes.

## Verification

- When touched, test builder route state, result summary CTAs, forbidden create-VOC affordances, hidden response summaries, and linked action pending/error states.
