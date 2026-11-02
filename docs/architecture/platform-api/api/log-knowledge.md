# Log Knowledge

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the log knowledge catalog reads (#1193, [ADR-0107](../../../adr/0107-log-knowledge-catalog-authority-keys-and-edit-rights.md), design [v0.6 §7.1](../../../design/features/log-knowledge-hub/design-v0.6-candidate.md)). Write actions are #1194, import is #1195.

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
