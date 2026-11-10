# eqv — Layouts, Revisions and Templates (#1645)

Menu Dispatch declarations of the `eqv` module ([ADR-0135](../../../adr/0135-eqv-layout-storage-publish-and-promotion.md); module guide `apps/platform-api/src/modules/eqv/AGENTS.md`). Migration `0121_eqv_layouts.sql`. Workspace-scoped; the workspace is the actor's, never a param.

## Access

- Reads: permission `eqv:view` (capability `eqv.view`; Admin through the module bypass). Writes: `saveDraft` needs `eqv-studio:layout-edit` (`eqv.layout.edit`); `publishRevision` and `promoteTemplate` need `eqv-studio:layout-publish` (`eqv.layout.publish`; «승인» is this capability check, no approval flow). `eqv.layout.edit` and `eqv.layout.publish` are session-only and not for the User role.
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

## Writes (menu-action)

Answers carry ids and versions, not document bodies. Audit is written in the same transaction (`eqv.layout.draft_created|draft_saved`, `eqv.layout.revision_published`, `eqv.template.promoted`; subject types `eqv_layout`, `eqv_layout_revision`, `eqv_template`; the subject id is the row uuid; detail is ids, versions and the Revision hash only).

- **`eqv.saveDraft`** `{ layoutId, document }`, `concurrency: 'version'`. With no draft the current version is `'0'`: create with `expectedVersion: '0'`; the first row is version `1`. `'0'` on an existing draft, or a stale version, is `conflict` (the loser of a creation race too). Answer `{ id, layoutId, version }`.
- **`eqv.publishRevision`** `{ layoutId }`, `concurrency: 'version'` on the draft version the author saw (no draft → `not_found`). Writes an immutable Revision (`revision` = `layoutRevision` of the validated layout). Publishing the same hash again answers `ok` with the existing Revision (`created: false`) and writes no further audit row. Answer `{ id, layoutId, revision, created }`.
- **`eqv.promoteTemplate`** `{ layoutId, revision, templateId, name }`. Template from a published Revision; result re-validated. Answer `{ id, templateId }`.

Refusals are `invalid` with field errors, never a 500: the document is not a valid Layout (codes of `validateLayout`, including `hierarchy-cycle`, EV#170); `document.id` ≠ `layoutId` (`id_mismatch`); `kind` not `equipment-layout` (`kind_not_equipment_layout`); a bundled Template id (`bundled_template_id`); a duplicate Template id (`duplicate`); an unknown Revision (`not_found`); a Revision whose stored hash no longer matches (`hash_mismatch`).

## Not implemented

Mapping, Bindings, alias rules, Type Dictionary, Sample Window storage or cache, the equipment write action, and the capabilities `eqv.mapping.publish`, `eqv.rules.edit`, `eqv.dictionary.global_edit`, `eqv.window.import` (steps 8–9).
