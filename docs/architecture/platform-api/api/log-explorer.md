# Log Explorer

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). Normative contract for the four read endpoints of the log explorer (#1469, node c of [the design](../../../design/features/log-explorer/README.md), [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)). Investigation state (tables, actions), `evidenceLinks`, tokens/export and handoff are other nodes.

## Transport and permission

- `POST /api/v1/menu-query`, owning menu id `log-explorer` (`LOG_EXPLORER_MENU_ID`). Every read declares `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`. `platform:view` is the entry right (every active session). The menu-query route is token callable like all menu reads, but `explorer.source.read` is **session-only** (`CAPABILITY_META`) until node X-f (#1472) supplies the token controls (daily token/Actor body budget): a token cannot be issued with it and a token call is refused `session_required`. X-f removes `sessionOnly` when it adds the budgets.
- The data right is the capability `explorer.source.read` ([05](../05-permission-policy.md)), judged **inside the read, per request**, and again after the Source answered and before the text leaves. A refusal is an answered state (`permission_denied`), not the dispatch outcome `forbidden`, so a screen keeps its shell and shows a request path.
- Judgment order: capability → (Source connected?) → Source-owner rule (`SourceOwnerAccess`, injected; production grants no owner) → Source call → capability and owner again → audit → answer. No adapter connected: a capability holder gets `source_absent` / `source_not_connected`; a non-holder still gets `permission_denied` / `capability_not_held`.
- A bad param is an `error` outcome (`data: null`, `message` = field paths and the schema's static message, never a value). Params are validated with the `@ap/contract-schemas` v0 Source schemas (strict objects), so an over-limit request is refused, never cut.
- Cancel: the route aborts a signal when the client closes the connection before the answer is written; the read passes it into the guarded `SourceReadPort`. A cancelled read answers `error` / `aborted`; a read past its 10 s budget answers `timeout` / `time_budget_exceeded`; a Source failure answers `error` / `adapter_failed` (or `invalid_response`, `invalid_request`). Messages are codes, never Source text. All are audited.

## Reads

| Endpoint id | Params | Data |
| --- | --- | --- |
| `logExplorer.records` | `sampleSet` (ordered file list, `sourceOwner`), `query?` (`text`, `logType`, `module`, `event`, `context`), `cursor?`, `limit?` (1–200, default 50) | `RecordsPage` |
| `logExplorer.window` | `sourceOwner`, `fileRef`, `line`, `before?`, `after?` (each 0–100; `before + after + 1` at most 200) | `WindowPage` |
| `logExplorer.parsed` | `sourceOwner`, `fileRef`, `line` | `ParsedLine` |
| `logExplorer.periods` | same as `records` | `PeriodsPage` |

Every answer is `{ state, reason, synthetic, label, … }`:

- `state`: `ok`, `partial` (the Source answered part of the range), `truncated` (a row was cut to 8,000 characters; the row also carries `truncated: true`), `unsupported` (`reason` is a Source reason code such as `parser_not_connected`, `periods_not_supported`), `permission_denied` (`reason`: `capability_not_held`, `source_owner_not_granted`, `source_denied`), `source_absent` (`reason`: `source_not_connected`, `source_missing`). A state other than `ok`/`partial`/`truncated` carries no rows (`rows: []`, `extractedFields: null`) — never a fake trace or result.
- `synthetic: true` and `label: '합성'` when any returned row or field comes from the synthetic fixture adapter. The production assembly injects no adapter, so a synthetic answer cannot occur there.
- `RecordsPage`: `rows[]` (`fileRef`, `fileOrder`, `line`, `text`, `truncated`, `timestamp`, `timeReversal`, `synthetic`), `nextCursor`, `partial`, `truncated`. `PeriodsPage`: `rows[]` (`fileRef`, `startLine`, `endLine`, `state`, `incomplete`, `synthetic`), `nextCursor`. `WindowPage`: `rows[]`, `truncated`. `ParsedLine`: `extractedFields`, `parserIn`, `parserOut`, `truncated`.
- **Order is the Source's file order, then line.** Nothing re-sorts by timestamp; `timeReversal` only marks a row whose timestamp is earlier than the previous row's.
- A page holds at most 200 rows; the platform stores none of the text.

## Page cursor

`nextCursor` is not the adapter's cursor. It is `base64url(iv ‖ ciphertext ‖ tag)`, AES-256-GCM under a key derived (HKDF-SHA256) from the per-process secret: the ciphertext holds the expiry (30 minutes) and the adapter cursor, so the wire token never reveals an adapter cursor that carries log text; a digest of the request binding (endpoint, workspace, actor, sample-set digest, query, limit) is the authenticated data. The longest token is sized from the longest permitted adapter cursor (512 code units, sealed as UTF-16LE, 2 bytes each, so a lone surrogate survives unchanged): `WIRE_CURSOR_MAX` in `domain/cursor.ts` (1,414 characters), the same bound the request check uses. A cursor sent with a different sample set, query, limit, endpoint or actor, a changed byte, an expired cursor or one signed by another process is refused: `error` / `cursor_invalid` (audited). The key is random per process (`LogExplorerReadDeps.cursorKey` overrides it), so a cursor does not survive a restart or reach another instance; the client restarts at the first page.

## Audit

Each read writes one `core.audit_log` row, event `explorer.source.read`, subject type `log_explorer_source`, in its own transaction. If that write fails the read fails and no text is returned. Detail (closed schema, `@ap/feature-shared` `audit/log-explorer.ts`): `endpoint`, `sourceOwner`, `sampleSetDigest` (null for window/parsed), `fileCount`, `filterKeys` (names such as `text`, `context.job`, never values), `rowCount`, `bytes`, `result` (`ok`, `partial`, `truncated`, `unsupported`, `permission_denied`, `source_absent`, `aborted`, `time_budget_exceeded`, `adapter_failed`, `invalid_response`, `invalid_request`, `cursor_invalid`). Never a row text, parser field, filter value or file reference. A token call also carries `api_token_id` (added by the audit service). The event is not in the platform audit projection (`core.platform_audit_events` allow-list), so it does not appear in an entity's history view.

## Assembly

`buildServer({ logExplorer })` is the only seam: `sourceReadPort` (absent in production), `sourceOwnerAccess` (default `denyAllSourceOwners`), `cursorKey`, `clock`. The dev/test assembly (`src/test-support/log-explorer-dev-assembly.ts`) injects the synthetic adapter; `log-explorer/__tests__/production-graph.test.ts` fails if the production entry reaches it.
