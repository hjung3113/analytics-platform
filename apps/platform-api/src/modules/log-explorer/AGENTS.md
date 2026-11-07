# log-explorer module

Node a (#1467; design `docs/design/features/log-explorer/README.md`, ADR-0119): the `SourceReadPort` seam. Node c (#1469): the four reads `logExplorer.records|window|parsed|periods` (`read-endpoints.ts`, `read-service.ts`, contract `docs/architecture/platform-api/api/log-explorer.md`). No tables, repositories or migrations yet (node b); no tokens/export (f; `explorer.source.read` stays session-only in `CAPABILITY_META` until f adds the token budgets and removes `sessionOnly`), handoff (h), `evidenceLinks` (d).

## Invariants

- **Source text is never stored, logged, audited or thrown.** The only error a port call throws is `SourceReadError`, whose content is a code (`aborted`, `time_budget_exceeded`, `adapter_failed`, `invalid_request`, `invalid_response`). `toSourceReadError` rebuilds every thrown error as a fresh code-only `SourceReadError` from a whitelisted code (a dressed-up `SourceReadError` with a body in message, cause or extra fields is not passed through); anything else is `adapter_failed`. A malformed answer is `invalid_response`. `leak-boundary.test.ts` scans the module for logging and audit writes.
- **Every read goes through `guardSourceReadPort`** (`createLogExplorerModule` wires it): request validation, AbortSignal and time budget (also against an adapter that ignores them), row text cut at 8,000 chars with `truncated`, time-reversal marker recomputed, window `truncated` recomputed, an answer that arrives after cancellation or past the deadline refused, fail closed on a response over the request limit (a window is at most 200 rows with the target; a larger ask is `invalid_request`), outside the `@ap/contract-schemas` v0 shapes, or naming a file/line the request did not ask for or out of file-then-line order.
- **Order is file order then line.** Never re-sort by timestamp; `markTimeReversals` only sets a flag.
- **`unsupported`, `permission_denied`, `source_absent` are answered states**, not errors; no fake trace, Top View or verdict.
- **`EvidenceRef` is `{ fileRef, line, fileSha256, note? }` and nothing else**; an extra key is refused.
- **The synthetic adapter (`adapters/synthetic/`) and `testing/` are dev/test only.** The barrel `index.ts` must not import them; `test-support/log-explorer-dev-assembly.ts` injects the synthetic one. `production-graph.test.ts` fails if the production entry's import closure reaches them. Synthetic output carries `synthetic: true` and the label «합성».
- **A real adapter proves itself with `testing/source-read-contract.ts`** (`runSourceReadContract(vitest api, target)`); the scenario requirements are in its header. It is capability-aware: an adapter without parsed data, periods or Top View must answer an allowed `unsupported` reason. Its assertions have negative controls in `source-read-contract.negative.test.ts`.
- Limits are start values (design §3.1); change them in `@ap/contract-schemas` `source-read.ts` and `domain/limits.ts` together.

## Read endpoints (node c)

- **The right is judged inside the read, per request, and again before the text leaves** (`explorer.source.read` via `checkService`, then `SourceOwnerAccess`). A refusal is the answered state `permission_denied`, not a dispatch `forbidden`. Production passes no `sourceReadPort` and no owner access: reads answer `source_absent` / `source_not_connected` (holder) or `permission_denied` (non-holder). Never wire the synthetic adapter into `server.ts`; `buildServer({ logExplorer })` is the seam.
- **Page cursors are encrypted (AES-256-GCM) and request-bound** (`domain/cursor.ts`): the client never holds or can read an adapter cursor (it may carry log text); `WIRE_CURSOR_MAX` derives from the worst permitted adapter cursor. Change the binding fields together with the contract doc.
- **`read-service.ts` is the only audit writer** (event `explorer.source.read`, closed schema in `@ap/feature-shared`): counts, digest, filter KEYS, result code. If the audit write fails the read fails. `leak-boundary.test.ts` allows `audit.record` in that file only; `read-endpoints.test.ts` pins that the row holds no body, filter value or file reference.
- Param errors name the field path and the schema's static message, never the value (`domain/read-params.ts`).
- The signal comes from `EndpointHandlerArgs.signal` (menu-dispatch aborts it when the client closes the connection).
