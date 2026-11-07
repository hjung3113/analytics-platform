# Log Lifecycle

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the development project, its append-only history and the validation rounds (#1444 node c): six reads and seven writes of menu `log-models`. Design and decisions: the log-lifecycle design (`docs/design/features/log-lifecycle/`) §3–§5 and ADR-0117. Manual validation attachments (node c2, #1451) are included (one read, one write; see below). Node d (#1445) adds the validation request queue: [§Validation request queue](#validation-request-queue-node-d-1445). Not here yet (node e): the Gate.

## Transport and permission

- Owning menu id `log-models` (`LOG_MODELS_MENU_ID`, already a planned manifest in `menus/log-dev/log-models`). Reads: `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`; every active workspace session may read; the workspace is the session actor's and no param names it.
- A bad param is an `error` outcome (HTTP 200, `data: null`, `message`), never an empty page. The outcome set has no `not_found`: an unknown or other-workspace id answers `ok` with `data: null` (the list reads answer an empty page).
- Writes: `POST /api/v1/menu-action`, `requiresScope: false`. Project actions declare menu permission `lifecycle:project-manage` (capability `lifecycle.project.manage`), round actions `lifecycle:round-manage` (`lifecycle.round.manage`). Both capabilities are workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, refused for a User recipient (supported-scope policy). Developers receive them by request.
- Refusals use the dispatch envelope: HTTP 200 `{ outcome: 'invalid', fieldErrors: [{ path, code }] }`; `outcome: 'conflict'` is only an `expectedVersion` mismatch (`version` = the current one); a missing or other-workspace target of a versioned action is `not_found`; creates replay by `idempotencyKey`.

## Reads

| Endpoint id | Params | Data |
| --- | --- | --- |
| `logLifecycle.models` | `q`, `page`, `pageSize`, `sorting`, `filters` | `{ rows: ModelRow[], total }` |
| `logLifecycle.projectDetail` | `projectId` (uuid) | `ProjectDetail` or `null` |
| `logLifecycle.projectEvents` | `projectId`, `page`, `pageSize` (offset page, 50 default, 200 max) | `{ rows: EventRow[], total }`, newest first (`seq desc`) |
| `logLifecycle.rounds` | `projectId` | `{ rows: RoundSummary[] }`, `seq desc` |
| `logLifecycle.roundDetail` | `roundId` | `RoundDetail` or `null` |
| `logLifecycle.roundEvidence` | `roundId` | `{ rows: [{ id, name, sizeBytes, mimeType, uploadedByActorId, linkedAt }] }` or `null` (see Manual validation attachment) |

`models`: the base rows are the knowledge models (`knowledge.equipment_model`, read directly: see 02 §Log Lifecycle), so a model without a project is a row with `project: null`. Row: `{ id, code, name, active, version, vendorId, vendorName, processes[{id,name}], createdAt, updatedAt, project }` with `project: null | { projectId, stage, kind, ownerActorId, latestRound: { id, seq, status } | null }`. `project` is the model's OPEN project (not `completed`, not `cancelled`). Sort ids: those of `logKnowledge.models` plus `stage` (`code, name, vendorName, active, softwareCount, stage, createdAt, updatedAt`); same `q` / page / sorting rules as [log-knowledge.md §Common params](log-knowledge.md). Filter fields (ADR-0105): `active`, `id`, `vendorId`, `processes` as in `logKnowledge.models`, and `stage` (ops `in`, `notIn`, `isEmpty`, `isNotEmpty`; values the stage set `registered|kickoff|alpha|beta|completed|cancelled`; rows show only the open project, so `completed`/`cancelled` match nothing under `in`): `isEmpty` = the model has no open project, `notIn` excludes models without one (ADR-0105). Not yet: the `validation` filter and the pending-request count (a screen concern, node f; the request tables exist since node d).

`ProjectDetail`: `{ id, modelId, model: { code, name, vendorName } | null, softwareId, kind, stage, owner: { id, displayName }, targetDate, nextStages[], reopenTo, openRound: { id, seq } | null, version, createdBy, createdAt, updatedBy, updatedAt }`. `nextStages` is what `projectSetStage` accepts now (never `completed`); `reopenTo` is where `projectReopen` would put the project (`null` = not reopenable).

`EventRow`: `{ id, seq, kind, actor: { id, displayName }, at, before, after, reason }`. `RoundSummary`: `{ id, projectId, seq, stage, status, sampleCount, sampleManifestDigest, specPin, note, version, createdBy, createdAt, closedBy, closedAt }`. `RoundDetail` is the same without `sampleCount` plus `sampleSet: { files: [{ fileRef, order, sha256 }] (by `order`), sourceOwner }`; no request/attempt/gate sections yet. `specPin` is `{ revisionId, changeSetDigest }` or `null` (shown as 미고정: the model had no published revision when the round opened).

## Writes

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logLifecycle.projectCreate` | `modelId`, `softwareId?`, `kind` (`new`\|`redevelopment`), `ownerActorId`, `targetDate?` (`YYYY-MM-DD`) | none (`idempotencyKey`) |
| `logLifecycle.projectSetStage` | `id`, `toStage`, `reason?` (required for `cancelled`) | `expectedVersion` |
| `logLifecycle.projectReopen` | `id`, `reason` | `expectedVersion` |
| `logLifecycle.projectUpdate` | `id`, `ownerActorId?`, `targetDate?` (null clears), `softwareId?` (null clears) | `expectedVersion` |
| `logLifecycle.roundOpen` | `projectId`, `sampleSet`, `note?` | none (`idempotencyKey`) |
| `logLifecycle.roundClose` | `id` | `expectedVersion` |
| `logLifecycle.roundEvidenceAttach` | `roundId`, `attachmentIds` (1–20, unique uuids) | none (`idempotencyKey`) |

`roundOpen` has no `specPin` input: the server computes it (below). Unknown input keys are `unexpected_field`.

Every project write is one transaction: the row change (`row_version + 1`), the `development_event` row and the `core.audit_log` row. A save that changes nothing answers `ok` with the current version and writes nothing. Round writes write the audit row and no `development_event` (the closed event kinds have no round kind).

### Manual validation attachment (#1451, design D6)

Manual validation records are Core attachments linked to a Round with parent kind `validation_round` (no new table; the parent seam is in [attachments.md](attachments.md)). The caller first uploads with `POST /attachments`, then calls `roundEvidenceAttach { roundId, attachmentIds }`. Right: `lifecycle.round.manage` (menu permission `lifecycle:round-manage`, like `roundOpen`/`roundClose`). The Round must be `open` (`roundId: illegal_transition` on a closed one, `roundId: not_found` for an unknown or other-workspace id). Each attachment must be an unlinked, non-archived upload of the caller; any miss is `attachmentIds.<i>: invalid` and the whole call rolls back (one transaction with the audit row); `attachmentIds` is `required` when empty, `too_many` above 20 (start value), `duplicate` on a repeated id. The audit row `lifecycle.round.evidence_attached` (subject `validation_round`, action `update`) carries `{ projectId, seq, count }` and no filename or key.

Each attached file also gets an Entity Link `manual_validation_attachment → validation_round` (`evidence_of`, `managed_system_id` NULL, `internal_only`; [ADR-0123](../../../adr/0123-entity-links-extend-to-targets-without-managed-system.md), contract [06](../06-entity-linking-contract.md#links-without-a-managed-system-adr-0123)). The link row and its `entity_link.created` audit are written in the same transaction as the attach and its `evidence_attached` audit, so a failed link write rolls the attach back. Both ends are judged by their owning module's read permission; the link is command-only (not creatable, listed or detachable through `/entity-links`). Gate read port: `readRoundEvidenceLinks(deps, actor, roundId)` (log-lifecycle barrel) returns the Round's links, oldest first, with the Round's own visibility (`platform:view`, Round in the actor's workspace) or `null`; it carries no Gate logic (#1446).

Read: `logLifecycle.roundEvidence { roundId }` (right `platform:view`) answers `{ rows: [{ id, name, sizeBytes, mimeType, uploadedByActorId, linkedAt }] }` ordered by `linkedAt`, or `data: null` for an unknown or other-workspace Round. The bytes come from `GET /attachments/:id/download`, allowed under the Round's own visibility (`platform:view`, Round in the actor's workspace). There is no detach action in v0.30.0.

### Stage transitions

Stages: `registered, kickoff, alpha, beta, completed, cancelled`. Open stages are the first four.

| Action | Legal moves | Event kind |
| --- | --- | --- |
| `projectSetStage` | `registered→kickoff`, `kickoff→alpha`, `alpha→beta`; `cancelled` from any open stage (reason required) | `stage_changed` / `cancelled` |
| `projectReopen` | `cancelled →` the `before.stage` of the last `cancelled` event; `completed → beta` | `reopened` |
| (node e, the Gate only) | `beta → completed` | `gate_decided` |

`projectSetStage` with `toStage: 'completed'` is refused (`toStage: gate_required`); same-stage, backward and every other pair is `toStage: illegal_transition`. The DB guard `log_lifecycle.project_guard` carries the union of these pairs (`LEGAL_STAGE_PAIRS`, `domain/stage-transitions.ts`; a drift test pins the SQL list to the table); it allows `beta→completed` because it cannot know the Gate called it, which the service enforces.

`projectCreate` checks that the model exists in the workspace and is active (`modelId: not_found | inactive`), that `softwareId` is a version of that model (`softwareId: not_found`, also in `projectUpdate`) and that `ownerActorId` is an actor of the workspace (`ownerActorId: not_found`), all through the log-knowledge read port (`knowledgeLookup`: `getModel`, `getSoftware`, `getEffectiveSpecPin`). One open project per model: a second one is `modelId: open_project_exists` (create) or `id: open_project_exists` (reopen), mapped from the partial unique index `development_project_open_model_uq (workspace_id, model_id) where stage not in ('completed','cancelled')`. `projectUpdate` is refused on a completed or cancelled project (`id: project_not_open`). It writes `owner_changed` for an owner change and `target_changed` for a `targetDate` and/or `softwareId` change; `before`/`after` carry only the changed fields.

Error codes: `invalid` field errors — `['toStage'] gate_required | illegal_transition`, `['id'] illegal_transition` (bad reopen, closing a closed round), `['modelId'|'id'] open_project_exists`, `['projectId'] open_round_exists | project_not_open | not_found`, `['reason'] required`, plus the input codes `required`, `malformed`, `too_long`. `conflict` is only the version mismatch.

### Rounds

A round opens only on an open project (`projectId: project_not_open`), at most one round per project is `open` (partial unique index `validation_round_open_project_uq` → `projectId: open_round_exists`), `seq` is 1..n per project without gaps (allocated as `max + 1` under the project row lock, `FOR UPDATE`; the same lock orders event `seq`), `stage` is the project's stage at open. `sample_set`, `sample_manifest_digest`, `spec_pin`, `project_id`, `seq`, `stage` and `note` are immutable from insert (guard `log_lifecycle.round_guard` + no column grant); there is no sample-edit action. Only `status open→closed` (+ `closed_at/by`, `updated_*`, `row_version + 1`) may change; closed is final (`roundClose` on a closed round: `id: illegal_transition`).

**Spec pin (server-computed).** At open the server asks log-knowledge `getEffectiveSpecPin(model, softwareId|null)`: `null` when the model has no published revision, else `{ revisionId, changeSetDigest }` where `changeSetDigest` = SHA-256 hex of `canonicalJson` (sorted keys) of the applicable change list in apply order `(start release order, created_at, id)`, each change as `{ id, targetKind, targetKey, changeKind, change }` (`change` = `change_json`); `[]` when the project has no `softwareId` or no change applies. The pin lives with log-knowledge's effective spec; log-lifecycle only stores it.

**`sampleSet` limits (start values; ADR-0117 has no fileRef rule yet).** `{ files: [{ fileRef, order, sha256 }], sourceOwner }`, strict (an unknown key is `malformed`). `files`: 1–1000 entries (`too_many` above); `order`: integers exactly `1..n`, each once (`order_invalid`), stored in the user's order and never re-sorted by time; `fileRef`: opaque string, trimmed, non-empty, ≤ 1024 characters, no control characters (C0, DEL, C1, NUL, lone surrogates → `malformed`), unique within the set (`duplicate`); `sha256`: 64 lowercase hex (`malformed`); `sourceOwner`: trimmed, non-empty, ≤ 200 characters. Field error paths are `sampleSet[.files.<i>[.<key>]]`.

**Manifest digest.** `sample_manifest_digest` = SHA-256 hex of `JSON.stringify({ files: [{ order, fileRef, sha256 }…] sorted by order, sourceOwner })` with exactly that key sequence (`sampleManifestDigest`, `domain/sample-set.ts`; node d reuses it for `input_manifest_digest`). Reordering the files changes it; identical input gives an identical digest.

## Storage

Schema `log_lifecycle` (migration of #1444 c): `development_project` (`model_id`/`software_id` plain uuids, no FK into `knowledge`; composite same-workspace FKs inside the schema), `development_event` (append-only: `seq` per project, `kind`, `before`/`after` objects, `reason`, `actor_id`), `validation_round`. Grants, triggers and the audit projection: [04 §Log lifecycle](../04-database-and-migrations.md). Audit events (`subject_type` → platform action): `development_project`: `lifecycle.project.created` → create, `.updated` / `.stage_changed` / `.reopened` → update, `.cancelled` → retire; `validation_round`: `lifecycle.round.opened` → create, `.closed` → retire. Details are body-free (ids, stage names, counts, changed field names).

## Validation request queue (node d, #1445)

Contract owner for the queue: this section plus [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) (decisions 1–10). Provisional `v0`; the worker schemas are `@ap/contract-schemas` `validation*` (`packages/sdk/contract-schemas/src/validation-queue.ts`). Terms: 검증 요청 (request), 시도 (attempt), 규칙 결과, 근거 위치 (`{ fileRef, line, fileSha256 }`, one type).

### Human side (menu `log-validation-requests`)

Reads (`platform:view`): `logLifecycle.requests` (params `page`, `pageSize` ≤ 200, `states[]`, `priority` 0–2, `immediate`, `roundId`, `modelId`, `from`, `to`; data `{ rows, total, immediateTotal }`, newest first; `immediateTotal` = the share of «즉시» requests in the filtered set for the admin view), `logLifecycle.requestDetail` (`requestId`; request + round summary + `attempts[]` with `verdict`, `manifestMatches`, per-result counts; `null` when unknown), `logLifecycle.ruleResults` (`attemptId`, `page`, `pageSize`, `results[]`, `required`; rows carry `evidence[{ fileRef, line, fileSha256, hasExcerpt }]` and `hasExcerpt`, never the text), `logLifecycle.excerpt` (`ruleResultId`, `evidenceIndex` 0–19).

`logLifecycle.excerpt` is the one read with a write: it needs the right `lifecycle.excerpt.read` **for the Round's `sample_set.sourceOwner`** (table `log_lifecycle.excerpt_reader`; there is no per-source scope in the permission module, so this right is its own ACL, granted and withdrawn by an admin with `excerptAccessSet`; admin role alone does not read), is refused to a token (`forbidden`), is judged inside the transaction that writes the audit row (a withdrawn right refuses the same call), and writes `lifecycle.excerpt.read` naming the rule result and the evidence index, never the text. Answers: `ok` + `{ ruleResultId, evidenceIndex, deleted, excerpt }`; `deleted: true` and `excerpt: null` once the body was erased (retention purge or administrator deletion; the read is still audited); `ok` + `null` for an unknown id or an evidence entry without an excerpt.

Writes (menu permission `lifecycle:round-manage`, i.e. `lifecycle.round.manage`, session or token):

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logLifecycle.requestCreate` | `roundId`, `priority` (0–2, higher is claimed first), `immediate?`, `engineProfileRef?` (≤ 200), `maxAttempts?` (1–10, default 3) | none (`idempotencyKey`) |
| `logLifecycle.requestCancel` | `id`, `reason` | `expectedVersion` |
| `logLifecycle.queueSettingsUpdate` (admin, `console:access`) | `runWindow?`, `leaseSeconds?` (30–3600), `immediateLimit?` (0–50), `excerptRetentionDays?` (1–3650); at least one | none |
| `logLifecycle.excerptAccessSet` (admin) | `sourceOwner`, `actorId`, `allowed` | none |
| `logLifecycle.excerptDelete` (admin, `console:access`, session only) | `scope` (`round` \| `attempt`), `id` (the Round or attempt id), `reason` (required, ≤ 2,000) | none |

Field errors: `['roundId'] not_found | round_closed`, `['immediate'] queue.immediate_limit` (the user already holds the workspace's immediate limit, default 5, of queued or claimed «즉시» requests; counted under an advisory lock per workspace and user), `['id'] illegal_transition` (cancel of a request that is not `queued`/`claimed`), `['reason'] required`, `['actorId'] not_found`, `['runWindow'] malformed`, `['id'] not_found` (`excerptDelete`: unknown Round / attempt in this workspace). A request stores its round (`round_id` required), a request digest (SHA-256 of `{ roundId, sampleManifestDigest, engineProfileRef }`) and the registering actor; the samples are the Round's, which never change (`round_guard`, for every round). Cancel of a claimed request clears its lease and ends its running attempt as `lease_expired`.

### Worker REST (token-only, `v0`)

Prefix `/api/v1/validation-queue`. Every route is `tokenCallable` and needs an authenticated API token whose scopes hold `validation.worker`. A cookie session or a token without the scope is 403 `permission.denied`; no credentials 401. `validation.worker` is a **token-only scope** (`TOKEN_ONLY_SCOPES`, not a capability: no grant, request or role right, never held by a human session), and only a **service** token may carry it (a personal token with it is 422 `scopes[i]: service_only`). Audit rows of a token call carry the token's Actor and `api_token_id`.

| Route | Body | Answers |
| --- | --- | --- |
| `POST /claim` | `{}` | `200 { request, attempt, leaseExpiresAt }` (the request carries `sampleSet`, `sampleManifestDigest`, `specPin`) · `204` nothing claimable now |
| `POST /requests/:id/heartbeat` | `{ attemptNo }` | `200 { leaseExpiresAt }` · `409 queue.lease_lost` |
| `POST /requests/:id/result` | `{ attemptNo, inputManifestDigest, executorVersion?, executorDigest?, ruleSetRevision?, summary?, results[] }` | `200 { requestId, attemptNo, state: 'succeeded', verdict, resultDigest, ruleCount }` · `409 conflict.stale_write` · `409 queue.lease_lost` · `422 validation.failed` |
| `POST /requests/:id/fail` | `{ attemptNo, reason? }` | `200 { requestId, attemptNo, state: 'failed' }` · `409 …` |

State table (`domain/request-states.ts`, the DB guard `log_lifecycle.request_guard` carries the same pairs between `LEGAL_REQUEST_PAIRS` markers; drift test): `queued→claimed|cancelled`, `claimed→succeeded|failed|queued|expired|cancelled`, plus `queued→succeeded|failed` for a late result (below); a terminal state never moves.

- **Claim** (one transaction): expired leases of the workspace are requeued first (`expired` when `attempt_count ≥ max_attempts`); then the highest-priority, oldest `queued` request with `not_before` passed, whose Round is still `open`, and that may run now — the run window is open, or the request is `immediate` — is locked `for update skip locked`, becomes `claimed` with `attempt_count + 1`, a lease of `leaseSeconds` (default 300) and a new `execution_attempt` (`input_manifest_digest` = the Round's until the worker reports). Two claim calls never get one request. Requeue happens on claim calls (no periodic job for leases); a lease that expired and was not yet requeued still accepts its worker's calls.
- **Run window** (`domain/run-window.ts`): `{ timezone (IANA), weekday: { fromHour, toHour }, weekendAllDay }`; start value Asia/Seoul, weekdays 22:00–06:00, weekend all day, judged on the wall clock of the zone by the server. Outside it only `immediate` requests are handed out.
- **Lease rules**: a call for the current attempt of a claimed request is accepted; a **result or fail** for the latest, lease-expired attempt of a request that went back to `queued` and that nobody took is accepted (the request ends `succeeded`/`failed`; audit `late: true`); everything else — another attempt exists, the request is cancelled/expired/finished, the attempt belongs to another worker — is `409 queue.lease_lost`, except that a **heartbeat** for the latest, lease-expired attempt of a request that went back to `queued` and that nobody took gives the lease back to that same attempt (request `claimed`, attempt `running`, `attempt_count` unchanged, lease extended; one transaction under the request row lock, so a claim by another worker that got there first makes it `queue.lease_lost`). A request that reached `expired` is terminal: its late result is `queue.lease_lost`.
- **Result idempotency**: the server canonicalises the normalised body (control characters removed) into `result_digest`. Same attempt, same digest → the same 200 with no new row; different digest, or a result after `fail` → `409 conflict.stale_write`.
- **Verdict** (`domain/verdict.ts`, server-computed; the body has no verdict or AI-opinion field, an unknown key is `malformed`): any `FAIL` → `fail`; else a manifest digest different from the request's, or a `required` rule `ERROR|NOT_CHECKED|SKIPPED` → `incomplete`; else `pass`. The worker's `summary` (≤ 4,096 bytes) is stored for reference and read by nothing.
- **Input checks** (422 `validation.failed`, `detail.fields[{ path, code }]`; nothing is cut, nothing is written): `observed`/`expected` ≤ 500 characters, `ruleId` ≤ 200, ≤ 2,000 results, ≤ 20 evidence entries per rule result, excerpt ≤ 2,000 characters, excerpts ≤ 256 KB per attempt (`too_long`, `too_many`, `excerpt_total_too_large`); control characters are removed; in any worker text field (`ruleId`, `expected`, `observed`, excerpts, `executorVersion`, `executorDigest`, `ruleSetRevision`, `summary`) text matching a platform token (`ap_…`), a private-key header, a cloud/VCS/chat token or `password|secret|api_key = value` is `secret_detected`; an evidence `fileRef` outside the Round's sample set is `not_in_sample`; a duplicate `ruleId` is `duplicate`.
- **Error codes of the queue**: `queue.lease_lost` (409, answered by the worker routes; not an entry of the shared `ERROR_CODES` registry), `queue.immediate_limit` (field error code of `requestCreate`), `conflict.stale_write`.

### Storage (migration 0108)

`log_lifecycle.execution_request` (state, priority, `immediate`, lease columns, `attempt_count`/`max_attempts`, `row_version`), `execution_attempt` (one per claim; `outcome running|succeeded|failed|lease_expired`, executor/rule-set references, `input_manifest_digest`, `result_digest`, `verdict`, `worker_summary`, `token_id`), `rule_result` (`attempt_id`, `rule_id` unique per attempt, `result`, `required`, `expected`, `observed`, `evidence` jsonb ≤ 20), `rule_result_excerpt` (the text, apart; `deleted_at`, `deleted_reason`; an erased row has an empty body), `queue_settings` (one row per workspace; a missing row = defaults), `excerpt_reader` (the per-source-owner right). Walls: see [04 §Validation request queue](../04-database-and-migrations.md). Audit events: `lifecycle.request.created|cancelled|claimed|result_submitted|failed|lease_expired`, `lifecycle.excerpt.read`, `lifecycle.queue_settings.updated`, `lifecycle.excerpt_access.set`, `lifecycle.excerpt.deleted` (administrator deletion; subject `validation_round` or `execution_request`; `scope`, `count`), `lifecycle.excerpt.purged` (retention job summary per workspace and run; subject `queue_settings`; `count`, `retentionDays`) (subject types `execution_request`, `queue_settings`, `excerpt_reader`); details are ids, counts and verdicts only. Heartbeats are not audited (a lease extension is transient). Not implemented: the Gate/stale logic.

**Excerpt erasure (ADR-0117 decision 7).** After a Round is `closed` + `excerptRetentionDays` (setting, default 90) the excerpt BODY is physically erased; rule results, evidence locations and hashes stay and the excerpt reads as `deleted`. Two doors, one storage path: (1) the daily job `lifecycle.excerpt_purge` (`excerpt-purge-job.ts`, pg-boss queue created by migration 0108, cron `45 3 * * *`, injectable clock, batches of 500, idempotent, one `lifecycle.excerpt.purged` summary row per workspace and run, never text; `deleted_reason` = `retention`); (2) the admin action `logLifecycle.excerptDelete` at Round or attempt scope with a required reason (stored in `deleted_reason`, not in the audit row). Both call `log_lifecycle.erase_excerpts(workspace, round, attempt, closed_before, reason, limit)`, a `SECURITY DEFINER` function (fixed `search_path`, EXECUTE for `platform_app` only, exactly one scope per call, workspace-filtered) because `platform_app` has no UPDATE on the table. The guard trigger `rule_result_excerpt_guard` allows exactly one UPDATE (live row → empty body with `deleted_at` and `deleted_reason` set, identity columns unchanged); the CHECK allows an empty body only when `deleted_at` is set.

The 참조 작업자 is `tooling/scripts/validation-worker-mock.mjs`: a **합성 fixture** that invents rule results from the sample list. It is not evidence of any in-house Validator integration.
