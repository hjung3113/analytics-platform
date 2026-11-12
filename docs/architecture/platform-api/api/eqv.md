# eqv — Layouts, Revisions, Templates (#1645), Onboarding storage (#1658) and Sample Window·Fleet (#1658)

Menu Dispatch declarations of the `eqv` module ([ADR-0135](../../../adr/0135-eqv-layout-storage-publish-and-promotion.md); module guide `apps/platform-api/src/modules/eqv/AGENTS.md`). Migration `0121_eqv_layouts.sql`. Workspace-scoped; the workspace is the actor's, never a param.

## Access

- Reads: permission `eqv:view` (capability `eqv.view`; Admin through the module bypass). The Studio Layouts menu's entry permission is `eqv-studio:view` (#1654): the same capability `eqv.view`, so bootstrap lists both names together; the endpoints keep `eqv:view`. Writes: `saveDraft` needs `eqv-studio:layout-edit` (`eqv.layout.edit`); `publishRevision` and `promoteTemplate` need `eqv-studio:layout-publish` (`eqv.layout.publish`; «승인» is this capability check, no approval flow). `eqv.layout.edit` and `eqv.layout.publish` are session-only and not for the User role.
- A denied call answers `forbidden` for every read and write; nothing is read or written first.
- **Site Scope.** All declarations are `requiresScope: false` with no site-bound Context. Real-server Site Scope is enforced only by these capabilities until #1087.

## Reads (menu-query)

Menu `eqv-studio` unless noted. Reads that find nothing by id answer `empty`; a bad id is `error`.

| Endpoint | Params | Data |
| --- | --- | --- |
| `eqv.layouts` | — | `{ rows: { id, layoutId, version, updatedAt }[] }` |
| `eqv.layoutDraft` | `layoutId` | `{ id, layoutId, version, document, updatedAt }` |
| `eqv.layoutRevisions` | `layoutId` | `{ rows: { id, layoutId, revision, publishedAt }[] }`, newest first |
| `eqv.layoutRevision` | `layoutId`, `revision` (`sha256:<64 hex>`) | `{ id, layoutId, revision, document, publishedAt }` |
| `eqv.templates` | — | `{ rows: { id, templateId, name, promotedFromLayoutId, promotedFromRevision, createdAt }[] }` |
| `eqv.template` | `templateId` | the row plus `document` |
| `eqv.equipment-options` (menu `eqv:focus`) | — | `{ options: { id, label, dataRange: { from, to } \| null }[] }`, at most 1000, only equipment whose Hub model the viewer may see (#1504 object access; filtered before the limit, a hidden model's equipment is absent like a missing one, #1878). `dataRange` is `[from, to)`, `null` until step 9 |

`eqv.topview-context` and `eqv.topview-events` are declared client-side (`mergeTimeDomain: false`) and answered by the mock server only; the real server does not serve them. They take an equipment id, and the per-equipment access judgment waits for #1087 ([backlog](../../../../.planning/backlog.md)).

## Read service for other modules

`modules/eqv/read-service.ts` (an approved cross-module surface) lets another module read a **published** Revision without the Studio endpoints: `getPublishedRevision(tx, workspaceId, layoutId, revision)` → `{ layoutId, revision, document, publishedAt } | null`, and `listPublishedRevisions(tx, workspaceId)` → `{ layoutId, revision, publishedAt }[]`, newest first, **at most 500** rows (no document). The caller passes the workspace it verified and owns the permission; the service decides none. `getPublishedRevision` re-validates the stored document and re-hashes it like `eqv.promoteTemplate`; a mismatch is `null` plus a server log line, never a document. The only caller is the Hub (`logKnowledge.modelTopView`, `linkTopView`, `topViewRevisionOptions`, [log-knowledge.md «Model Top View pointer»](log-knowledge.md)): a Hub reader needs **no `eqv:view`** — the Hub's model ACL decides, and the Hub stores only the pointer (`knowledge.model_topview_link`).

## Writes (menu-action)

Answers carry ids and versions, not document bodies. Audit is written in the same transaction (`eqv.layout.draft_created|draft_saved`, `eqv.layout.revision_published`, `eqv.template.promoted`; subject types `eqv_layout`, `eqv_layout_revision`, `eqv_template`; the subject id is the row uuid; detail is ids, versions and the Revision hash only). The viewerless global audit projection (migration 0121) excludes `eqv_` subjects, as it does `knowledge_`, because a console-only actor without `eqv.view` must not learn eqv ids or totals ([ADR-0135](../../../adr/0135-eqv-layout-storage-publish-and-promotion.md) §9); the rows still exist in `core.audit_log`, and a permission-aware eqv audit view is not built.

- **`eqv.saveDraft`** `{ layoutId, document }`, `concurrency: 'version'`. With no draft the current version is `'0'`: create with `expectedVersion: '0'`; the first row is version `1`. `'0'` on an existing draft, or a stale version, is `conflict` (the loser of a creation race too). Answer `{ id, layoutId, version }`.
- **`eqv.publishRevision`** `{ layoutId }`, `concurrency: 'version'` on the draft version the author saw (no draft → `not_found`). Writes an immutable Revision (`revision` = `layoutRevision` of the validated layout). Publishing the same hash again answers `ok` with the existing Revision (`created: false`) and writes no further audit row. Answer `{ id, layoutId, revision, created }`.
- **`eqv.promoteTemplate`** `{ layoutId, revision, templateId, name }`. Template from a published Revision; result re-validated. Answer `{ id, templateId }`.

Refusals are `invalid` with field errors, never a 500: the document is not a valid Layout (codes of `validateLayout`, including `hierarchy-cycle`, EV#170); `document.id` ≠ `layoutId` (`id_mismatch`); `kind` not `equipment-layout` (`kind_not_equipment_layout`); a bundled Template id (`bundled_template_id`); a duplicate Template id (`duplicate`); an unknown Revision (`not_found`); a Revision whose stored hash no longer matches (`hash_mismatch`).

## Onboarding (#1658, [ADR-0139](../../../adr/0139-eqv-onboarding-storage-and-publish.md))

Menu `eqv-onboarding` (constant `EQV_ONBOARDING_MENU_ID`; only this constant changes if the owner picks another id). Migrations `0124_eqv_onboarding.sql` and `0125_eqv_sample_window.sql` (Sample Windows, below): tables `alias_rules`, `type_dictionary` (one row per Mapping Scope, `version`), immutable `mapping_version` and `baseline_inventory`, `binding` (only `effective_to` is ever updated). **Scope keys are Hub ids:** `{ level, vendorId?, modelId?, equipmentId? }`, with `maker` = Hub vendor id and `model` = Hub model id in the `@eqv/core` scope. No free maker/model string. Only the ids a level needs are accepted (a surplus id is `unexpected`).

**Access.** Reads: `eqv:view` (capability `eqv.view`; the menu is entered with `eqv-studio:view`). Writes: a `global`-level alias rules or Type Dictionary write needs `eqv.dictionary.global_edit` (`eqv-studio:dictionary-global-edit`); any other rules or dictionary write needs `eqv.rules.edit` (`eqv-studio:rules-edit`); `publishMapping` needs `eqv.mapping.publish` (`eqv-studio:mapping-publish`); the Sample Window and registration actions need `eqv.window.import` (`eqv-studio:window-import`). The right is judged per request on the transaction, again after the lock wait; a denial is `forbidden` with no detail. A scope target the actor cannot address (unknown vendor, unknown equipment, a Hub model hidden from the actor) answers like a missing one: reads `empty`, writes `not_found`.

| Read | Params | Data |
| --- | --- | --- |
| `eqv.aliasRules` | `level`, `vendorId?`, `modelId?`, `equipmentId?` | `{ document, version } \| empty` |
| `eqv.typeDictionary` | `level` (no `equipment`), `vendorId?`, `modelId?` | `{ document, version } \| empty` |
| `eqv.equipmentScopes` | `equipmentId` | `{ equipmentId, vendorId, modelId } \| empty` |
| `eqv.mappingVersions` | `equipmentId` | `{ rows: { hash, layoutId, layoutRevision, entryCount, publishedAt }[] }`, newest first, at most 500 |
| `eqv.mappingVersion` | `equipmentId`, `hash` | `{ layoutRevision, publishedAt, document }`; the hash is re-verified (`verifyMappingHash`), a mismatch is `empty` plus a log line |
| `eqv.bindings` | `equipmentId` | `{ document: BindingsFile, version }` built from the rows (`validateBindings` passes); `version` is the row count as a string, `'0'` with none |
| `eqv.baselineInventory` | `equipmentId`, `mappingHash` | `{ document } \| empty` |

| Action | Input | Answer |
| --- | --- | --- |
| `eqv.saveAliasRules` | `level`, `vendorId?`, `modelId?`, `equipmentId?`, `document` | `{ id, version }` |
| `eqv.saveTypeDictionary` | `level` (no `equipment`), `vendorId?`, `modelId?`, `document` | `{ id, version }` |
| `eqv.publishMapping` | `equipmentId`, `layoutId`, `layoutRevision`, `windowHash`, `effectiveFrom` | `{ mappingHash, bindingId, version }` |

- Saves are `concurrency: 'version'`: `'0'` while no row exists, first row version 1, `'0'` on an existing row or a stale version is `conflict` (a creation race too). `@eqv/core`'s `validateAliasRules` / `validateTypeDictionary` is the verdict and the document's `scope` must equal the addressed scope (`scope_mismatch`); only the validated file is stored. Issues answer `invalid` with `{ path, code }` only (core messages stay in the module).
- `publishMapping` is `concurrency: 'version'` over the equipment's Binding row count (`'0'` with none), so it lands only over the Bindings the author saw. One transaction under an equipment advisory lock: the published Layout Revision must exist (`layoutRevision/not_found`; the action never publishes a draft) and hash-check; the window must belong to the equipment and be `active` (`windowHash/not_active`; an unknown, hidden, foreign, staged, replaced or retired window all answer alike), and its stored Inventory is the Baseline; the applicable alias rule rows (global, maker, model, equipment) go to `@eqv/core` `publishMapping` with that Inventory's aliases; any issue is `invalid` (`mapping/...`) and nothing is stored; Mapping Conflicts never block. `effectiveFrom` is a strict Site Wall-clock (`fraction-missing`, `fraction-too-long`, `offset`, `malformed`, `impossible`: never truncated) and must be later than the latest Binding's (`not_after_latest`); the same mapping hash and Layout Revision as the latest is `invalid` `mapping/same-as-latest`. Then: Mapping Version (an existing same hash is reused), Baseline (the first one of a hash stays; the row records the window it was taken from in `window_id`, null for rows published before windows were stored), the open latest Binding is closed at `effectiveFrom`, the new Binding is inserted, `validateBindings` runs on the resulting set, and one audit row is written.
- **Invalidations (D4).** `publishMapping` invalidates `eqv.mappingVersions`, `eqv.bindings`, `eqv.fleet` and `eqv.sampleWindows` (Fleet status and a window's `mappingCount` change); `saveAliasRules` invalidates `eqv.aliasRules` and `eqv.fleet`, `saveTypeDictionary` invalidates `eqv.typeDictionary` and `eqv.fleet` (a first rule file turns `unstarted` into `draft`). The menu's `endpoints.ts` and its mock declare the same lists (`onboarding-menu-drift.test.ts`).
- Audit (same transaction, ids only): `eqv.alias_rules.created|saved` (subject `eqv_alias_rules`), `eqv.type_dictionary.created|saved` (`eqv_type_dictionary`), `eqv.mapping.published` (subject `eqv_binding`, detail equipment id, mapping hash, Layout Revision, `effectiveFrom`), and below `eqv.sample_window.imported|replaced|retired` (subject `eqv_sample_window`) and `eqv.equipment.registered` (subject `eqv_equipment`). The viewerless audit projection keeps excluding `eqv_` subjects.

## Sample Windows, Fleet and equipment registration (#1658 Sample Window·Fleet PR, [ADR-0139](../../../adr/0139-eqv-onboarding-storage-and-publish.md) amendment)

Menu `eqv-onboarding`, migration `0125_eqv_sample_window.sql`. The menu declares these in `menus/tools/topview-studio/src/endpoints.ts`, and its mock serves them; `onboarding-menu-drift.test.ts` compares every declaration. Reads need `eqv:view`, `requiresScope: false`; an unknown equipment, or one whose Hub model the actor cannot see, answers `empty` for every read below.

**Storage.** `eqv.sample_window` (workspace-scoped, `UNIQUE(workspace_id, equipment_id, hash)`): `hash` (`sha256:<64 hex>`), `from_at`/`to_at` (Site Wall-clock, never truncated), `data_generation`, `time_domain`, `occurrences`, `state` (`active`, `staged`, `replaced`, `retired`), `counterpart_hash`, the validated `batch` and the `inventory` built at import. The runtime role has SELECT, INSERT and a column-limited UPDATE (`state`, `counterpart_hash`, `updated_at`, `updated_by`); no DELETE, and the content never changes. `eqv.equipment` takes an INSERT of `workspace_id`, `equipment_id`, `label`, `model_id` for `registerEquipment`; no UPDATE or DELETE. `baseline_inventory.window_id` points at the window a Baseline was taken from.

| Read | Params | Data |
| --- | --- | --- |
| `eqv.fleet` | — | `{ rows: { equipmentId, label, vendorId, vendorName, modelId, modelName, status, latestWindow: { hash, from, to } \| null, coverage: { referenceRatio, aliasRatio, assumedRatio } \| null, unmappedReferences }[] }`, ordered by `equipmentId`, **at most 500 rows** (`FLEET_ROWS_MAX`; the cap applies to the first 500 equipment of the workspace by id before the Hub hides models, so a larger workspace shows fewer rows), only equipment whose Hub model the actor can see |
| `eqv.sampleWindows` | `equipmentId` | `{ rows: { hash, from, to, dataGeneration, timeDomain, occurrences, state, counterpart, mappingCount }[] }`, oldest range first; `mappingCount` is the Baselines taken from the window |
| `eqv.observedInventory` | `equipmentId`, `windowHash` (64 hex) | the window's `ObservedInventory` (any state); `empty` for a window the equipment does not have |
| `eqv.bundledTemplates` | — | `{ rows: { templateId, name, document }[] }`: the EV Templates the package ships (`BUNDLED_TEMPLATE_IDS`, documents copied into `domain/bundled-templates-data.ts` and kept equal to the assets by a test), in id order |

`status` is a code (the screen owns the words): `no-observations` when the equipment has no window row at all; without a Binding `draft` if any applicable alias rule file exists (global, maker, model or equipment), else `unstarted`; with a Binding `drift-unknown` when Drift cannot be judged (no active window, or the Mapping Version, Baseline Inventory or Layout Revision of the latest Binding is missing or unreadable, the Mapping Version fails its hash, or `detectDrift` throws a `RangeError`: ONBOARDING §6), `drift` when it found new aliases, new slots or transfers without capability, else `published`. `latestWindow` is the active window with the greatest `from`. `coverage` is the latest Binding's Mapping Version against that window (`computeCoverage`), `null` without either; `unmappedReferences` is the references of unmapped aliases (all of them while there is no Binding), `null` without an active window.

| Action | Input | Answer |
| --- | --- | --- |
| `eqv.importSampleWindow` | `equipmentId`, `uploadId` (the id `PlatformAdapter.uploadFile` answered for a `*.batch.json`; never the file body) | the stored window as an `eqv.sampleWindows` row |
| `eqv.replaceSampleWindow` | `equipmentId`, `windowHash` of a `staged` window | `{ equipmentId, activeHash, replacedHash }` |
| `eqv.retireSampleWindow` | `equipmentId`, `windowHash` of an `active` window | `{ equipmentId, retiredHash }` |
| `eqv.registerEquipment` | `equipmentId`, `label`, `vendorId`, `modelId` (Hub ids) | `{ equipmentId }` |

All four are `concurrency: 'none'` and need `eqv-studio:window-import` (capability `eqv.window.import`, session-only, Admin bypass, not for the User role), judged in `authorize` and again in `handle` after the equipment advisory lock (the lock `publishMapping` takes, so a window cannot change under a publish). Import, replace and retire invalidate `eqv.sampleWindows`, `eqv.observedInventory` and `eqv.fleet`; registration invalidates `eqv.fleet` and `eqv.equipmentScopes`. An equipment the actor cannot address is `equipmentId/not_found` for the three window actions, like a missing one. Each writes one audit row in the dispatch transaction with equipment id and hashes only (and the Hub ids of a registration), never the file, a batch, an Inventory or a label; a refused transaction leaves no audit row.

- **Import.** The server reads the upload by id as the uploader through the attachments service (`readUnlinkedUpload`, [ADR-0140](../../../adr/0140-generic-file-upload-port.md) §6): an unknown, expired (24 h), linked, archived or another user's upload is `uploadId/not_found`. It parses strict UTF-8 JSON (`file/not_json`) and judges it with `@eqv/core` `checkSampleWindowImport` (`sameRangeReplaces`) against the equipment's non-retired windows; each core issue is `file/<path>` with the core code and nothing else (core messages stay in the module). The same content again answers the stored row unchanged; the content of a retired window is `file/retired` and stores nothing; a reprocessed Data Generation of an active window's exact range is stored `staged` with `counterpart_hash` = that window (EV#105) and changes nothing until `eqv.replaceSampleWindow`, unless a staged window already waits over that range, whether or not its counterpart is still active (`file/staged_exists`; one active window per exact range, always). The window's Inventory is `buildInventory` of the validated batch, built once at import; the server holds no alias metadata, so `moduleType`/`isPort`/`isRobot` are not set (see «Not implemented»).
- **Replace.** The staged window becomes `active`, its counterpart `replaced`, and both keep `counterpart_hash` pointing at each other; Baselines never change. The window it replaces is the `active` window of the equipment with the staged row's exact `from`/`to`, whatever the staged row's recorded counterpart (that one may have been retired); if none is active the staged window simply becomes `active` and `replacedHash` is `''`. A window that is not `staged` (or unknown) is `windowHash/not_staged`.
- **Retire.** An `active` window becomes `retired`; a window that is not `active` (or unknown) is `windowHash/not_active`. Published Baselines keep their row and `mappingCount`.
- **Register.** `equipmentId/invalid` (not `[A-Za-z0-9][A-Za-z0-9._-]*`, at most 200 characters), `label/invalid` (empty after trimming, over 120 characters or control characters), `vendorId/invalid` or `modelId/invalid` (not a uuid), then in this order `vendorId/not_found` (no such Hub vendor), `modelId/not_found` (no such model for the actor, a model hidden from the actor, or a model of another vendor: all alike), `equipmentId/exists` (also an id that differs only by letter case). Registrations of one id serialize on an advisory lock, so concurrent case variants register once. `equipmentId/exists` is the one answer that reveals an id taken under a Hub model hidden from the actor; it is accepted because equipment ids are unique per workspace regardless of letter case, and only `eqv.window.import` holders with a visible vendor and model reach that check.

The menu pre-checks the file (32 MiB, `*.batch.json` declared `application/json`) and previews the same core verdict; the server's answer decides.

## Not implemented

A Hub Model list read for registration (the menu offers only the Models Fleet already shows; reopen when the owner wants to register under a Model no equipment uses yet), alias metadata storage (`moduleType`, `isPort`, `isRobot` of an alias: imported windows are built without them, and the mock does the same; reopen with an alias-metadata import), a permission-aware eqv audit view.
