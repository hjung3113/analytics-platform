# Log Knowledge

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the log knowledge catalog reads (#1193, [ADR-0107](../../../adr/0107-log-knowledge-catalog-authority-keys-and-edit-rights.md), design [v0.6 §7.1](../../../design/features/log-knowledge-hub/design-v0.6-candidate.md)). The write actions (#1194 a) are in [Write actions](#write-actions), the item writes (#1197 w) in [Item write actions](#item-write-actions); import is #1195. The item reads (#1197 a, [ADR-0109](../../../adr/0109-log-knowledge-item-ownership-revisions-assessments.md)) are in [Item reads](#item-reads).

## Transport

The reads are menu-query endpoints: `POST /api/v1/menu-query` with `{ endpoint, context: {}, params }`. Judgment order, envelope and refusals are the Menu Dispatch engine's ([real-server-checklist §3](../../../integration/real-server-checklist.md)). The module only contributes the declarations (`modules/log-knowledge/catalog-endpoints.ts`). Owning menu id `log-knowledge-catalog`, `requiresScope: false`, no Context key.

## Permission

Declared permission `platform:view`: every active workspace session may read the catalog (the rule the Home menu uses; the hub's later read menus need it). The workspace is the session actor's; no param names it and no row of another workspace is returned.

## Common params

| Param | Value | Default |
| --- | --- | --- |
| `q` | string ≤ 200 or `null`. Matches rows whose `code_key` starts with `toCodeKey(q)` (NFKC, trim, collapsed whitespace, upper case), or whose name contains `q` (case-insensitive). `%` and `_` are literals | `null` |
| `page` | integer ≥ 0 (0-based) | `0` |
| `pageSize` | integer 1–200 | `50` |
| `sorting` | up to 3 `{ id, desc }` over the endpoint's sort columns, no column twice | first column ascending |
| `filters` | the table filter model ([ADR-0105](../../../adr/0105-one-table-filter-model.md)): `{ id, op, value? }[]`, per-endpoint fields in [Filters](#filters) | none = **every row** |

There are no `status`, `vendorId`, `processId` or `modelId` params: every filter is a `filters` condition. An absent or empty `filters` answers **all rows**, active and inactive; the server does not default to active rows (the screen pins `active in [true]` itself).

Every sort ends with `id` ascending, so paging is deterministic. A param key outside the endpoint's list, a wrong type, a value out of range or a sort column outside the list is an `error` outcome (HTTP 200, `data: null`), never an empty page.

Data shape: `{ rows, total }` (`PageResult`), outcome `ok` also when `rows` is empty. Timestamps are ISO-8601 UTC strings. `version` is `row_version` as a string.

## Endpoints

| Endpoint id | Filter fields | Sort columns | Row |
| --- | --- | --- | --- |
| `logKnowledge.vendors` | `filters`: `active`, `id` | `code`, `name`, `active`, `modelCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, modelCount, createdAt, updatedAt` |
| `logKnowledge.processes` | `filters`: `active`, `id` | same as vendors | same as vendors |
| `logKnowledge.models` | `filters`: `active`, `id`, `vendorId`, `processes` | `code`, `name`, `vendorName`, `active`, `softwareCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, vendorId, vendorName, processes: {id, name}[], softwareCount, latestSoftwareLabel, createdAt, updatedAt` |
| `logKnowledge.softwareVersions` | `filters`: `active`, `id`, `modelId` | `versionLabel`, `name`, `active`, `createdAt`, `updatedAt` | `id, code, versionLabel, name, active, version, modelId, createdAt, updatedAt` (`code` = `versionLabel`) |

- `code` is the typed original; sorting by `code` and `versionLabel` orders by the comparison key.
- `latestSoftwareLabel` (model) is the `versionLabel` of the model's newest active software version (highest `createdAt`, ties by id); `null` when it has none.
- `modelCount` (vendor, process) and `softwareCount` (model) count active models and active software versions.
- A model in several processes appears once under a `processes` filter (EXISTS, never a join). `processes` in the row lists every mapped process, by name.

## Filters

Wire and semantics are the table filter model's (`ColumnFilter`, real-server-checklist §3 «필터 와이어 모양·연산자 화이트리스트»): one condition per field, AND across fields, `in`/`notIn` the only OR, no condition = no constraint. Fields are enums with string values (`ColumnFilterSpec`); the menu declares the same specs in `menus/log-dev/log-knowledge/src/endpoints.ts` and `catalog-menu-drift.test.ts` fails when the two differ.

| Endpoint | Field | Operators | Values | Meaning |
| --- | --- | --- | --- | --- |
| all four | `active` | `in`, `notIn` | one of `'true'`, `'false'` (`multiple: false`: one value) | `in ['true']` active rows; `notIn ['true']` inactive rows |
| all four | `id` | `in`, `notIn` | uuid strings (≤ 200); any uuid is accepted | the row's id is / is not one of the values (the drawer resolves a row by `id in [focus]`, one read) |
| `models` | `vendorId` | `in`, `notIn` | uuid strings (≤ 200); options are not enumerated, any uuid is accepted | the model's vendor is / is not one of the values |
| `models` | `processes` (`cell: 'many'`) | `in`, `notIn`, `isEmpty`, `isNotEmpty` | uuid strings (≤ 200); none for `isEmpty`/`isNotEmpty` | `in`: some mapped process is in the values; `notIn`: at least one mapped process and none in the values (unmapped models are excluded); `isEmpty`: no mapped process; `isNotEmpty`: some |
| `softwareVersions` | `modelId` | `in`, `notIn` | uuid strings (≤ 200) | the version's model is / is not one of the values |

An unknown field, an operator outside the field's list, a value of the wrong shape (not a list, empty, not `'true'`/`'false'`, not a uuid, a value on `isEmpty`), a second condition on one field or a `filters` that is not a list is an `error` outcome with a message, never an empty page. An unknown but well-formed uuid matches nothing and the page is `ok`.

## Write actions

`POST /api/v1/menu-action` with `{ action, context: {}, input, idempotencyKey, expectedVersion? }`. Judgment order, envelope, replay and the `If-Match`/key headers are the Menu Dispatch engine's ([real-server-checklist §3](../../../integration/real-server-checklist.md)). Declarations: `modules/log-knowledge/catalog-actions.ts`; owning menu id `log-knowledge-catalog`, `requiresScope: false`.

**Permission.** The actions declare the menu permission `knowledge:catalog-manage` (the one permission of the `log-knowledge-catalog` management menu, design v0.6 §2.1 «관리자 전용 카탈로그 관리»; mock registration follows [real-server-checklist §3](../../../integration/real-server-checklist.md)). The real server judges it with the capability `knowledge.catalog.manage` (workspace-scoped, ADR-0107 decision 3), and `PLATFORM_PERMISSION_TABLE` lists `knowledge:catalog-manage` in bootstrap for exactly the actors that check lets write: Admin role, or an active workspace grant of `knowledge.catalog.manage`. Judged as the capability check plus the Admin module bypass (`applyAdminModuleBypass`), so an Admin with no grant row is allowed and a User is refused (`forbidden`, no row). Judged before the transaction and again on it. The workspace is the actor's; an id of another workspace is `not_found` (target) or a `not_found` field error (reference).

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logKnowledge.vendorCreate` / `processCreate` | `code`, `name` | `none` |
| `logKnowledge.modelCreate` | `vendorId`, `code`, `name`, `processIds` | `none` |
| `logKnowledge.softwareCreate` | `modelId`, `versionLabel`, `name` | `none` |
| `logKnowledge.vendorUpdate` / `processUpdate` | `id`, `code`, `name` | `version` |
| `logKnowledge.modelUpdate` | `id`, `code`, `name`, `processIds` (the full replacement set) | `version` |
| `logKnowledge.softwareUpdate` | `id`, `versionLabel`, `name` | `version` |
| `logKnowledge.<kind>SetActive` (`vendor`, `process`, `model`, `software`) | `id`, `active` | `version` |

- A model has no `vendorId` on update: the Vendor cannot change (ADR-0107 decision 2). Sending it is `invalid` `unexpected_field`.
- `version` is `row_version` as a string. Every successful write increments it and sets `updated_at`/`updated_by`; a create answers `version: "1"`. `expectedVersion` differing from the current one answers `conflict` with the current version, writing nothing.
- A successful answer's `data` is `{ id, code, name, active, version }` (`code` = `versionLabel` for software).
- `processIds` replacement adds and removes `model_process` rows (`assigned_by` = actor); the model row and its id stay. Existing mappings may stay when their process is inactive; only newly added processes must be active.
- **SetActive** to the value a row already has changes nothing: no version bump, no audit row, answer `ok` with the current version. Deactivation never cascades (ADR-0107 decision 4): children keep their own `active`; reactivation is per row. Nothing is hard-deleted.
- `code` is stored as typed; `code_key`/`version_key` are computed by the server (`toCodeKey`) and never taken from input.

**`invalid` field errors** (`fieldErrors[{ path, code }]`; a database-judged one is thrown as `MenuActionInvalidError`, the engine rolls the write back and answers `invalid`, never a 500):

| Code | When | Path |
| --- | --- | --- |
| `required` | missing, not a string/boolean/array, or blank (a software `name` may be `""`) | the field |
| `too_long` | `code`/`versionLabel` > 64, `name` > 200 (code points), `processIds` > 200 | the field |
| `malformed` | not a uuid, NUL or lone surrogate | the field, or `processIds.<i>` |
| `duplicate` | `code_key` already in its ADR-0107 scope (including a concurrent create: one wins, the other gets this); `processIds` repeats an id | `code` (`versionLabel` for software) or `processIds.<i>` |
| `not_found` | `vendorId`, `modelId` or `processIds.<i>` unknown or of another workspace | the field |
| `inactive` | the parent vendor/model or a newly mapped process is inactive | the field |

**Audit** (same transaction, non-sensitive): `knowledge.catalog.created`, `.updated`, `.deactivated`, `.reactivated`; `subject_type` `knowledge_vendor` | `knowledge_process` | `knowledge_model` | `knowledge_software`; detail `{ code, name, changes?: { field: [before, after] } }` (a model's `processIds` change as sorted id lists; `changes` is absent when nothing differed). Platform actions: created → `create`, updated and reactivated → `update`, deactivated → `retire`. The four subject types are in the `core.platform_audit_events` allowlist (migration 0081).

**`invalidates`** (read endpoints of this menu the Kernel refreshes): vendor writes → `vendors`, `models`; process → `processes`, `models`; model → `models`, `vendors`, `processes`, `softwareVersions`; software → `softwareVersions`, `models`.

## Item write actions

Five more `menu-action` writes (#1197 w, [ADR-0109](../../../adr/0109-log-knowledge-item-ownership-revisions-assessments.md)); same transport, replay and `If-Match`/key rules as [Write actions](#write-actions). Declarations: `modules/log-knowledge/item-actions.ts`, value checks `domain/item-input.ts` (zod; shared by `validate` and the handler), SQL `repositories/item-write.ts` (`knowledge.*` item tables and the item counter only). Owning menu `log-knowledge-items`, `requiresScope: false`.

**Permission.** Menu permission `knowledge:item-publish`, judged with the capability `knowledge.item.publish` (workspace-scoped, no Managed System, non-sensitive) plus `applyAdminModuleBypass` (`always`), the same pairing as `knowledge:catalog-manage` ↔ `knowledge.catalog.manage`: Admin passes with no grant, a Developer needs the grant (requestable and grantable), a User is refused at request and at grant and is `forbidden` here. Bootstrap lists `knowledge:item-publish` exactly for the users the actions accept (`platform-port/permissions.ts`, rule `item-publish`). Reads stay `platform:view`.

| Action | `input` | Concurrency | `data` |
| --- | --- | --- | --- |
| `logKnowledge.itemCreate` | exactly one of `ownerModelId` / `ownerSoftwareId`; `typeCode`, `title`, `observation?`, `expected?`, `analysisOpinion?`, `improvement?`, `evidence?` (≤ 20 pointers) | `none` | `{ id, itemNo }` |
| `logKnowledge.itemRevise` | `id`, `typeCode`, `title`, the four bodies, `evidence?`, `changeNote` (1–500) | `version` | `{ id, itemNo, revisionNo }` |
| `logKnowledge.itemAssess` | `id`, `dimension` (`verification` \| `processing`), `newState`, `rationale` (1–2000) | `version` | `{ id, itemNo }` |
| `logKnowledge.itemDerive` | `sourceItemId`, `sourceRevisionNo`, exactly one owner, `typeCode`, `title`, the four bodies (no `evidence`) | `none` | `{ id, itemNo }` |
| `logKnowledge.itemSetArchived` | `id`, `archived` | `version` | `{ id, itemNo }` |

- `version` is `row_version` as a string; every successful write that changes the item bumps it and sets `updated_at`/`updated_by`; create and derive answer `version: "1"`. `expectedVersion` differing from the current one answers `conflict` before the handler (also for a same-value SetArchived).
- **Create / Derive**: the number comes from the workspace counter (`allocateItemNo`), the item is `published`, `not_checked`, `open`, revision 1 is written with its evidence (server-assigned `ordinal` 1..n). Derive also inserts `item_link(derived_from, source = new item, target = original, source_revision_no)` pinned to the given revision, and takes no evidence. The owner never changes afterwards (`itemRevise` has no owner input).
- **Revise** appends revision `latest + 1`; evidence belongs to that revision (omitted = none) and the earlier revisions and their evidence are untouched. `latest_revision_no` moves with it.
- **Assess** inserts one `item_assessment_event` (`prior_state` = the current projection, `based_on_revision_no` = latest) and sets the dimension's projection in the same transaction.
- **SetArchived** is non-destructive. To the value the item already has: nothing changes, no bump, no audit, `ok` with the current version. An archived item refuses revise and assess.
- `EvidencePointer`: `sourceKind` (`log_file` \| `spec` \| `image` \| `validation_run` \| `other`), `sourceOwner`, `sourceRef` (non-blank, ≤ 1000), `sourceVersion?`, `contentHash?`, `locator?` (≤ 1000), `note?` (≤ 500); optional texts that are blank are stored as null. The 1000 cap is the API's (no DB CHECK). No body text is audited.

**`invalid` field errors** (value checks at step 6; the database-judged ones are thrown as `MenuActionInvalidError`, never a 500):

| Code | When | Path |
| --- | --- | --- |
| `required` | missing, wrong type or blank (`title`, `typeCode`, `changeNote`, `rationale`, `dimension`, `newState`, `archived`, evidence `sourceKind`/`sourceOwner`/`sourceRef`) | the field, or `evidence.<i>.<field>` |
| `required_one` | both or none of the two owners; neither `observation` nor `expected` has text | `owner`; `observation` |
| `too_long` | `title` > 200, a body > 20000, `changeNote` > 500, `rationale` > 2000, `evidence` > 20, evidence `note` > 500 (code points) | the field |
| `malformed` | not a uuid, unknown enum value, `sourceRevisionNo` not an integer ≥ 1, NUL or lone surrogate | the field |
| `invalid_state` | `newState` does not belong to `dimension` | `newState` |
| `not_found` | owner unknown or of another workspace; derive source item or revision unknown | `ownerModelId` / `ownerSoftwareId`; `sourceItemId` / `sourceRevisionNo` |
| `inactive` | the owner model, the owner SW, or the SW's model is inactive | `ownerModelId` / `ownerSoftwareId` |
| `archived` | revise or assess on an archived item | `id` |
| `unchanged` | `newState` equals the current state of the dimension | `newState` |

**Audit** (same transaction, non-sensitive): `knowledge.item.created`, `.revised`, `.assessed`, `.derived`, `.archived`, `.restored`; `subject_type` `knowledge_item`; detail `{ itemNo, title, revisionNo?, dimension?, priorState?, newState?, sourceItemId?, sourceRevisionNo? }`. Platform actions: created/derived → `create`, revised/assessed/restored → `update`, archived → `retire`. Migration 0083 adds `knowledge_item` and `knowledge.item.publish` to the audit projection's allowlists.

**`invalidates`**: `logKnowledge.items`, `logKnowledge.itemDetail`. **Accepted limit:** the model-side counts (`exploreModels.modelItemCount`, the `modelProfile` counts) belong to menu `log-knowledge-models`, and the engine invalidates only within an action's own menu, so those reads show a stale count until they refresh on their own (backlog, not implemented).

## Item reads

Four more menu-query endpoints (`modules/log-knowledge/item-endpoints.ts`), same transport, `platform:view`, `requiresScope: false`, no Context key; the workspace is the session actor's. Two owning menus: `log-knowledge-models` (explore, model profile) and `log-knowledge-items` (item list, item detail). The detail screens `log-knowledge-model` / `log-knowledge-item` are navHidden children that read their parent's endpoints (the engine allows `invalidates` only within an action's own menu). The menu package mirrors all four reads in `menus/log-dev/log-knowledge/src/endpoints.ts`; `catalog-menu-drift.test.ts` compares the menu declarations with the server declarations.

The dispatch outcome set has no `not_found`: an unknown or other-workspace id answers **`ok` with `data: null`**. Actors (`createdBy`, `publishedBy`, `actorId`) are returned as ids; no approved cross-module name read exists for this module yet.

| Endpoint id | Menu | Params | Data |
| --- | --- | --- | --- |
| `logKnowledge.exploreModels` | `log-knowledge-models` | the common params; filters and sort columns of `models` | the `models` row plus `modelItemCount` (published items owned directly by the model) |
| `logKnowledge.modelProfile` | `log-knowledge-models` | `modelId` (uuid) | `{ model, softwareVersions, truncated, modelItems }` or `null` |
| `logKnowledge.items` | `log-knowledge-items` | the common params | `{ rows: ItemRow[], total }` |
| `logKnowledge.itemDetail` | `log-knowledge-items` | `itemId` (uuid), optional `revisionNo` (integer ≥ 1) | `ItemDetail` or `null` (also `null` for a `revisionNo` the item does not have) |

`modelProfile` data: `model: { id, code, name, active, vendor: { id, code, name, active }, processes: { id, code, name }[], createdAt, updatedAt }`; `softwareVersions: { id, versionLabel, name, active, itemCount, updatedAt }[]` (every version, active or not, newest `createdAt` first, cut at 500 with `truncated: true`); `modelItems: { total }` (published items owned directly by the model). `itemCount` counts the version's published items.

`items`: `q` matches the latest revision's title (contains, case-insensitive) and `KI-<n>` / `KI<n>` (the item number, case-insensitive; a bare number is not parsed and only searches titles). Sort columns `itemNo`, `title`, `updatedAt`; default `updatedAt` descending. **No `publicationState` condition = published items only** (unlike the catalog reads); archived items answer only when asked. `ItemRow`: `{ id, itemNo, title, typeCode, owner: { kind: 'model' | 'software', modelId, modelName, softwareId?, versionLabel? }, verificationState, processingState, publicationState, latestRevisionNo, updatedAt }`; `title` and `typeCode` are the latest revision's.

| Field | Operators | Values | Meaning |
| --- | --- | --- | --- |
| `ownerKind` | `in`, `notIn` | `model`, `software` | model-owned / SW-owned items |
| `ownerModelId` | `in`, `notIn` | uuid strings (≤ 200) | items owned **directly** by the model; with `includeSoftware in ['true']` also items of its SW versions |
| `includeSoftware` | `in` | `'true'` or `'false'` (one value) | only widens `ownerModelId`; default false, so a profile's model-common list never shows SW items. Alone it constrains nothing |
| `ownerSoftwareId` | `in`, `notIn` | uuid strings | items owned by the SW version |
| `typeCode` | `in`, `notIn` | `anomaly`, `needs_check`, `behavior_note`, `guideline` | latest revision's type |
| `verificationState` | `in`, `notIn` | `not_checked`, `observed`, `verified`, `disputed` | |
| `processingState` | `in`, `notIn` | `open`, `under_investigation`, `resolved` | |
| `publicationState` | `in`, `notIn` | `published`, `archived` | replaces the published-only default |

`notIn` on `ownerModelId` / `ownerSoftwareId` excludes items without that owner column. Enum filters accept only the listed values (anything else is an `error` outcome).

`ItemDetail`: `item` (an `ItemRow` plus `version`, `createdBy`, `createdAt`); `revision` (the requested revision, default latest: `revisionNo, title, typeCode, observation, expected, analysisOpinion, improvement, changeNote, publishedBy, publishedAt, evidence: { ordinal, sourceKind, sourceOwner, sourceRef, sourceVersion, contentHash, locator, note }[]`); `revisions` (all, newest first: `revisionNo, title, publishedBy, publishedAt, changeNote`); `assessments` (all, newest first: `id, dimension, priorState, newState, rationale, actorId, basedOnRevisionNo, observedAt`); `links: { kind, direction: 'outgoing' | 'incoming', itemId, itemNo, title, owner, sourceRevisionNo }[]`. For `derived_from`, `outgoing` means this item was derived from `itemId` at `sourceRevisionNo` of that original; `incoming` means `itemId` was derived from this item. `related` has no revision (`null`).

## Catalog import staging (#1195 a, migration 0087)

Steps ①–③ of design v0.6 §6.2 (④–⑤ follow in the next section). Nothing in ①–③ writes vendor, process, model, software, `model_process`, `external_identity_map` or `core.audit_log`; the runtime role holds SELECT/INSERT/UPDATE (no DELETE) on `catalog_import_job`, `catalog_import_row` and `catalog_import_resolution`.

**Upload** `POST /api/v1/log-knowledge/imports` — multipart with one `file` part and an `entityType` field (`vendor|process|model|software`); headers: session cookie, `x-csrf-token`, `Idempotency-Key` (UUIDv4). Order: session (401/403) → CSRF (403 `csrf.invalid`) → key → `knowledge.catalog.import` (Admin bypass; 403 `permission.denied`; judged before an idempotent replay and again in the transaction) → file. `201 {jobId, rowCount, status:'uploaded'}`. The request hash covers `entityType`, file name, size and sha256; the same key with another request is `409 conflict.idempotency_key_reuse`. The file bytes are not stored. File refusals answer `{code, message}` and create no job: `413 file_too_large` (> 5 MB); `400` `too_many_rows` (> 5,000 data rows), `too_many_columns` (> 50), `invalid_headers` (blank or duplicate header), `unsupported_type` (type is decided by content — zip signature = XLSX, otherwise text — and the extension must agree), `encoding` (CSV must be UTF-8, BOM stripped), `sheet_count` (XLSX needs exactly one sheet), `empty`, `unreadable` (ragged CSV, corrupt XLSX), `invalid_entity_type`; `503 busy` when two parses are already running.

Cells are kept as strings in `raw_json` (`{<header>: <string>}`, dates as ISO). A formula, merged or non-plain cell (XLSX) is stored as `''` and recorded in the immutable `parse_errors` (`formula|merged|unsupported_cell`); formulas are never evaluated.

**Actions** (menu `log-knowledge-catalog`, `concurrency:'version'` on the job's `row_version`; answers carry ids and counts, never rows):

- `logKnowledge.importMap` `{jobId, mapping:{<field>:<header>}}` — fields per entity: vendor `vendor_code, vendor_name`; process `process_code, process_name`; model `vendor_code, model_code, model_name` (+ optional `process_codes`, split on `;` or `,`; the names shape `vendor_name, model_name` (+ `process_names`, `vendor_code`, `model_code`) and the upload's own mapping: §Catalog import by names); software `vendor_code, model_code, version_key` (+ optional `version_name`). Field errors under `mapping.<field>`: `required`, `unknown_field`, `unknown_header`, `duplicate_source`; `jobId:state` when the job is past `review_required`. Stores `mapping_json`, status `mapped`, bumps `plan_version`, resets normalized data, errors, plan state and targets; `parse_errors` is never touched. Answer `{jobId, status, planVersion}`.
- `logKnowledge.importValidate` `{jobId}` (job `mapped|validated|review_required`) — per row: `normalized_json`, `validation_errors` (the catalog write codes under the file's field names, `parent_missing`, `parent_inactive`, `process_missing`, `process_inactive`, `duplicate_in_file`, plus the row's `parse_errors`) and `plan_state` `error|new|unchanged|update|conflict`. Lookup scope is `(workspace, resolved vendor, code_key)` for a model and `(resolved model, version_key)` for a software version: a code present only under another vendor is `new`, a vendor move is never inferred. An existing inactive row is `conflict` (it keeps its key); an update is a differing name (or, when `process_codes` is mapped, a differing process set). Existing rows carry `target_id` and `target_version`. Status `validated` without `error`/`conflict` rows, else `review_required`; bumps `plan_version`. Answer `{jobId, status, planVersion, counts:{pending,new,unchanged,update,conflict,error}}`.

**Read** `logKnowledge.importDetail` `{jobId, page, pageSize, sorting?, filters?}` — menu right `platform:view`, handler also requires `knowledge.catalog.import` (`forbidden` outcome). Filters `planState` and `applyStatus` (`in|notIn`; `notIn` keeps rows with no apply status yet), sort id `rowNo`. `ok` data `{job, rows, total, applyCounts}`, a row is `{rowNo, raw, normalized, errors, planState, targetId, targetVersion, resolution, mapTargetId, applyStatus, applyError, resultTargetId}` (`resolution` shows only a resolution written for the job's current validation); `applyCounts` is `{applied, unchanged, skipped, excluded, unresolved, conflict, failed, remaining}`. An unknown or other-workspace job answers outcome `error`, `data:null`, message `not_found` (the same for both).

## Catalog import resolve and apply (#1195 b, migration 0088)

Steps ④–⑤ of design v0.6 §6.2. Right `knowledge.catalog.import` (Admin bypass) on every entry point; the apply route re-checks it inside each transaction that writes.

**Resolve** `logKnowledge.importResolve` `{jobId, resolutions:[{rowNo, resolution, mapTargetId?}]}` (≤ 500; job `validated|review_required`; `concurrency:'version'`). `skip` on any row; `map` on a `new` or `conflict` row to an **active** row of the job's entity in the same scope (same vendor for a model, same model for a software version; `scope`/`inactive`/`not_found` under `resolutions.<i>.mapTargetId`); `create` only on `new` rows (also the default). `abort` is not offered (`invalid`). A `map` stores the target's current `row_version` as `expected_target_version`. The call bumps `row_version` and `plan_version` but not the validation generation; a later `importMap` or `importValidate` increments `catalog_import_job.validation_generation`, which makes every earlier resolution stale (`catalog_import_resolution.based_on_validation`). Answer `{jobId, status, planVersion, resolved}`.

**Cancel** `logKnowledge.importCancel` `{jobId}` — any status before `applying` → `cancelled`.

**Apply** `POST /api/v1/log-knowledge/imports/:jobId/apply` body `{expectedPlanVersion}` — session, CSRF, capability; no `Idempotency-Key`: it is a resumable state machine and every answer is the current progress `{jobId, status, planVersion, remaining, counts}` (`counts`: `applied, unchanged, skipped, excluded, unresolved, conflict, failed, remaining`). Errors: `404 {code:'not_found'}` (unknown or other workspace), `409 {code:'conflict', reason:'plan_version'|'state'}`, `400 invalid`, `503 {code:'busy'}` with `Retry-After: 5` (both per-process apply slots taken; nothing was started).
- The first call (job `validated|review_required`, `plan_version == expectedPlanVersion`) seals in one transaction: `plan_hash` per row = sha256 of the canonical JSON `{rowNo, normalized, planState, targetId, targetVersion, resolution, mapTargetId, expectedTargetVersion}`; `sealed_plan_hash` = sha256 of the row hashes in `row_no` order; rows that never write get their final status (`excluded` for `error` — even with a skip —, `skipped`, `unchanged`, `unresolved` for a `conflict` without a map); status `applying`, `apply_pass = 1`. Map/validate/resolve/cancel then refuse (`jobId:state`).
- Rows run in `row_no` order, one transaction each: job `FOR SHARE`, hash recomputed against the stored `plan_hash` (mismatch → `failed plan_changed`), row `FOR UPDATE`, skip when already final (exactly once). `new` creates (parent re-checked: `failed parent_missing|parent_inactive|process_missing|process_inactive`; key taken, also by a concurrent insert → `conflict taken`). `update`/`map` lock the target: `row_version != expected` → `conflict stale_target`; a target that no longer exists → `conflict target_missing`; inactive → `conflict inactive_target`; they change the name (a software name only if `version_name` is mapped) and a model's process set (only if `process_codes` is mapped; new assignments must be active) and never the code or `active`. `map` also writes `external_identity_map` (`catalog_import`, entity, canonical JSON array key, `accepted`) when none exists for the key; an existing row for another target → `conflict identity_conflict`. An unexpected error rolls the row back and marks it `failed unexpected` in its own transaction.
- One runner per job: a session-scoped advisory lock (workspace + job) is held for the whole call; a concurrent caller answers progress and starts nothing.
- Time budget `IMPORT_APPLY_BUDGET_MS` (15,000): at least one eligible row per call, then no new row after the budget; the answer is `status:'applying'` and the client calls again. A pass attempts each eligible row at most once (`apply_pass`); when none is left the job becomes `completed` (no `failed`/`conflict` row) or `partial_failure` with `applied_at`. A call on `partial_failure` starts a new pass over the `failed` rows only; `conflict` rows are final.
- Audit, same transaction as the write: `knowledge.catalog.created|updated` with `detail.source = {importJobId, rowNo}`; `knowledge.catalog.identity_mapped` (subject = target; `{sourceSystem, sourceType, externalKey, source}`).

**Report** `GET /api/v1/log-knowledge/imports/:jobId/report.csv` — session and capability; unknown or other-workspace job → 404. UTF-8 BOM, CRLF, RFC 4180 quoting, every cell guarded against formula injection (prefix `'` before `= + - @ TAB CR`). Columns `row_no, plan_state, resolution, apply_status, apply_error, result_target_id`, then the stored (trimmed) upload headers in stored order with the stored raw values. `Content-Disposition: attachment` (RFC 5987 file name).

## Catalog import by names (#1195 b2, no migration)

The owner's import is a one-time bulk load of a **names-only model sheet** (ADR-0107 decision 2 supplement). Four steps: upload → validation result → rows that need a decision (only when conflicts exist) → apply result. No mapping step. Vendor, process and software uploads keep working as before and are server-only (not offered by the UI; `.planning/backlog.md`).

**Headers (`entityType=model`).** Compared after trim and NFKC: maker `메이커명 | 메이커 | 제조사 | vendor_name`; model `모델명 | 모델 | model_name`; processes (optional) `공정명 | 공정 | process_names`. The old `vendor_code`, `model_code`, `process_codes` stay accepted as optional columns; a non-blank code cell wins over the name for that row's key. Other columns are ignored. A `vendor_code`/`model_code` column also satisfies the maker/model requirement (code-only API sheets).

**Auto mapping.** The upload recognizes the headers, stores `mapping_json` itself (`{vendor_name, model_name, process_names, …}` → header text) and answers `{jobId, rowCount, status:'mapped'}`; `importValidate` runs without `importMap`. If no header is recognized at all (an API client's own headers) the job stays `uploaded` and waits for `importMap`. `importMap` remains for that case and for fixing headers: a mapping that names `vendor_name` is judged as the names shape (`vendor_name`, `model_name` required; code columns and `process_names`/`process_codes` optional), any other model mapping as the code shape (`vendor_code`, `model_code`, `model_name` required).

**File-level failures** (HTTP 400, no job): `missing_header` (`detail.headers` = the expected names missing, `메이커명` and/or `모델명`) and `duplicate_header` (`detail.headers` = the header texts that resolve to one field: identical or alias-equivalent). A blank header is still `invalid_headers`; other entities still refuse identical headers as `invalid_headers`.

**Process names** split on `,` only; each trimmed, empties dropped, deduplicated by key (a repeat of the same name after normalization is one process, not an error). The codes of a process column (`process_codes`) split on `;` or `,` as before.

**Match rule** (maker, process, model): the row with this `code_key` (the code cell, else the name); else `toCodeKey(name)` against both the existing `code_key` and `toCodeKey(existing name)`. Two different rows → `conflict` with the reason in `errors[]`: `ambiguous_name` (the model itself; resolved by the existing model `map`/`skip`), `ambiguous_parent` (a maker or process) or `parent_inactive` (an existing inactive maker/process named by name, ADR-0107 never duplicates it); the latter two are cleared by `skip` only: `importResolve` refuses a `map` on them (`not_allowed`). A maker or process given only as a code that does not exist stays an error (`parent_missing`, `process_missing`, `process_inactive`, `parent_inactive`) as before.

**Parents in the same plan.** A model row whose maker (or process) given by name does not exist plans `new` (or `update` for an existing model that gains a process) and lists `creates: {vendor?: <name>, processes: [<name>…]}` — stored in `normalized.creates` (sealed with the row) and returned as `creates` on each `importDetail` row (`null` when none). Every row that depends on a missing parent lists it; the apply creates it once, on the first row that needs it. A model row that needs a new parent is never `unchanged`.

**Apply.** Inside the row's own transaction: judge every parent first (nothing is written before a refusal), then create the maker, the model, the processes and the links. Each parent is insert-if-absent on its unique key, then read (`DuplicateCatalogKeyError` → re-lookup), so a replay or a competing runner never makes a second row; each created row writes `knowledge.catalog.created` with `detail.source = {importJobId, rowNo}`. Failure codes at apply time: `ambiguous_parent`, `parent_missing`, `parent_inactive`, `process_missing`, `process_inactive` (`failed`), key taken (`conflict taken`).

**Codes.** A row created without a code gets `code` = its name (original text) and `code_key` = `toCodeKey(name)`; a derived code over `CODE_MAX` (64 code points) is a row error `too_long` on the name column (`vendor_name`, `model_name`, `process_names`), never truncated. Catalog create (`vendorCreate`, `processCreate`, `modelCreate`) accepts a missing or blank `code` the same way (overlong → `code: too_long`); update and `softwareCreate` keep requiring one.

### Storage invariants (migration 0082)

Five tables plus the number counter, every key composite with `workspace_id`. An item has exactly one of `owner_model_id` / `owner_software_id` (CHECK, composite FK, `ON DELETE RESTRICT`); `platform_app` may UPDATE only `latest_revision_no, publication_state, verification_state, processing_state, row_version, updated_by, updated_at`. Revisions, evidence, assessment events and links are SELECT/INSERT only for `platform_app`. `item_no` comes from `item_counter` through one atomic upsert (`repositories/item-number.ts`). Item writes and their capability/audit contract are defined in [Item write actions](#item-write-actions) above.

## Catalog import by menu actions: paste and apply (#1195 b3, no migration)

A menu reaches the server only through `useMenuFetch` and menu actions, so the import wizard cannot call the multipart upload, `POST …/apply` or `GET …/report.csv`; those stay API-only (their request and response shapes are unchanged; the apply route gains the 503 `busy` admission answer listed in its Errors). Two menu actions (menu `log-knowledge-catalog`, right `knowledge.catalog.import` with the Admin bypass, judged before replay and again on the transaction; both `concurrency:'none'`, both invalidate `logKnowledge.importDetail`) cover the wizard. The result step shows rows and `applyStatus` from `importDetail` (paged: default 50, max 200) and exports them from the table.

**Paste** `logKnowledge.importPaste` `{text: string, sourceName?: string}` — model sheets only (`entity_type 'model'`).
- `text` is what the user pasted from Excel or the contents of a CSV the browser read. At most **256 KiB** of UTF-8 and **1,000 data rows** (the upload keeps 5 MB and 5,000); the other limits (50 columns) are the upload's.
- Delimiter: **tab** when the first non-empty line contains a tab, else **comma**. A leading BOM is dropped. It goes through the upload's CSV parser (one parser, an explicit delimiter and row limit), whatever `sourceName` or its extension says; `sourceName` only names the job.
- Header recognition and file-level refusals are the upload's (names-only model sheet, aliases, `missing_header`, `duplicate_header`, `invalid_headers`, `empty`, `too_many_columns`, `unreadable`, `too_many_rows`, `file_too_large`; invalid UTF-8 cannot occur in a string).
- Stored like a CSV upload: `file_type 'csv'`; `file_name` = `sourceName` with control characters and `/ \` turned into `_` (≤ 255), else `붙여넣기.tsv` (tab) or `붙여넣기.csv`; `file_size` = UTF-8 byte length; `file_sha256` = sha256 of the UTF-8 text. Staging only: the catalog is untouched.
- Answer `ok` `{jobId, rowCount, status: 'mapped'|'uploaded'}` (`mapped` when the headers were recognized).
- **Refusal** = `invalid`, no job created, field errors in the existing `{path, code}` shape: `{path:['text'], code:<refusal code>}`, plus one `{path:['text','headers',<header text>], code}` per header the refusal names (the missing expected names for `missing_header`, the colliding header texts for `duplicate_header`). Input shape errors: `{path:['text'], code:'required'}` (not a string), `{path:['sourceName'], code:'invalid'}`.
- One process parses at most **2** pastes/uploads at a time (slots shared with the upload route). With none free the answer is `invalid` `{path:['text'], code:'busy'}`; it is not recorded, so the client retries with the same key shortly.

**Apply** `logKnowledge.importApply` `{jobId, expectedPlanVersion}` (positive integer) runs the same `runApply` as the route. The answer is always `ok` (the engine returns only `ok` data from a handler) with a discriminant:
- `{outcome:'progress', jobId, status, planVersion, remaining, counts}` — as the route's progress;
- `{outcome:'not_found'}` — unknown job or another workspace's;
- `{outcome:'conflict', reason:'plan_version'|'state'}` — as the route's 409;
- `{outcome:'busy'}` — no apply slot free (two runs per process, shared with the route; the route answers 503 `busy` with `Retry-After`), or the runner pool gave no connection within its acquire timeout. Nothing waits on the command pool while the outer transaction is open.

*How `runApply` runs inside the handler.* The engine's transaction holds a command-pool connection, the `(actor, key)` advisory xact lock and the idempotency record, and nothing of the job (no `currentVersion`). `runApply` runs on a **separate runner pool** (`createApplyRunnerPool`, `max` = the two apply slots, built in `server.ts` like the self-approval pool, inheriting the command pool's runtime time budgets): command connections can all be held by one action and its same-key followers parked on its lock, and a runner waiting on the command pool would then wait on connections only the lock holder can free (or, with `DB_POOL_MAX=1`, on its own). One pinned runner connection holds the session advisory lock (workspace + job) and runs the seal, every per-row transaction and the contention progress read. Its acquire timeout is a third of the apply budget (500 ms–5 s) and its statement timeout is the budget (at least 1 s). It never reads or writes the idempotency table or locks the job row from the outer transaction, so it cannot wait on either. The apply route holds no outer connection, so it keeps the command pool (single-connection regression in `import-apply.integration.test.ts`). The time budget bounds the call (`IMPORT_APPLY_BUDGET_MS`, 15 s).

*Protocol.* Each progress step is a fresh action call with a fresh idempotency key; the client stops at `completed` or `partial_failure`, and a later deliberate call retries the `failed` rows. A retry of an unknown or error result resends its key; a **replay returns the earlier recorded answer** (an earlier progress, or an earlier `busy`), starts no apply and creates nothing, so the client moves on with a fresh key for the next step, and also for a retry after `busy`. Rows commit outside the action record: if the record does not commit (a crash after the rows), the same key re-runs the apply, and the seal plus per-row idempotency (node b, b2) create no catalog, parent, identity or audit row twice.
