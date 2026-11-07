# Log Explorer

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). Normative contract for the four read endpoints of the log explorer (#1469, node c of [the design](../../../design/features/log-explorer/README.md), [ADR-0119](../../../adr/0119-log-explorer-source-read-port-and-evidence-refs.md)). Tokens, the daily body budget, the export REST and the admin usage read are node f (#1472, sections at the end). Investigation state (tables, actions), `evidenceLinks` and handoff are other nodes.

## Transport and permission

- `POST /api/v1/menu-query`, owning menu id `log-explorer` (`LOG_EXPLORER_MENU_ID`). Every read declares `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`. `platform:view` is the entry right (every active session). Token callable like all menu reads; every authenticated token passes the entry gate (#1472; the generic `workspace.read` token entry is not asked) so that a refusal is always an audited answer. The token's scope (`explorer.source.read`) and the data right below are judged inside the read: a token without the scope is answered `permission_denied` / `capability_not_held` with an attempt audit and no Source access.
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

Each read writes one `core.audit_log` row, event `explorer.source.read`, subject type `log_explorer_source`, in its own transaction. If that write fails the read fails and no text is returned. Detail (closed schema, `@ap/feature-shared` `audit/log-explorer.ts`): `endpoint`, `sourceOwner`, `sampleSetDigest` (null for window/parsed), `fileCount`, `filterKeys` (names such as `text`, `context.job`, never values), `rowCount`, `bytes` (the serialized body as sent), `viaToken`, `result` (`ok`, `partial`, `truncated`, `unsupported`, `permission_denied`, `source_absent`, `aborted`, `time_budget_exceeded`, `adapter_failed`, `invalid_response`, `invalid_request`, `cursor_invalid`, `budget_exceeded`). Never a row text, parser field, filter value or file reference. A token call also carries `api_token_id` (added by the audit service). The event is not in the platform audit projection (`core.platform_audit_events` allow-list), so it does not appear in an entity's history view.

## Assembly

`buildServer({ logExplorer })` is the only seam: `sourceReadPort` (absent in production), `sourceOwnerAccess` (default `denyAllSourceOwners`), `cursorKey`, `clock`. The dev/test assembly (`src/test-support/log-explorer-dev-assembly.ts`) injects the synthetic adapter; `log-explorer/__tests__/production-graph.test.ts` fails if the production entry reaches it.

## Tokens, daily body budget and usage (#1472, design §4.1)

- **Scopes** `explorer.source.read` (the reads above; alias «로그 탐색(조회)»), `explorer.export` (export below, never in the alias), `explorer.investigate` (registered; investigation actions are node b). Effective right = the Actor's current permission ∩ the token's scopes, then the Source-owner rule (`SourceOwnerAccess`). A **service token** needs its system Actor to hold the capability and an explicit Source-owner grant (admin-issued, ADR-0116). Production grants no owner yet (backlog, #1469).
- **Same limits as a session** (200 rows, 8,000 chars, window 100, 10 s).
- **Daily body budget:** every token read adds the byte length of the serialized response body as sent (JSON with escaping, row metadata, cursor and the envelope; not the raw text length) to `bytes` of the token and of its Actor for the UTC day; the budget is 50 MB each. A token (or Actor) that has used the day is refused **before** the Source is asked, and an answer that would pass it is refused whole after: `outcome: 'error'`, `data: null`, `message: 'explorer.budget_exceeded'`, audit result `budget_exceeded` (rows 0, bytes 0). Never a cut page. A reservation pins one UTC day for all its writes and refunds. A session read is counted for the usage read but not limited.
- **Counters only** (`usage-store.ts`): rows of the existing `core.rate_limits` (route group `explorer_usage`, key `<workspace>:<t|a|s>:<id>:<metric>:<yyyy-mm-dd>`, metrics `bytes`, `exportBytes`, `reads`, `exports`), saturating at 2³¹−1, kept 7 days after their day by the existing purge job. `t` = token, `a` = Actor (token calls; for `exports` all channels), `s` = session Actor. No body, filter value or file reference is ever a key or value. Export leases (route group `explorer_export_lease`) expire by themselves after 150 s.
- **`logExplorer.usage`** (menu-query, `console:access` = `workspace.admin`, session-only so a token is `forbidden`): params `day?` (`yyyy-mm-dd`, today by default, at most 7 days back). Data `usageResponse` (`@ap/contract-schemas`): `day`, `limits { dailyBodyBytes, dailyExports }`, `rows[]` (`kind` token|actor|session, `id`, `day`, `bytes`, `readBytes`, `exportBytes`, `reads`, `exports`, `atLimit`), biggest `bytes` first, at most 500. What counts as an anomaly is measured later (backlog).

## Export REST (#1472, design §5)

`POST /api/v1/log-explorer/export`, session cookie or Bearer token (`config.tokenCallable`; no CSRF step, like the menu-query read). Prefix `LOG_EXPLORER_ROUTE_PREFIX`, plugin `export-routes.ts`, service `export-service.ts`, schemas `exportRequest` / `exportError` (`@ap/contract-schemas` `v0`, `log-explorer-export.ts`).

- **Request** `{ sampleSet | investigationId, query, range: { rows }, format: 'csv' | 'jsonl' }`. One request is one export. `investigationId` (node b) is refused `422 explorer.investigation_unsupported`; both or neither source, an unknown format or a malformed body is `422 validation.failed` (`detail.fields` paths and codes, no values). `range.rows` is the number of leading rows (file order, then line) the file holds; a start position needs a Source-port change (backlog).
- **Right:** `explorer.export` (own capability; `explorer.source.read` neither required nor enough) plus the Source-owner rule, judged for this request. A non-holder gets `403 explorer.forbidden` before anything about limits, quotas or the Source is learned.
- **Success:** `200`, `text/csv; charset=utf-8` (header row, RFC 4180 quoting, `\r\n`) or `application/x-ndjson`, `Content-Disposition: attachment; filename="log-explorer-export.<ext>"`, `Content-Length`, `Cache-Control: no-store`. Columns: `fileRef, fileOrder, line, timestamp, text, truncated, timeReversal, synthetic`. A CSV text cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`. Nothing is stored or cached.
- **Limits are refusals, never a cut file:** `range.rows` over 10,000 or a file over 5 MB → `413 explorer.range_too_large` before the first byte. The server reads the Source page by page into one bounded in-memory buffer (at most 5 MB + one page; discarded with the request), so an over-size request is known before the status line. A `partial`, unsupported, absent or failing Source answer, or the 120 s export time cap → `503 explorer.source_unavailable`.
- **Quotas:** 1 concurrent export per token and per Actor → `429 explorer.export_busy`; 20 exports a day per token and per Actor (session and token exports together) → `429 explorer.export_daily_limit`; the token/Actor daily body budget (above) → `429 explorer.budget_exceeded`. The file's bytes are taken from the budget before the first byte.
- **Judged again:** after every Source page, once more before the first byte, and at every chunk boundary of the stream (64 KiB; token still active, capability, Source owner). A revoked token, a reduced permission or a revoked Source-owner grant stops the stream there: the connection is cut before the declared `Content-Length`, so the client can tell the file is not whole. The next call is refused (`401 auth.token_invalid` for the token, `403 explorer.forbidden` otherwise).
- **Cancel:** the client closing the connection aborts the Source read (`aborted`) or the stream.
- **Audit** (`explorer.export`, subject `log_explorer_source`, closed body-free schema in `@ap/feature-shared`): `sourceOwner`, `sampleSetDigest`, `fileCount`, `filterKeys`, `format`, `rowCount`, `bytes`, `viaToken` (+ `api_token_id` for a token), `result` = `ok` (the stream started; the row is written before the first byte, and if it cannot be written nothing is sent), `forbidden`, `budget_exceeded`, `range_too_large`, `source_unavailable`, `export_busy`, `export_daily_limit`, `investigation_unsupported`, `invalid_request`, or a second row `revoked` / `aborted` for a stream that stopped (`bytes` = bytes handed to the connection). An invalid body (`invalid_request`) and `investigationId` are audited too, with `sourceOwner`, `sampleSetDigest` and (for an invalid body) `format` null, `fileCount` 0 and no filter key beyond an investigation request's own query keys. The lease of the 1-concurrent rule is released by its own id; the whole response is capped at 120 s, below the 150 s lease.
- **No LLM / index path:** the module imports nothing that reaches an LLM, embedding, search index or notification; `leak-boundary.test.ts` pins it.

Assembly seams (`buildServer({ logExplorer })`, tests only): `usage` (counter store), `exportChunkBytes`, `beforeExportChunk`, `exportTotalMs`.

## Investigations (node b, #1468)

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the log explorer investigation state (#1468 node b): two reads and five writes of menu `log-analysis`. Design and decisions: the log-explorer design (`docs/design/features/log-explorer/`) §3.2, §4, §5 and ADR-0119. Not in this node: `SourceReadPort` and the record reads (`records`, `window`, `parsed`, `periods`; nodes a/c), `evidenceLinks` (node d), export and token scope (node f), `evidenceHandoff` (node h), screens (node g).

### Transport and permission

- Owning menu id `log-analysis` (`INVESTIGATION_MENU_ID`; its manifest comes with node g). Reads: `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`; every active workspace session may read. The workspace AND the owner are the session actor's; no param names either.
- A bad param is an `error` outcome (HTTP 200, `data: null`, `message`). The outcome set has no `not_found`: an unknown id, another workspace's id and another owner's id all answer `ok` with `data: null` (the list answers an empty page), so existence never leaks.
- Writes: `POST /api/v1/menu-action`, `requiresScope: false`, menu permission `explorer:investigate` (capability `explorer.investigate`: workspace-scoped, sensitive, `adminModuleBypass: 'none'` (registered by #1472), requestable with no Managed System, refused for a User recipient). The investigation belongs to its creator: every write other than create finds only the caller's own row, so another owner's id (an admin's too) answers `not_found`, never `forbidden`.
- Refusals use the dispatch envelope: `outcome: 'invalid'` with `fieldErrors: [{ path, code }]`; `outcome: 'conflict'` is only an `expectedVersion` mismatch (`version` = the current one), nothing is written; creates replay by `idempotencyKey`. Unknown input keys are refused by the engine.

### Reads

| Endpoint id | Params | Data |
| --- | --- | --- |
| `logExplorer.investigations` | `status?` (`open`\|`archived`), `page` (0-based), `pageSize` (50 default, 200 max) | `{ rows: InvestigationSummary[], total }`, own investigations, newest update first |
| `logExplorer.investigationDetail` | `investigationId` (uuid) | `InvestigationDetail` or `null` |

`InvestigationSummary`: `{ id, title, origin, roundId, status, version, evidenceCount, createdAt, updatedAt }`. `InvestigationDetail`: the summary fields without `evidenceCount`, plus `filters`, `sampleSet`, `sampleSetState`, `canInvestigate` and `evidence`.

- `sampleSet` is `{ files: [{ fileRef, order, sha256 }], sourceOwner }` (the shape is defined once by the log-lifecycle `validation_round.sample_set`, [log-lifecycle.md](log-lifecycle.md)). `origin: 'standalone'` returns the stored set (`sampleSetState: 'inline'`). `origin: 'round'` stores only `roundId` and the read resolves the Round's set through the lifecycle read port in the caller's workspace (`'round'`); a Round that cannot be resolved answers `sampleSet: null`, `sampleSetState: 'round_unavailable'`.
- `evidence` is `[{ ref: { fileRef, line, fileSha256, note? }, state, sourceAccess }]` in stored order. A stored ref is never deleted when access is lost; it comes back with a `state`: `{ code: 'available' }` or `{ code: 'no_access', reason }` with `reason` `capability_lost` (the reader no longer holds `explorer.investigate`; `canInvestigate: false`) or `round_not_visible` (the Round could not be resolved). The state applies to all refs of one investigation alike and never fails the read. **Seam (node c):** `sourceAccess` is always `'unchecked'`: the Source ACL (`explorer.source.read` on the `sourceOwner`) needs the `SourceReadPort`, so `available` means «not refused by this node», not «the Source would open it». Opening a ref re-reads the Source with the reader's rights at that moment (design §3.2).

### Writes

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logExplorer.investigationCreate` | `title`, `origin` (`standalone`\|`round`), `sampleSet` (standalone) or `roundId` (round) | none (`idempotencyKey`) |
| `logExplorer.investigationUpdate` | `id`, `title?`, `filters?` (at least one) | `expectedVersion` |
| `logExplorer.evidenceAdd` | `id`, `ref` `{ fileRef, line, fileSha256, note? }` | `expectedVersion` |
| `logExplorer.evidenceRemove` | `id`, `ref` `{ fileRef, line }` | `expectedVersion` |
| `logExplorer.investigationArchive` | `id` | `expectedVersion` |

- `title`: 1–200 characters, trimmed, no control character. `sampleSet` is parsed by the log-lifecycle parser (codes under `sampleSet.*`). `roundId` must be a Round of the caller's workspace (`roundId: not_found`); the origin, the round reference and the sample set never change after create.
- A write on a round-origin investigation requires the Round to resolve through the lifecycle read port on the write transaction: `investigationCreate` judges the `roundId` input, and the four versioned actions re-judge the referenced Round before mutating. After the Round is gone — or belongs to another workspace — every versioned action answers `roundId: not_found` like create, changing nothing, bumping no version and writing no audit row. Standalone investigations are unaffected; the stored refs are kept and the detail still answers `round_not_visible`.
- `filters`: an object of at most 50 keys; a key is an identifier (`^[A-Za-z][A-Za-z0-9_.-]{0,63}$`, anything else `filters.<key>: malformed`), a value is a scalar (string up to 500 characters, finite number, boolean, null) or a list of at most 50 scalars; nested objects are `malformed`. Saved whole: `filters: {}` clears.
- `ref`: `fileRef` up to 1024 characters; `line` an integer from 1; `fileSha256` 64 lower-case hex; `note` up to 500 characters (blank is dropped). **No body or excerpt is ever stored**: any other key is `ref.<key>: malformed`. A location `(fileRef, line)` is held once (`ref: duplicate`), at most **100** per investigation (`ref: too_many`; the DB also checks the cap), removing a location not held is `ref: not_found`.
- An archived investigation is final. The engine compares `expectedVersion` before the row is judged: a stale version answers `conflict` (`version` = the archived row's current one) for every action; only a current version reaches the row, and every write, `investigationArchive` included, then answers `id: illegal_transition`.
- Every write is one transaction: the row change (`row_version + 1`) and one `core.audit_log` row, subject type `investigation`. Event types and detail (strict, body-free): `explorer.investigation.created` `{ origin, roundId, fileCount, filterKeys }`, `explorer.investigation.updated` `{ changed[], filterKeys }`, `explorer.investigation.archived` `{ evidenceCount }`, `explorer.evidence.added` `{ evidenceCount, noteLength }`, `explorer.evidence.removed` `{ evidenceCount }`. Filter **keys** only, never a value, a file location, a hash or a note's text (ADR-0020 spirit).

### Storage

Schema `log_explorer` (migration 0109), table `investigation`: `id, workspace_id, title, owner_actor_id, origin, round_id (plain uuid, no cross-schema FK), sample_set (null for a round origin), filters, evidence (jsonb array), status, row_version, created_at, updated_at`. CHECKs: title length, origin and status sets, origin shape (`round` ⇒ `round_id` set and `sample_set` null; `standalone` ⇒ `round_id` null and `sample_set` an object), filters an object, evidence an array of at most 100. `platform_app`: SELECT, INSERT and a column-limited UPDATE (`title, filters, evidence, status, row_version, updated_at`), no DELETE; trigger `investigation_guard` refuses a changed identity/origin column, a `row_version` that does not rise by exactly 1 and any edit of an archived row.
