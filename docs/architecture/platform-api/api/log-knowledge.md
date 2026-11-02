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

**Permission.** The actions declare the menu permission `knowledge:catalog-manage` (the one permission of the `log-knowledge-catalog` management menu, design v0.6 §2.1 «관리자 전용 카탈로그 관리»; the mock adapter requires an action permission to be a menu's permission). The real server judges it with the capability `knowledge.catalog.manage` (workspace-scoped, ADR-0107 decision 3), and `PLATFORM_PERMISSION_TABLE` lists `knowledge:catalog-manage` in bootstrap for exactly the actors that check lets write: Admin role, or an active workspace grant of `knowledge.catalog.manage`. Judged as the capability check plus the Admin module bypass (`applyAdminModuleBypass`), so an Admin with no grant row is allowed and a User is refused (`forbidden`, no row). Judged before the transaction and again on it. The workspace is the actor's; an id of another workspace is `not_found` (target) or a `not_found` field error (reference).

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

Four more menu-query endpoints (`modules/log-knowledge/item-endpoints.ts`), same transport, `platform:view`, `requiresScope: false`, no Context key; the workspace is the session actor's. Two owning menus: `log-knowledge-models` (explore, model profile) and `log-knowledge-items` (item list, item detail). The detail screens `log-knowledge-model` / `log-knowledge-item` are navHidden children that read their parent's endpoints (the engine allows `invalidates` only within an action's own menu). The menu package mirrors these declarations later (node r of #1197); until then `catalog-menu-drift.test.ts` compares only the `log-knowledge-catalog` endpoints.

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

### Storage invariants (migration 0082)

Five tables plus the number counter, every key composite with `workspace_id`. An item has exactly one of `owner_model_id` / `owner_software_id` (CHECK, composite FK, `ON DELETE RESTRICT`); `platform_app` may UPDATE only `latest_revision_no, publication_state, verification_state, processing_state, row_version, updated_by, updated_at`. Revisions, evidence, assessment events and links are SELECT/INSERT only for `platform_app`. `item_no` comes from `item_counter` through one atomic upsert (`repositories/item-number.ts`). Writes, the capability `knowledge.item.publish` and audit are node w.
