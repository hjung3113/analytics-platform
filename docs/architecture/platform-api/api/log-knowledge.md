# Log Knowledge

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the log knowledge catalog reads (#1193, [ADR-0107](../../../adr/0107-log-knowledge-catalog-authority-keys-and-edit-rights.md), design [v0.6 §7.1](../../../design/features/log-knowledge-hub/design-v0.6-candidate.md)). The write actions (#1194 a) are in [Write actions](#write-actions); import is #1195.

## Transport

The reads are menu-query endpoints: `POST /api/v1/menu-query` with `{ endpoint, context: {}, params }`. Judgment order, envelope and refusals are the Menu Dispatch engine's ([real-server-checklist §3](../../../integration/real-server-checklist.md)). The module only contributes the declarations (`modules/log-knowledge/catalog-endpoints.ts`). Owning menu id `log-knowledge-catalog`, `requiresScope: false`, no Context key.

## Permission

Declared permission `platform:view`: every active workspace session may read the catalog (the rule the Home menu uses). The workspace is the session actor's; no param names it and no row of another workspace is returned.

## Common params

| Param | Value | Default |
| --- | --- | --- |
| `q` | string ≤ 200 or `null`. Matches rows whose `code_key` starts with `toCodeKey(q)` (NFKC, trim, collapsed whitespace, upper case), or whose name contains `q` (case-insensitive). `%` and `_` are literals | `null` |
| `status` | `active`, `inactive`, `all` | `active` |
| `page` | integer ≥ 0 (0-based) | `0` |
| `pageSize` | integer 1–200 | `50` |
| `sorting` | up to 3 `{ id, desc }` over the endpoint's sort columns, no column twice | first column ascending |

Every sort ends with `id` ascending, so paging is deterministic. A param key outside the endpoint's list, a wrong type, a value out of range or a sort column outside the list is an `error` outcome (HTTP 200, `data: null`), never an empty page.

Data shape: `{ rows, total }` (`PageResult`), outcome `ok` also when `rows` is empty. Timestamps are ISO-8601 UTC strings. `version` is `row_version` as a string.

## Endpoints

| Endpoint id | Extra params | Sort columns | Row |
| --- | --- | --- | --- |
| `logKnowledge.vendors` | none | `code`, `name`, `active`, `modelCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, modelCount, createdAt, updatedAt` |
| `logKnowledge.processes` | none | same as vendors | same as vendors |
| `logKnowledge.models` | `vendorId`, `processId` (uuid or `null`) | `code`, `name`, `vendorName`, `active`, `softwareCount`, `createdAt`, `updatedAt` | `id, code, name, active, version, vendorId, vendorName, processes: {id, name}[], softwareCount, createdAt, updatedAt` |
| `logKnowledge.softwareVersions` | `modelId` (uuid or `null`) | `versionLabel`, `name`, `active`, `createdAt`, `updatedAt` | `id, code, versionLabel, name, active, version, modelId, createdAt, updatedAt` (`code` = `versionLabel`) |

- `code` is the typed original; sorting by `code` and `versionLabel` orders by the comparison key.
- `modelCount` (vendor, process) and `softwareCount` (model) count active models and active software versions.
- A model in several processes appears once under a `processId` filter. `processes` lists every mapped process, by name.

## Write actions

`POST /api/v1/menu-action` with `{ action, context: {}, input, idempotencyKey, expectedVersion? }`. Judgment order, envelope, replay and the `If-Match`/key headers are the Menu Dispatch engine's ([real-server-checklist §3](../../../integration/real-server-checklist.md)). Declarations: `modules/log-knowledge/catalog-actions.ts`; owning menu id `log-knowledge-catalog`, `requiresScope: false`.

**Permission.** Declared permission `knowledge.catalog.manage` (workspace-scoped, ADR-0107 decision 3). Judged as the capability check plus the Admin module bypass (`applyAdminModuleBypass`), so an Admin with no grant row is allowed and a User is refused (`forbidden`, no row). Judged before the transaction and again on it. The workspace is the actor's; an id of another workspace is `not_found` (target) or a `not_found` field error (reference).

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
