# log-explorer module

The Source side of this module (the `SourceReadPort` seam ADR-0119, the four reads `logExplorer.records|window|parsed|periods`, token scopes, the daily body budget, the export `POST /api/v1/log-explorer/export`, the admin `logExplorer.usage`) has no tables, repositories or migrations of its own; the only storage is the Investigations section below (`repositories/`) plus `core.rate_limits` counters.
Design: `docs/design/features/log-explorer/README.md`; contract: `docs/architecture/platform-api/api/log-explorer.md`.

## Invariants

- **Source text is never stored, logged, audited or thrown.** A port call throws only `SourceReadError` whose content is a code (`aborted`, `time_budget_exceeded`, `adapter_failed`, `invalid_request`, `invalid_response`); `leak-boundary.test.ts` scans the module for logging and audit writes.
  - `toSourceReadError` rebuilds every thrown error as a fresh code-only `SourceReadError` from a whitelisted code (a dressed-up one carrying a body in message, cause or extra fields is not passed through); anything else is `adapter_failed`; a malformed answer is `invalid_response`.
- **Every read goes through `guardSourceReadPort`** (`createLogExplorerModule` wires it): request validation, AbortSignal and time budget (also against an adapter that ignores them), row text cut at 8,000 chars with `truncated`, time-reversal marker and window `truncated` recomputed.
  - Refuse an answer that arrives after cancellation or past the deadline; fail closed on a response over the request limit (a window is at most 200 rows with the target; a larger ask is `invalid_request`), outside the `@ap/contract-schemas` v0 shapes, or naming a file/line the request did not ask for or out of file-then-line order.
- **Order is file order then line.** Never re-sort by timestamp; `markTimeReversals` only sets a flag.
- **`unsupported`, `permission_denied`, `source_absent` are answered states**, not errors; no fake trace, Top View or verdict.
- **`EvidenceRef` is `{ fileRef, line, fileSha256, note? }` and nothing else**; an extra key is refused.
- **The synthetic adapter (`adapters/synthetic/`) and `testing/` are dev/test only.** The barrel `index.ts` must not import them; `test-support/log-explorer-dev-assembly.ts` injects the synthetic one; `production-graph.test.ts` fails if the production entry's import closure reaches them. Synthetic output carries `synthetic: true` and the label «합성» ("synthetic").
- **A real adapter proves itself with `testing/source-read-contract.ts`** (`runSourceReadContract(vitest api, target)`; scenario requirements in its header, negative controls included). It is capability-aware: an adapter without parsed data, periods or Top View must answer an allowed `unsupported` reason.
- Limits are start values (design §3.1): change them in `@ap/contract-schemas` `source-read.ts` and `domain/limits.ts` together.

## Read endpoints

- **The right is judged inside the read, per request, and again before the text leaves** (`explorer.source.read` via `checkService`, then `SourceOwnerAccess`); a refusal is the answered state `permission_denied`, not a dispatch `forbidden`.
  - Production passes no `sourceReadPort` and no owner access: reads answer `source_absent` / `source_not_connected` (holder) or `permission_denied` (non-holder). Never wire the synthetic adapter into `server.ts`; `buildServer({ logExplorer })` is the seam.
- **Page cursors are encrypted (AES-256-GCM) and request-bound** (`domain/cursor.ts`): the client never holds or can read an adapter cursor (it may carry log text); `WIRE_CURSOR_MAX` derives from the worst permitted adapter cursor.
  - Change the binding fields together with the contract doc.
- **`read-service.ts` is the only writer of the read event** `explorer.source.read` (closed schema in `@ap/feature-shared`): counts, digest, filter KEYS, result code; if the audit write fails, the read fails.
  - `leak-boundary.test.ts` allows `audit.record` in `read-service.ts`, `export-service.ts` and the investigation files (`INVESTIGATION_AUDIT_OK`) only; `read-endpoints.test.ts` pins that the row holds no body, filter value or file reference.
- Param errors name the field path and the schema's static message, never the value (`domain/read-params.ts`).
- The signal comes from `EndpointHandlerArgs.signal`; menu dispatch aborts it when the client closes the connection.

## Tokens, budget and export

- **Scopes:** `explorer.source.read`, `explorer.export`, `explorer.investigate` are capabilities, hence token scopes (`feature-shared` `CAPABILITY_META`, all sensitive, no Admin bypass). Export is its own right, never implied by the read.
  - Every authenticated token passes the read endpoints' entry gate (`authorize`) so a token without `explorer.source.read` still leaves a body-free attempt audit; the scope and the data right are judged inside the read (`holdsCapability`: no scope = `permission_denied` / `capability_not_held`, no Source access).
  - A service token's Source-owner grant is the same `SourceOwnerAccess` seam; do not add a table.
- **Budget and counters live in `usage-store.ts`, counters only** (rows of `core.rate_limits`, no migration). `domain/budget.ts` says who is counted (token + Actor for a token call, session Actor for a session) and holds the 50 MB all-or-nothing reservation; a reservation pins its UTC day for every write and refund.
  - What is charged is the serialized response body as sent (read: the menu-query envelope; export: the file), never the raw text length. A read is refused before the Source is asked and again after the answer if it would pass the budget; the page is never cut.
- **The export (`export-service.ts`, `export-routes.ts`) refuses before the first byte, never cuts:** rows ≤ 10,000; file ≤ 5 MB (bounded in-memory buffer, nothing stored); quotas — 1 concurrent via a `core.rate_limits` lease released by its own lease id so a late cleanup never frees a replacement, 20 a day, budget.
  - The whole response (Source reads and stream) is capped (`exportTotalMs`, 120 s) below the 150 s lease. Malformed bodies and `investigationId` attempts are audited with `sourceOwner`/digest/format null.
  - The right is judged after every Source page and immediately before every chunk, the first included (token active, capability, Source owner); a failure stops the stream and the audit says `revoked`.
  - `domain/export-format.ts` prefixes CSV cells starting `= + - @`, tab or CR.
- `leak-boundary.test.ts` fails if the module imports anything that reaches an LLM, embedding, search index or notification.
- Limits are start values (`@ap/contract-schemas` `log-explorer-export.ts`: 10,000 rows, 5 MB, 50 MB/day, 20 exports/day, 1 concurrent); change them there together with the contract doc.

## Investigations

Owns the shareable state of a log investigation: its sample set (or the Round it references), saved filters and the evidence locations (API: `docs/architecture/platform-api/api/log-explorer.md`). Everything uses the single menu `log-explorer` (`menu.ts`).

- An `EvidenceRef` is `{ fileRef, line, fileSha256, note? }`: a location, never a body or excerpt. `domain/evidence.ts` refuses any other key; the cap is 100 and a `(fileRef, line)` is held once.
- `round_id` is a plain uuid, no cross-schema FK. A round origin stores no sample set; the read resolves it through the log-lifecycle barrel port (`lifecycleRead.getRoundSampleSet`), never through lifecycle repositories.
  - Create and every versioned write on a round-origin investigation resolve the Round through the same port on the write transaction before mutating; an unresolvable Round refuses the write (`roundId: not_found`), changing nothing and writing no audit row.
- Everything is owner-scoped: the list, the detail and every write find only the caller's own row in the session workspace; another owner's id, another workspace's id and an unknown id are the same answer (`data: null`, `not_found`).
- Stored refs are never deleted when access is lost; the detail returns each with a state (`domain/ref-state.ts`): `no_access` with `capability_lost` or `round_not_visible`. The Source ACL is the read side's seam: every ref carries `sourceAccess: 'unchecked'`; do not fabricate Source reads here.
- Versioned actions lock the row in `currentVersion` (`FOR UPDATE`); the engine answers `conflict` / `not_found`; an archived row is final (`illegal_transition`).
- Every write is one transaction: row change and one `core.audit_log` row. Audit detail has filter KEYS, counts and a note LENGTH only (`packages/feature-shared/src/audit/log-explorer-investigation.ts`, strict); filter keys are identifier-like so a key cannot carry a value.
- The capability `explorer.investigate` (menu permission `explorer:investigate`) is registered in `packages/feature-shared/src/enums/capabilities.ts`, the supported-scope policy and `platform-port/permissions.ts`.
- `logExplorer.evidenceLinks` (`read-endpoints.ts`): reverse lookup of an evidence location, entry right `platform:view`, read only through the log-lifecycle barrel port `deps.lifecycleEvidence` (`lifecycleEvidenceRead`); ids and locations only, no Source access, no audit. `__tests__/lifecycle-boundary.test.ts` pins that no explorer file imports a lifecycle repository or schema.

## Evidence handoff

- `logExplorer.evidenceHandoff` (`investigation-handoff.ts`, pure parts in `domain/handoff.ts`) calls the log-lifecycle `roundEvidenceRefIntake` and the log-knowledge `draftEvidenceIntake` (barrels only, via `deps.handoff`) inside its own transaction; it never writes receiver tables, and a receiver refusal rolls everything back.
  - Right: `explorer.handoff` (menu permission `explorer:handoff`) plus the receiver's own, judged in `authorize` from the raw `input.target.kind` (`canAttach` / `canIntake`, so also on an idempotency replay) and again in `handle`.
- The `unresolved` judgment is ours: one guarded `getWindow(before 0, after 0)` per ref, `ok` / `source_absent` only; anything else (or no port, or a denied Source owner) refuses the handoff, and the window body is dropped at once. Never store an unknown state as unresolved, and never pass a Source body to a receiver, the audit or the answer.
- Contract: `docs/architecture/platform-api/api/log-explorer.md` «Evidence handoff»; audit `explorer.evidence_handed_off` is body-free (`audit/log-explorer-investigation.ts`).
