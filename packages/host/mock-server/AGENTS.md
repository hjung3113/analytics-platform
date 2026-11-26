# packages/host/mock-server — development server stand-in

`@ap/mock-server` imitates the server where no real backend exists. The Kernel and common components never import it. Use it only in dev, `--mode mock` and vitest, never in a production build (ADR-0009).

## Rules

- Do not import apps (`apps/*`) or menus (`menus/*/*`, `platform/*`). Menu-specific mock handlers and calculations live in each menu package's `src/mock/`; this package knows no menu.
- Menu data touchpoints are each menu's endpoint declarations (`menus/<space>/<group>/src/endpoints.ts`) and its mock handlers (`src/mock/`). Productivity and cycle aggregation stays on the menu side.
- Menu `src/mock/**` handlers may import this package. `serve()` is an engine-internal step: do not export it publicly.
- Keep tests that look at mock and screen calculation together out of this package.
- Export explicitly from `src/index.ts`; `export *` is forbidden.

## Engine behaviour

- Decide permission and Scope re-verification from the server-side declaration copy or server-owned map, never from the request ([checklist §2-§3](../../../docs/integration/real-server-checklist.md)).
- `auditEvents` seed menu-owned audit targets (metrics) into the same store as equipment events, read by `auditTrail` and `entityAudit`. Registration checks duplicate ids, target type (equipment excluded), metric `scopeId: null` and instants with a zone ([ADR-0048](../../../docs/adr/0048-menu-audit-seeds-join-shared-mock-audit-store.md)).
- Write order (`src/actions/actions.ts`: `MockAction`, `defineMockAction`, `serveAction`; checklist §3 `menuAction`, ADR-0054): shape → idempotency key → permission → Scope → the action's optional input-dependent `authorize` (`can(permission)`, `false` = `forbidden`, like the server's `authorize(actor, tx, input)`) → replay → input → version → handler. Only `ok` is recorded, by `(actor, key)` with no expiry. The engine writes no audit row; audit is the handler's job. `createMockAdapter({ actions? })` validates registration (duplicate id, `menuId`, permission, Scope, `invalidates`, `version` handler).
- Latency: queries default to `DEFAULT_QUERY_LATENCY_MS` (120 ms) + 0–60 ms jitter (`queryDelay`). Writes, audit and annotations stay 80 ms. The `slow` scenario's +2.2 s and the `latency` a call supplies (fixed by tests and E2E) stay unchanged. `createMockAdapter({ latency })` replaces every default delay with one fixed value (no jitter) for suites that send thousands of requests one at a time (server conformance uses 0, #1680); it is process-wide like the world. To see loading states use the DevTools `slow` scenario. Change the constant in one place only.
- Delay and cancellation rules: [docs/delays.md](docs/delays.md).
- Chart annotations (`src/audit/annotations.ts`, ADR-0041): `listAnnotations`, `saveAnnotation`, `deleteAnnotation` decide in the order permission (`analytics:view`) → scenario → validation → Site boundary.
  - Rows keep the `scopeId` of their creation and every read filters by `scopeId`, never by `chartId` alone.
  - The server stamps author and time; they are absent from the wire input (unknown keys are rejected). Trust is null (non-mart data).
  - `mine` is computed per response from the requesting role and never stored. Only the author deletes; success leaves a runtime audit row (`delete`, `annotation`) that `auditTrail` merges.
- A mock action reads a stored file by id through its handler argument `readUpload(id)` (`UploadContent`: the `UploadedFile` fields plus `bytes`), like a server consumer reads an unlinked upload (ADR-0140 §6): null for an unknown id or a file another user uploaded, so the handler answers both alike. Handlers that take no upload id ignore it; a direct handler call in a test may omit it.
- Async handlers are not serialized: the replay store is checked before the `await` and written after it, so the same idempotency key sent twice at once runs the handler twice, and two calls can interleave at the `await`. A handler re-reads any store it appends to after its `await` (a read taken before it may be stale). The Kernel's single-flight write keeps one screen from sending both; the engine does not add a per-key lock.
- `MockEndpoint.provisional` is an optional hook for a menu to judge Trust by the target data's time. It replaces the period-length judgment only for normal, non-empty mart responses; unspecified, empty, error and malformed responses keep the existing judgment. An execution occurrence is judged by `startedAt >= DATA_THROUGH − 24h` (`anchor` is a RecordSequence, not a time, ADR-0094); the reference period does not apply.
