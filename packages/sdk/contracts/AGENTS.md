# @ap/contracts

Contract types and pure functions shared by the platform, server and menus. Keep them free of runtime-environment dependencies so a backend can share them later.

## Rules

- A field addition or rename is a contract change. Update the consumers (kernel, shell, app mock implementations) in the same PR and first decide whether the change belongs in contract 06 or the package-boundary document. Most field names are Candidate.
- Contract tests live in the app integration tests `apps/platform-web/src/__tests__/links/{url-contract,platform-inbound-link}.test.ts`, `__tests__/assembly/{instant,contracts-helpers,measure}.test.ts`, `__tests__/query/menu-query-contract.test.ts` (and `__tests__/saved-view/saved-view-contract.test.ts`): update them with any codec or declaration change. The package's own `test` only checks that `vocab.json` is current: after changing a vocabulary list, run `gen:vocab` and commit the result.
- Reject URLs with an error; never repair them (contract/kernel.md §6).
- When adding a method to `PlatformAdapter`, fix in the same PR every adapter implementation that `pnpm typecheck` then breaks (`testAdapter` in `@ap/kernel/testing`, mock `packages/host/mock-server/src/adapter.ts`, `referenceAdapter` in `@ap/server-conformance` tests), the `@ap/server-conformance` checks, and the tables in [checklist §2](../../../docs/integration/real-server-checklist.md) and [wire-format draft §1](../../../docs/integration/http-adapter-contract.md).
- Export new public API explicitly, and keep build tooling out of the root. Moving files only changes import paths.
- Deployment output and consumer-environment rules belong to [package boundaries §3](../../../docs/integration/platform-packages.md#3-패키지-구성); `check:pack` verifies them.

## Contracts by file

- The app declares the value lists of group/space/menu permissions (ADR-0072); this package holds none.
- Do not widen `ApiResponse` for write actions. Decision [ADR-0054](../../../docs/adr/0054-write-port-declared-actions-idempotency-version.md); server judgment order [checklist §3](../../../docs/integration/real-server-checklist.md).
- The menu declaration snapshot lives here (ADR-0156), because the start kit installs only the release tarballs.
- `instant.ts` — real-instant (epoch ms, ISO with offset) display `formatInstant`·`instantEpochMs`. Never mix with wall-clock (`formatDateTime` in `url.ts`; §6.3).
- `number.ts` — language-following number display `formatNumber(value, lang, { decimals? | minimumFractionDigits?, maximumFractionDigits? })` (`ko` → `ko-KR`, `en` → `en-US`). Menus use it instead of `toLocaleString` (#1890).
- `audit-order.ts` — pure `compareAuditEvents(a, b)`: the `entityAudit` port order (newest time first, ties by `id` ascending; ADR-0085), compared with `instantEpochMs`; used by kernel, `AuditTimeline` and the mock server. It is a separate file because `scripts/vocab.mjs` reads `audit.ts` directly with Node type stripping, so `audit.ts` may hold type imports only.
- `uuid.ts` — `randomUuidV4()`: a UUIDv4 in any browser context (`crypto.randomUUID`, else `getRandomValues` with the version/variant bits pinned; without Web Crypto at all it throws — there is no `Math.random` fallback). Every client-made `Idempotency-Key` (servers accept only UUIDv4) and any other client id use it instead of `crypto.randomUUID()`, which is missing outside a secure context (plain HTTP).
- `guards.ts` — `isRecord` (non-null, non-array object; prototype not inspected): the one shape check before reading fields of untrusted values (stored JSON, server responses). `@ap/ui` may not import `@ap/*`, so it keeps its own sanitizer copy; the mock-server's `isPlainObject` (prototype check) is a different judgment.
- `vocab.json` — generated: the closed vocabularies a server outside this repo or toolchain must follow.

## Verification

Run `lint` and `typecheck`; after `build`, run `check:pack` for the deployment bundle and the outside-repo consumer check. Root check scope follows the root `AGENTS.md`.
