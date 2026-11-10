# eqv module

Owns the `eqv` schema (#1645, #1607 step 5, [ADR-0135](../../../../../docs/adr/0135-eqv-layout-storage-publish-and-promotion.md)): `layout_draft`, `layout_revision` (immutable), `template` (create-only), `equipment` (read-only here). Contract: `docs/architecture/platform-api/api/eqv.md`. Contributes reads and actions to Menu Dispatch (`index.ts` → `eqvContribution`).

## Rules

- **Validation is `@eqv/core`'s, in `domain/layout-checks.ts` only.** `validateLayout` is the final verdict (a `hierarchy-cycle` is refused before anything is stored, EV#170). Hash and store only the validated `result.layout`, never the raw input. zod 4 issues are mapped to `{ path, code }` there and never leave the module.
- **Immutable by grant.** `platform_app` has INSERT and SELECT on `layout_revision` and `template`, a column-limited UPDATE on `layout_draft` (`document`, `version`, `updated_at`, `updated_by`), SELECT on `equipment`. Do not widen it; `repositories/eqv-write.ts` has no update or delete for Revisions or Templates.
- **Writes** run in the dispatch transaction; `promoteTemplate` re-judges `eqv.layout.publish` on that transaction right after its Template lock (throws `MenuActionForbiddenError` → `forbidden`). They take the per-layout advisory lock (`lockKey`) before reading, write their audit row (`audit.ts`) in that transaction, and answer ids and versions, never a document (replay record ≤ 128 KiB).
- **Draft versions.** `saveDraft.currentVersion` answers `'0'` while no row exists (never `null`: the engine turns that into `not_found`); the first row is version 1.
- **Templates** come from a published Revision (EV ADR-0015). Bundled ids (`BUNDLED_TEMPLATE_IDS`) are refused.
- **Menu ids.** Every read except `eqv.equipment-options` (`eqv:focus`) and all actions sit on `EQV_STUDIO_MENU_ID` because `invalidates` names only same-menu endpoints. Do not declare `eqv.topview-context` / `eqv.topview-events` (step 9).
- **Permissions** are declared in `EQV_MENU_PERMISSIONS` (`menu.ts`, handed over by `eqvContribution`) (`eqv:view`, `eqv-studio:layout-edit`, `eqv-studio:layout-publish`), not `eqv:*`-prefixed write names: the `eqv` namespace belongs to the app's module (Kernel registry refuses a clash). Real-server Site Scope is enforced by capability alone until #1087.
- `equipment.model_id` is a Hub catalog id with no FK; the future write (step 8) checks it through `knowledgeLookup`.

## Not implemented (reopen when step 8 / 9 starts)

- A permission-aware eqv audit view: the global audit projection excludes `eqv_` subjects (migration 0121, ADR-0135 §9) and the rows stay in `core.audit_log`. Reopen when a menu needs an eqv audit view.
- Capabilities `eqv.mapping.publish`, `eqv.rules.edit`, `eqv.dictionary.global_edit`, `eqv.window.import`: each is added beside its first endpoint.
- Bindings, Mapping, alias and Type Dictionary tables; Sample Window storage or server cache (EV#105); `equipment` write action; `dataRange` (answers `null`).
