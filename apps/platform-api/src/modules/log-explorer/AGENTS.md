# log-explorer module

Node a of the log explorer (#1467; design `docs/design/features/log-explorer/README.md`, ADR-0119): the `SourceReadPort` seam only. No tables, repositories, endpoints or migrations yet (nodes b/c); no tokens/export (f), handoff (h).

## Invariants

- **Source text is never stored, logged, audited or thrown.** The only error a port call throws is `SourceReadError`, whose content is a code (`aborted`, `time_budget_exceeded`, `adapter_failed`, `invalid_request`, `invalid_response`). `toSourceReadError` rebuilds every thrown error as a fresh code-only `SourceReadError` from a whitelisted code (a dressed-up `SourceReadError` with a body in message, cause or extra fields is not passed through); anything else is `adapter_failed`. A malformed answer is `invalid_response`. `leak-boundary.test.ts` scans the module for logging and audit writes.
- **Every read goes through `guardSourceReadPort`** (`createLogExplorerModule` wires it): request validation, AbortSignal and time budget (also against an adapter that ignores them), row text cut at 8,000 chars with `truncated`, time-reversal marker recomputed, window `truncated` recomputed, an answer that arrives after cancellation or past the deadline refused, fail closed on a response over the request limit (a window is at most 200 rows with the target; a larger ask is `invalid_request`), outside the `@ap/contract-schemas` v0 shapes, or naming a file/line the request did not ask for or out of file-then-line order.
- **Order is file order then line.** Never re-sort by timestamp; `markTimeReversals` only sets a flag.
- **`unsupported`, `permission_denied`, `source_absent` are answered states**, not errors; no fake trace, Top View or verdict.
- **`EvidenceRef` is `{ fileRef, line, fileSha256, note? }` and nothing else**; an extra key is refused.
- **The synthetic adapter (`adapters/synthetic/`) and `testing/` are dev/test only.** The barrel `index.ts` must not import them; `test-support/log-explorer-dev-assembly.ts` injects the synthetic one. `production-graph.test.ts` fails if the production entry's import closure reaches them. Synthetic output carries `synthetic: true` and the label «합성».
- **A real adapter proves itself with `testing/source-read-contract.ts`** (`runSourceReadContract(vitest api, target)`); the scenario requirements are in its header. It is capability-aware: an adapter without parsed data, periods or Top View must answer an allowed `unsupported` reason. Its assertions have negative controls in `source-read-contract.negative.test.ts`.
- Limits are start values (design §3.1); change them in `@ap/contract-schemas` `source-read.ts` and `domain/limits.ts` together.
