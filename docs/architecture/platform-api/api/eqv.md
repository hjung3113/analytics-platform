# eqv — Layouts, Revisions and Templates (#1645)

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

`eqv.topview-context` and `eqv.topview-events` are not served (step 9).

## Read service for other modules

`modules/eqv/read-service.ts` (an approved cross-module surface) lets another module read a **published** Revision without the Studio endpoints: `getPublishedRevision(tx, workspaceId, layoutId, revision)` → `{ layoutId, revision, document, publishedAt } | null`, and `listPublishedRevisions(tx, workspaceId)` → `{ layoutId, revision, publishedAt }[]`, newest first, **at most 500** rows (no document). The caller passes the workspace it verified and owns the permission; the service decides none. `getPublishedRevision` re-validates the stored document and re-hashes it like `eqv.promoteTemplate`; a mismatch is `null` plus a server log line, never a document. The only caller is the Hub (`logKnowledge.modelTopView`, `linkTopView`, `topViewRevisionOptions`, [log-knowledge.md «Model Top View pointer»](log-knowledge.md)): a Hub reader needs **no `eqv:view`** — the Hub's model ACL decides, and the Hub stores only the pointer (`knowledge.model_topview_link`).

## Writes (menu-action)

Answers carry ids and versions, not document bodies. Audit is written in the same transaction (`eqv.layout.draft_created|draft_saved`, `eqv.layout.revision_published`, `eqv.template.promoted`; subject types `eqv_layout`, `eqv_layout_revision`, `eqv_template`; the subject id is the row uuid; detail is ids, versions and the Revision hash only). The viewerless global audit projection (migration 0121) excludes `eqv_` subjects, as it does `knowledge_`, because a console-only actor without `eqv.view` must not learn eqv ids or totals ([ADR-0135](../../../adr/0135-eqv-layout-storage-publish-and-promotion.md) §9); the rows still exist in `core.audit_log`, and a permission-aware eqv audit view is not built.

- **`eqv.saveDraft`** `{ layoutId, document }`, `concurrency: 'version'`. With no draft the current version is `'0'`: create with `expectedVersion: '0'`; the first row is version `1`. `'0'` on an existing draft, or a stale version, is `conflict` (the loser of a creation race too). Answer `{ id, layoutId, version }`.
- **`eqv.publishRevision`** `{ layoutId }`, `concurrency: 'version'` on the draft version the author saw (no draft → `not_found`). Writes an immutable Revision (`revision` = `layoutRevision` of the validated layout). Publishing the same hash again answers `ok` with the existing Revision (`created: false`) and writes no further audit row. Answer `{ id, layoutId, revision, created }`.
- **`eqv.promoteTemplate`** `{ layoutId, revision, templateId, name }`. Template from a published Revision; result re-validated. Answer `{ id, templateId }`.

Refusals are `invalid` with field errors, never a 500: the document is not a valid Layout (codes of `validateLayout`, including `hierarchy-cycle`, EV#170); `document.id` ≠ `layoutId` (`id_mismatch`); `kind` not `equipment-layout` (`kind_not_equipment_layout`); a bundled Template id (`bundled_template_id`); a duplicate Template id (`duplicate`); an unknown Revision (`not_found`); a Revision whose stored hash no longer matches (`hash_mismatch`).

## Not implemented

Mapping, Bindings, alias rules, Type Dictionary, Sample Window storage or cache, the equipment write action, and the capabilities `eqv.mapping.publish`, `eqv.rules.edit`, `eqv.dictionary.global_edit`, `eqv.window.import` (steps 8–9).
