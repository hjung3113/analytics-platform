# @ap/server-conformance

Server-boundary conformance suite. It checks the whole `PlatformAdapter` the same way for the mock and for real adapters. The check list is derived from endpoint declarations and the harness `ports` sample; a check without a sample is `skipped`, never counted as passed. Scope of checks and in-house prerequisites are owned by [checklist §4](../../../docs/integration/real-server-checklist.md). The app integration test runs it against the mock; the platform-API integration test runs it against the real server and adapter (test-code devDependency — ADR-0073).

## Rules

- Import only `@ap/contracts` and vitest. Never import `mock-server`, menus or React: the real server must be judged by the same yardstick as the mock, so the suite knows no implementation (lint preset `serverConformance`).
- Add only checks derivable from declarations. Menu-specific data expectations (numbers, rows) belong to menu tests.
- When a contract rule changes (06 §5, §19; package boundary §4), fix the checks here and the checklist document in the same PR.
- vitest is a peer (`^3.2.7`). The platform API runs this suite on an older Vitest major; `describe`/`it`/`expect` attach to the running vitest instance at import time, so it works, and pnpm only warns about the mismatch. Upgrade the platform API's vitest first before using a vitest-3-only API here.

## Skips

- Result states (#1706, #2894): `passed`, `failed`, `skipped` (not tested) and `known-limitation`. Only `passed` is a pass. The harness declares known limitations as `knownLimitations: [{ id, reason }]`, naming the check by its id without a plan-time skip suffix (` — not implemented: …`, ` — no site grants`, …), so the declaration survives an `implemented` or sample change: a declared check that fails is `known-limitation` (its `failure` kept, `reason` set); one that passes fails as a stale declaration; a skipped one stays `skipped`; an unknown id, a blank reason or a repeated id throws before the run. In vitest a known limitation is a skip that names the reason, never a pass.
- Declared gaps: harness `implemented` (port methods the server implements), `siteGrants: false` (server without site grants) and a site-less destination sample (`scopeId: null`) turn the affected checks into `skipped` with a reason.
  - Set `uses` (methods called) and `needsSites` on each check where it is defined; never infer them from the id.
  - A check with empty `uses` is a planning error. `conformance.test.ts` verifies with a recording adapter that every method actually called is in `uses`.
  - Every request sends `context.scopeId`, so checks of Scope-requiring endpoints and actions are all `needsSites`.
- `entityAudit` paging (ADR-0085): the 9 paging checks are `skipped` as `server does not page entityAudit` when the first-page response has no `nextCursor` key, and as `the sample has no audit events to page (…)` when the sample has no audit rows; in both cases send no `cursor`. If the sample fits on one page and no cursor is issued, skip only the 4 checks that need an issued cursor and run the other 5.
- Saved views (ADR-0099): `SavedViewStore` is not a `PlatformAdapter` member, so the sample `ports.savedViews` names two stores (ordinary owner `user`, approval permission `admin`) and the menu id directly.
  - A check's `uses` carries `SavedViewStore` method names (`ConformanceUse`). The sample's presence, not `implemented`, decides whether it runs; without it there is one skipped `savedViews: no sample`. Sample properties may be getters (read at run time).
  - The checks verify that the mock (`@ap/mock-server` `saved-view/saved-view-store.ts`) and the server (`apps/platform-api/src/modules/platform-saved-views`) keep the ADR-0099 rules with identical values: private is invisible and a refusal is an exact-key `{ id, denied, reason }`; group share is read-only; only the owner renames and deletes; an ordinary viewer sees official approval and withdrawal; default is lost; per-action `Result` values.
  - Keep shared wording (`no-access`, refusal reasons, withdrawal memo, change summary) as literals once, in this suite.

## Verification

`pnpm --filter @ap/server-conformance test`, then the app integration test `pnpm --filter @ap/platform-web test`.
