# eqv — Layouts, Revisions, Templates (#1645) and Onboarding storage (#1658)

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
| `eqv.equipment-options` (menu `eqv:focus`) | — | `{ options: { id, label, dataRange: { from, to } \| null }[] }`, at most 1000. `dataRange` is `[from, to)`, `null` until step 9 |

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

Menu `eqv-onboarding` (constant `EQV_ONBOARDING_MENU_ID`; only this constant changes if the owner picks another id). Migration `0124_eqv_onboarding.sql`: tables `alias_rules`, `type_dictionary` (one row per Mapping Scope, `version`), immutable `mapping_version` and `baseline_inventory`, `binding` (only `effective_to` is ever updated). **Scope keys are Hub ids:** `{ level, vendorId?, modelId?, equipmentId? }`, with `maker` = Hub vendor id and `model` = Hub model id in the `@eqv/core` scope. No free maker/model string. Only the ids a level needs are accepted (a surplus id is `unexpected`).

**Access.** Reads: `eqv:view` (capability `eqv.view`; the menu is entered with `eqv-studio:view`). Writes: a `global`-level alias rules or Type Dictionary write needs `eqv.dictionary.global_edit` (`eqv-studio:dictionary-global-edit`); any other rules or dictionary write needs `eqv.rules.edit` (`eqv-studio:rules-edit`); `publishMapping` needs `eqv.mapping.publish` (`eqv-studio:mapping-publish`). The right is judged per request on the transaction, again after the lock wait; a denial is `forbidden` with no detail. A scope target the actor cannot address (unknown vendor, unknown equipment, a Hub model hidden from the actor) answers like a missing one: reads `empty`, writes `not_found`.

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
| `eqv.publishMapping` | `equipmentId`, `layoutId`, `layoutRevision`, `baseline`, `effectiveFrom` | `{ mappingHash, bindingId, version }` |

- Saves are `concurrency: 'version'`: `'0'` while no row exists, first row version 1, `'0'` on an existing row or a stale version is `conflict` (a creation race too). `@eqv/core`'s `validateAliasRules` / `validateTypeDictionary` is the verdict and the document's `scope` must equal the addressed scope (`scope_mismatch`); only the validated file is stored. Issues answer `invalid` with `{ path, code }` only (core messages stay in the module).
- `publishMapping` is `concurrency: 'version'` over the equipment's Binding row count (`'0'` with none), so it lands only over the Bindings the author saw. One transaction under an equipment advisory lock: the published Layout Revision must exist (`layoutRevision/not_found`; the action never publishes a draft) and hash-check; the applicable alias rule rows (global, maker, model, equipment) go to `@eqv/core` `publishMapping` with the aliases of `baseline`; any issue is `invalid` (`mapping/...`) and nothing is stored; Mapping Conflicts never block. `effectiveFrom` is a strict Site Wall-clock (`fraction-missing`, `fraction-too-long`, `offset`, `malformed`, `impossible`: never truncated) and must be later than the latest Binding's (`not_after_latest`); the same mapping hash and Layout Revision as the latest is `invalid` `mapping/same-as-latest`. Then: Mapping Version (an existing same hash is reused), Baseline (the first one of a hash stays), the open latest Binding is closed at `effectiveFrom`, the new Binding is inserted, `validateBindings` runs on the resulting set, and one audit row is written.
- **Interim:** `baseline` is a client-supplied `ObservedInventory` (validated by `observedInventorySchema`, `equipmentId` must match: `baseline/equipmentId/equipment_mismatch`). Sample Window storage is not implemented; reopen when it lands (publish then takes a stored window id).
- Audit (same transaction, ids only): `eqv.alias_rules.created|saved` (subject `eqv_alias_rules`), `eqv.type_dictionary.created|saved` (`eqv_type_dictionary`), `eqv.mapping.published` (subject `eqv_binding`, detail equipment id, mapping hash, Layout Revision, `effectiveFrom`). The viewerless audit projection keeps excluding `eqv_` subjects.

## Pending server

The 설비 온보딩 menu (`eqv-onboarding`, #1658) declares these in `menus/tools/topview-studio/src/endpoints.ts` and the menu mock serves them; the server comes in the #1658 Sample Window·Fleet PR. Reads declare `eqv:view`, `requiresScope: false`. The other onboarding declarations (`eqv.aliasRules`, `eqv.typeDictionary`, `eqv.equipmentScopes`, `eqv.mappingVersions`, `eqv.mappingVersion`, `eqv.bindings`, `eqv.baselineInventory`, `eqv.saveAliasRules`, `eqv.saveTypeDictionary`, `eqv.publishMapping`) are served by the eqv module (section «Onboarding» above).

| Declaration | Params / input | Data | Right |
| --- | --- | --- | --- |
| `eqv.fleet` (read) | — | `{ rows: { equipmentId, label, vendorId, vendorName, modelId, modelName, status, latestWindow: { hash, from, to } \| null, coverage: { referenceRatio, aliasRatio, assumedRatio } \| null, unmappedReferences }[] }`. `status` is a code: `no-observations`, `unstarted`, `draft`, `published`, `drift`, `drift-unknown` (the screen owns the words). Coverage is the latest Binding against the latest active window | `eqv:view` |
| `eqv.sampleWindows` (read) | `equipmentId` | `{ rows: { hash, from, to, dataGeneration, timeDomain, occurrences, state, counterpart, mappingCount }[] }`. `state`: `active`, `staged` (a reprocessed Data Generation of an active window's range, `counterpart` = that window), `replaced` (`counterpart` = its replacement), `retired`. `mappingCount`: published Mapping Versions whose Baseline came from the window | `eqv:view` |
| `eqv.observedInventory` (read) | `equipmentId`, `windowHash` (64 hex) | the window's `ObservedInventory`; `empty` for a window the equipment does not have | `eqv:view` |
| `eqv.bundledTemplates` (read) | — | `{ rows: { templateId, name, document }[] }`: the EV Templates the package ships (`BUNDLED_TEMPLATE_IDS`); `eqv.templates` lists promoted ones only | `eqv:view` |
| `eqv.replaceSampleWindow` (write, `concurrency: 'none'`) | `equipmentId`, `windowHash` of a `staged` window | `{ equipmentId, activeHash, replacedHash }`; the staged window becomes `active`, its counterpart `replaced`. Published Baselines do not change | `eqv-studio:window-import` (capability `eqv.window.import`) |
| `eqv.retireSampleWindow` (write, `concurrency: 'none'`) | `equipmentId`, `windowHash` of an `active` window | `{ equipmentId, retiredHash }`; published Baselines stay | `eqv-studio:window-import` |
| `eqv.importSampleWindow` (write, `concurrency: 'none'`; invalidates `eqv.sampleWindows`, `eqv.observedInventory`, `eqv.fleet`) | `equipmentId`, `uploadId` (the id `PlatformAdapter.uploadFile` answered for a `*.batch.json`; never the file body) | the stored window as an `eqv.sampleWindows` row. The server reads the upload by id within its 24 h as the uploader ([ADR-0140](../../../adr/0140-generic-file-upload-port.md) §6) and judges it with `@eqv/core` `checkSampleWindowImport` (`sameRangeReplaces`): the same content again answers the stored row; a reprocessed Data Generation of an active window's exact range is stored `staged` (EV#105) and changes nothing until `eqv.replaceSampleWindow`; the Inventory is built with the equipment's alias metadata | `eqv-studio:window-import` |
| `eqv.registerEquipment` (write, `concurrency: 'none'`; invalidates `eqv.fleet`, `eqv.equipmentScopes`) | `equipmentId`, `label`, `vendorId`, `modelId` (Hub ids, as the dev tool's `maker`/`model`) | `{ equipmentId }`; the equipment appears in Fleet as `no-observations` | `eqv-studio:window-import` |

Refusals are `invalid` with field errors: a window that is not `staged` (`not_staged`) or not `active` (`not_active`); for an import `uploadId/not_found` (unknown, expired or another user's upload), `file/not_json`, `file/<path>` with the core import code per issue (for example `file/from` `window-overlap`), `file/staged_exists` (the active window already has a staged replacement), `file/retired` (the content of a retired window; it stays retired and the import stores nothing), `equipmentId/not_found`; for a registration `equipmentId/invalid` (not an id the address carries, at most 200 characters), `equipmentId/exists` (also one that differs only by letter case, like the dev tool), `label/invalid` (empty, over 120 characters or control characters), `vendorId/not_found` or `modelId/not_found` (no such Hub vendor or model for the actor). The menu pre-checks the file (32 MiB, `*.batch.json` declared `application/json`) and previews the same core verdict; the server's answer decides.

## Not implemented

Sample Window storage or cache and the capability `eqv.window.import` (reopen when Sample Window storage lands: publish then takes a stored window id and derives the Baseline), the server side of `eqv.importSampleWindow` and `eqv.registerEquipment` (declared above as pending), a Hub Model list read for registration (the menu offers only the Models Fleet already shows), a permission-aware eqv audit view.
