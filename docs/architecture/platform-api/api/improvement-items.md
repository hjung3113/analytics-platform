# Improvement Items

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the improvement item reads and storage (#1328 node a). Domain and decisions: [design](../../../design/features/improvement-items.md) (§1 domain, §3 API/DB, §6 decisions), [ADR-0106](../../../adr/0106-improvement-task-is-quest.md) amendment 2, `IM-<n>` numbering as in [ADR-0109](../../../adr/0109-log-knowledge-item-ownership-revisions-assessments.md) decision 6, menu placement [ADR-0110](../../../adr/0110-platform-feature-roles-and-scope.md). Pattern: the log knowledge Item reads ([log-knowledge.md](log-knowledge.md) §Item reads).

**Not implemented here (later nodes):** item writes and `item_event` rows (b), capability `improvement.manage` (b), audit projection (b), the Quest port and `improvement.questSearch` (c), screens and the `platform/<pkg>` endpoint mirror (d), notifications (e), editable table and effect-check UI (f).

## Transport and permission

Menu-query endpoints: `POST /api/v1/menu-query` with `{ endpoint, context: {}, params }`. Judgment order and envelope are the Menu Dispatch engine's ([real-server-checklist §3](../../../integration/real-server-checklist.md)). The module only contributes declarations (`modules/improvement-items/item-endpoints.ts`).

- Owning menu id `improvement-items` (exported as `IMPROVEMENT_ITEMS_MENU_ID`), the direct list menu of Q1.
- Every read: `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`. Every active workspace session may read; the workspace is the session actor's and no param names it.
- Server-only in node a: no mirror package and no `endpoints.json` change (node d).
- A bad param is an `error` outcome (HTTP 200, `data: null`, `message`), never an empty page. No session is 401. The outcome set has no `not_found`: an unknown or other-workspace id answers `ok` with `data: null`.

## Endpoints

| Endpoint id | Params | Data |
| --- | --- | --- |
| `improvement.items` | `q`, `page`, `pageSize`, `sorting`, `filters`, `targetKind`, `targetKey` | `{ rows: ItemRow[], total }` |
| `improvement.itemDetail` | exactly one of `itemId` (uuid) or `itemNo` (positive integer; `"IM-12"` and `"12"` text also accepted); both or neither is an `error` | `ItemRow` or `null` |
| `improvement.itemEvents` | `itemId` (uuid), `page`, `pageSize`, `order` (`'asc'` \| `'desc'`, default `'desc'`) | `{ rows: ItemEventRow[], total }` |

Common list params follow [log-knowledge.md §Common params](log-knowledge.md) (shared parser `src/lib/list-params/`): `q` string ≤ 200 or `null`, `page` ≥ 0 (default 0), `pageSize` 1–200 (default 50), `sorting` ≤ 3 `{ id, desc }`, `filters` the table filter model ([ADR-0105](../../../adr/0105-one-table-filter-model.md)).

### `improvement.items`

- **Search `q`:** case-insensitive contains over `problem` and `action`; `%` and `_` are literals.
- **Sort columns:** `itemNo`, `createdAt`, `updatedAt`, `status`. Default `createdAt` descending. Every order ends with `item_no` descending (unique per workspace), so a page never repeats or skips a row between requests, also when `created_at` is equal.
- **Filters (`filters`):**

| Field | Ops | Values |
| --- | --- | --- |
| `status` | `in`, `notIn` | `open`, `in_progress`, `done`, `verified`, `dropped` (several) |
| `assignee` | `in`, `notIn`, `isEmpty`, `isNotEmpty` | uuid, or the literal `me` = the signed-in actor (resolved by the endpoint before the query; several) |
| `questId` | `in`, `notIn` | text, non-blank, ≤ 200 (several) |
| `questLinked` | `in` | `'true'` (a Quest is linked) or `'false'` (none); one value |
| `origin` | `in`, `notIn` | origin menu id, text ≤ 200 (several) |

  `notIn` on a nullable field (`assignee`, `questId`, `origin`) also drops rows without a value; use `isEmpty` to find them. Conditions of different fields are ANDed; one condition per field.
- **Target (`targetKind` + `targetKey`):** two top-level params, both or neither. `targetKind` is `equipment` or `process`, `targetKey` the external key (non-blank, ≤ 200). Returns the items that have that target (the per-equipment history).

### Row shapes

`ItemRow` (list rows and the detail): `id, itemNo, problem, action, actionDate, status, assignee: { id, displayName } | null, quest: { id, titleSnapshot } | null, origin: { menuId, context } | null, effectResult, effectNote, effectCompareLink, dropReason, targets: { kind, externalKey, displayName }[], version, createdBy, createdAt, updatedBy, updatedAt`. `actionDate` is a `YYYY-MM-DD` calendar day (no time zone, no conversion). `targets` are ordered by kind then key. Timestamps are ISO-8601 UTC strings; `version` is `row_version` as a string. The assignee name is read from `core.actors` joined on `workspace_id` and `id`.

`ItemEventRow`: `id, seq, eventType, actor: { id, displayName }, occurredAt, changes, reason`. Order `occurred_at` then `seq` in the asked direction. Node a never writes events, so a deployed node a answers empty histories.

## Storage (migration 0093)

Schema `improvement`; `src/db/schema/improvement.ts`. See also [04-database-and-migrations.md](../04-database-and-migrations.md).

| Table | Content |
| --- | --- |
| `item` | the item; unique `(workspace_id, id)` and `(workspace_id, item_no)` |
| `item_target` | target equipment or process: `kind` (`equipment` \| `process`), `external_key` (1–200, non-blank), `display_name_snapshot` (≤ 200); unique `(workspace_id, item_id, kind, external_key)`; index `(workspace_id, kind, external_key)` |
| `item_event` | append-only history: `seq bigint GENERATED ALWAYS AS IDENTITY`, `actor_id`, `occurred_at`, `event_type` (`created`, `updated`, `status_changed`, `assigned`, `quest_linked`, `reopened`), `changes` (jsonb object, before/after), `reason` (≤ 2000); index `(workspace_id, item_id, seq)` |
| `item_counter` | per-workspace `IM-<n>` allocator |

Foreign keys: every improvement-to-improvement reference (`item_target` and `item_event` to `item`) is a composite `(workspace_id, item_id)` key `ON DELETE RESTRICT`, so a row cannot point at another workspace's item. Actor columns (`item.assignee_id`, `created_by`, `updated_by`, `item_event.actor_id`) are plain foreign keys to `core.actors(id)` as in migration 0082: `core.actors` has no `(workspace_id, id)` key and none is added. Node b's write path checks that an assignee belongs to the session workspace.

### `item` CHECK rules

- `problem` 1–500 characters, non-blank; `action` ≤ 2000; `item_no` ≥ 1; `row_version` ≥ 1.
- `status` in `open | in_progress | done | verified | dropped`. Cumulative status rules:
  - `in_progress`, `done`, `verified` ⇒ `action` non-blank.
  - `done`, `verified` ⇒ `action_date` set.
  - `verified` ⇒ `effect_result` set.
  - `dropped` ⇒ `drop_reason` non-blank.
- `quest_id` and `quest_title_snapshot`: both null or both set; each ≤ 200; `quest_id` non-blank.
- `origin_menu_id` and `origin_context`: both null or both set; the menu id ≤ 200 and non-blank; `origin_context` is a JSON object. The context is a snapshot of metric, period and equipment; the destination id and the Context stay separate ([cross-menu-links](../../../contract/cross-menu-links.md)).
- `effect_result` in `effective | ineffective | inconclusive`; `effect_note` ≤ 2000; `drop_reason` ≤ 2000. `effect_result` null ⇒ `effect_note` and `effect_compare_link` null.
- `effect_compare_link`: a same-origin relative path only, `~ '^/[^/\\]'` (one leading slash, then neither a second slash nor a backslash), ≤ 2000 characters. An absolute or protocol-relative URL is refused. The link stays optional (the before/after comparison piece, #1243, is node f).
- `effect_*` and `drop_reason` MAY remain after a reopen; the history lives in `item_event`.

### Origin-or-target rule: enforced in node b, not in SQL

Q2 requires every item to carry `origin_*` **or** at least one `item_target`. That needs a second table, so it is **not** a CHECK and migration 0093 does not enforce it. Node b enforces it with a deferrable constraint trigger on `item`/`item_target` plus write-path validation. Until then a row without both can exist, and nothing in node a writes one.

### Grants (`platform_app`)

- `SELECT` on `item`, `item_target`, `item_event`; no INSERT, UPDATE or DELETE (node b adds column-limited writes with the guard triggers, the capability and the audit projection).
- `SELECT, INSERT, UPDATE (last_item_no)` on `item_counter`: the allocator runs as the runtime role. No other column and no DELETE.
- `platform_migrate` has all privileges on the four tables.

## Item numbers

`allocateImprovementItemNo(tx, workspaceId)` (`repositories/item-number.ts`) is one `INSERT … ON CONFLICT DO UPDATE … RETURNING` on `improvement.item_counter`, as `knowledge.item_counter`. Concurrent allocations in a workspace serialize on the counter row and get distinct consecutive numbers; a rolled-back transaction rolls the counter back, so numbers stay gap-free; workspaces count independently. The display form is `IM-<n>`.

## Tests

`modules/improvement-items/__tests__/`: `item-params.test.ts` (declaration table and param judgments), `improvement-items.integration.test.ts` (CHECKs, foreign keys, grants, counter, the three reads over `app.inject`). The `text` filter value kind and `literals` are pinned in `src/lib/list-params/__tests__/text-kind.test.ts`; `db/__tests__/role-grants-product-tables.integration.test.ts` pins the SELECT-only grants.
