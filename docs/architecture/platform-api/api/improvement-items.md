# Improvement Items

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the improvement item reads, storage (#1328 node a) and writes (node b). Domain and decisions: [design](../../../design/features/improvement-items.md) (§1 domain, §3 API/DB, §6 decisions), [ADR-0106](../../../adr/0106-improvement-task-is-quest.md) amendment 2, `IM-<n>` numbering as in [ADR-0109](../../../adr/0109-log-knowledge-item-ownership-revisions-assessments.md) decision 6, menu placement [ADR-0110](../../../adr/0110-platform-feature-roles-and-scope.md). Pattern: the log knowledge Item reads ([log-knowledge.md](log-knowledge.md) §Item reads).

**Not implemented here (later nodes):** the Quest port and `improvement.questSearch` (c), screens and the `platform/<pkg>` endpoint mirror (d), notifications (e), editable table and effect-check UI (f).

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

### Origin-or-target rule (Q2): a deferred constraint trigger, not a CHECK

Q2 requires every item to carry `origin_*` **or** at least one `item_target`. That needs a second table, so it is **not** a CHECK. Migration 0094 enforces it with the `DEFERRABLE INITIALLY DEFERRED` constraint trigger `improvement_item_origin_or_target` (the same name on `item` for insert / update of `origin_menu_id`, and on `item_target` for delete). The trigger function re-reads the item's current origin and target count when it fires and skips an item row that no longer exists, so a transaction is judged on its final state. The write path checks first (`origin:required_or_target`); `itemCreate` and `itemUpdate` also end with `SET CONSTRAINTS improvement.improvement_item_origin_or_target IMMEDIATE` inside `handle` and map the 23514 (constraint name `improvement_item_origin_or_target`) to the same field error.

### Grants (`platform_app`)

- `item`: `SELECT, INSERT` and a column-limited `UPDATE (problem, action, action_date, status, assignee_id, quest_id, quest_title_snapshot, origin_menu_id, origin_context, effect_result, effect_note, effect_compare_link, drop_reason, row_version, updated_at, updated_by)` (0094); never `workspace_id`, `id`, `item_no`, `created_*`, never DELETE.
- `item_target`: `SELECT, INSERT, DELETE` (a target set is replaced; its history is `item_event`); no UPDATE.
- `item_event`: `SELECT, INSERT`; append-only, no UPDATE or DELETE.
- Guard trigger `improvement_item_guard` (BEFORE UPDATE on `item`, the wall against the migrate role too): `row_version` must rise by exactly 1 on every update, the identity columns never change, and a changed status must be a legal pair. Its `23514` carries no constraint name and is never mapped to a field error: a guard firing is a handler bug and stays loud.
- `SELECT, INSERT, UPDATE (last_item_no)` on `item_counter`: the allocator runs as the runtime role. No other column and no DELETE.
- `platform_migrate` has all privileges on the four tables.

## Item numbers

`allocateImprovementItemNo(tx, workspaceId)` (`repositories/item-number.ts`) is one `INSERT … ON CONFLICT DO UPDATE … RETURNING` on `improvement.item_counter`, as `knowledge.item_counter`. Concurrent allocations in a workspace serialize on the counter row and get distinct consecutive numbers; a rolled-back transaction rolls the counter back, so numbers stay gap-free; workspaces count independently. The display form is `IM-<n>`.

## Tests

`modules/improvement-items/__tests__/`: `item-params.test.ts` (declaration table and param judgments), `improvement-items.integration.test.ts` (CHECKs, foreign keys, grants, counter, the three reads over `app.inject`), `item-input.test.ts` (write input judgments), `improvement-items-writes.integration.test.ts` (the six actions, the 0094 grants, guard and Q2 triggers, audit projection). The `text` filter value kind and `literals` are pinned in `src/lib/list-params/__tests__/text-kind.test.ts`; `db/__tests__/role-grants-product-tables.integration.test.ts` pins the grants (`item: SELECT, INSERT`, `item_target: SELECT, INSERT, DELETE`, `item_event: SELECT, INSERT`) and the exact UPDATE column list of `item`.

## Write actions (#1328 b)

Menu id `improvement-items`; global ids `improvement.itemCreate`, `improvement.itemUpdate`, `improvement.itemSetStatus`, `improvement.itemReopen`, `improvement.itemAssign`, `improvement.itemLinkQuest` (`modules/improvement-items/item-actions.ts`, input judgments in `domain/item-input.ts`). `POST /api/v1/menu-action`; judgment order is the engine's. Every action: `permission: 'improvement:manage'` (menu permission, bootstrap lists it for Admin and for a workspace grant of capability `improvement.manage`), `requiresScope: false`, `invalidates` the three reads. Authorization is the capability `improvement.manage` plus `applyAdminModuleBypass`: workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, requestable with no Managed System, **refused for a User recipient** (request, approval, direct grant) and no User-assignee exception ([design](../../../design/features/improvement-items.md) Q3). Reads stay open to every session.

| Action | Concurrency | Input | Effect |
| --- | --- | --- | --- |
| `itemCreate` | none | `problem`, `action?`, `actionDate?`, `assigneeId?`, `questId?`+`questTitle?`, `origin?{menuId,context}`, `targets?[{kind,externalKey,displayName}]` | status `open`; answer `{ itemId, itemNo, version }`; event `created` |
| `itemUpdate` | version | `itemId`, `problem?`, `action?`, `actionDate?`, `origin?`, `targets?` (replaces the set) | never touches status, assignee, Quest or effect; event `updated` |
| `itemSetStatus` | version | `itemId`, `status`, `action?`, `actionDate?`, `effect?{result,note?,compareLink?}`, `reason?` | forward moves only; event `status_changed` |
| `itemReopen` | version | `itemId`, `reason` | the reopen pairs; event `reopened` |
| `itemAssign` | version | `itemId`, `assigneeId` or null | event `assigned` |
| `itemLinkQuest` | version | `itemId`, `questId`+`questTitle` (snapshot text from the caller) or both null | event `quest_linked` |

- **Status pairs** are owned by [design §1](../../../design/features/improvement-items.md); `itemSetStatus` takes `open→in_progress` (needs `action`), `in_progress→done` (needs `action`, `actionDate`), `done→verified` (needs `effect`), `open|in_progress|done|verified→dropped` (needs `reason`); anything else, a reopen pair included, is `status:illegal_transition`. `itemReopen` takes `done→in_progress`, `verified→done`, `dropped→open` and keeps `effect_*` / `drop_reason`.
- **Field errors** (`invalid`): `required`, `too_long`, `malformed`, `too_many`, `duplicate` (`targets.<i>:duplicate`, caught before the lock), `not_applicable` (a status-move field that does not belong to the target status), `status:illegal_transition`, `assigneeId:not_found` (assignee not an actor of the session workspace; judged after the number allocation on create, so the rolled-back create leaves no gap), `origin:required_or_target` (Q2; create judges it in `validate`, update when the last target of an origin-less item would go). The cumulative CHECK rules are reported by `handle` as `action:required`, `actionDate:required`, `effect:required`, `reason:required` before any SQL CHECK fires; a CHECK or unique violation that still slips through is mapped by constraint **name** only.
- **Engine conflict-token rule:** no improvement status is sealed (each has a legal exit), so `currentVersion` is the plain `row_version` (locking the row `FOR UPDATE`) and there is no fresh/unholdable token. Every status-dependent refusal is a `MenuActionInvalidError` thrown from `handle` after the lock, so a conflict replayed with the returned version on an illegal pair ends as `invalid`, never as `conflict` forever.
- **Atomicity:** the row change, the `item_event` rows and the audit row share the engine's transaction; every change bumps `row_version`; a save that changes nothing answers `ok` with the current version, no event and no bump. `item_event.changes` is `{ before, after }` of the changed fields; the audit `detail` is body-free (`improvement.item.*`, subject `improvement_item`, schemas in `packages/feature-shared/src/audit/improvement-items.ts`).
- **Not here:** notifications (node e), the Quest port (c), screens and mock registration (d, backlog), bulk edit (f).
