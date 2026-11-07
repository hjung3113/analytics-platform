# Log Lifecycle

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the development project, its append-only history and the validation rounds (#1444 node c): five reads and six writes of menu `log-models`. Design and decisions: the log-lifecycle design (`docs/design/features/log-lifecycle/`) §3–§5 and ADR-0117. Not in this node (later nodes d/e): execution requests, attempts, rule results, the Gate, worker REST, attachments for manual evidence (node c2, #1451).

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

`models`: the base rows are the knowledge models (`knowledge.equipment_model`, read directly: see 02 §Log Lifecycle), so a model without a project is a row with `project: null`. Row: `{ id, code, name, active, version, vendorId, vendorName, processes[{id,name}], createdAt, updatedAt, project }` with `project: null | { projectId, stage, kind, ownerActorId, latestRound: { id, seq, status } | null }`. `project` is the model's OPEN project (not `completed`, not `cancelled`). Sort ids: those of `logKnowledge.models` plus `stage` (`code, name, vendorName, active, softwareCount, stage, createdAt, updatedAt`); same `q` / page / sorting rules as [log-knowledge.md §Common params](log-knowledge.md). Filter fields (ADR-0105): `active`, `id`, `vendorId`, `processes` as in `logKnowledge.models`, and `stage` (ops `in`, `notIn`, `isEmpty`, `isNotEmpty`; values the open stages `registered|kickoff|alpha|beta`): `isEmpty` = the model has no open project, `notIn` keeps the models without one. Not yet (node d, they need the request tables): the `validation` filter and the pending-request count.

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

`roundOpen` has no `specPin` input: the server computes it (below). Unknown input keys are `unexpected_field`.

Every project write is one transaction: the row change (`row_version + 1`), the `development_event` row and the `core.audit_log` row. A save that changes nothing answers `ok` with the current version and writes nothing. Round writes write the audit row and no `development_event` (the closed event kinds have no round kind).

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
