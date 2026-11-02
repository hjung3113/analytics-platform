# Log Knowledge

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the log knowledge catalog reads (#1193, [ADR-0107](../../../adr/0107-log-knowledge-catalog-authority-keys-and-edit-rights.md), design [v0.6 §7.1](../../../design/features/log-knowledge-hub/design-v0.6-candidate.md)). The write actions (#1194 a) are in [Write actions](#write-actions); import is #1195.

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
| `logKnowledge.vendors` | `filters`: `active` | `code`, `name`, `active`, `modelCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, modelCount, createdAt, updatedAt` |
| `logKnowledge.processes` | `filters`: `active` | same as vendors | same as vendors |
| `logKnowledge.models` | `filters`: `active`, `vendorId`, `processes` | `code`, `name`, `vendorName`, `active`, `softwareCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, vendorId, vendorName, processes: {id, name}[], softwareCount, latestSoftwareLabel, createdAt, updatedAt` |
| `logKnowledge.softwareVersions` | `filters`: `active`, `modelId` | `versionLabel`, `name`, `active`, `createdAt`, `updatedAt` | `id, code, versionLabel, name, active, version, modelId, createdAt, updatedAt` (`code` = `versionLabel`) |

- `code` is the typed original; sorting by `code` and `versionLabel` orders by the comparison key.
- `latestSoftwareLabel` (model) is the `versionLabel` of the model's newest active software version (highest `createdAt`, ties by id); `null` when it has none.
- `modelCount` (vendor, process) and `softwareCount` (model) count active models and active software versions.
- A model in several processes appears once under a `processes` filter (EXISTS, never a join). `processes` in the row lists every mapped process, by name.

## Filters

Wire and semantics are the table filter model's (`ColumnFilter`, real-server-checklist §3 «필터 와이어 모양·연산자 화이트리스트»): one condition per field, AND across fields, `in`/`notIn` the only OR, no condition = no constraint. Fields are enums with string values (`ColumnFilterSpec`); the menu declares the same specs in `menus/log-dev/log-knowledge/src/endpoints.ts` and `catalog-menu-drift.test.ts` fails when the two differ.

| Endpoint | Field | Operators | Values | Meaning |
| --- | --- | --- | --- | --- |
| all four | `active` | `in`, `notIn` | one of `'true'`, `'false'` (`multiple: false`: one value) | `in ['true']` active rows; `notIn ['true']` inactive rows |
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
