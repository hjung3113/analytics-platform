# eqv module

Owns the `eqv` schema (#1645, #1607 step 5, [ADR-0135](../../../../../docs/adr/0135-eqv-layout-storage-publish-and-promotion.md)): `layout_draft`, `layout_revision` (immutable), `template` (create-only), `equipment` (read-only here); #1658 ([ADR-0139](../../../../../docs/adr/0139-eqv-onboarding-storage-and-publish.md)) adds `alias_rules`, `type_dictionary`, `mapping_version` (immutable), `baseline_inventory` (immutable), `binding`. Contract: `docs/architecture/platform-api/api/eqv.md`. Contributes reads and actions to Menu Dispatch (`index.ts` → `eqvContribution`).

## Rules

- **Validation is `@eqv/core`'s, in `domain/layout-checks.ts` only.** `validateLayout` is the final verdict (a `hierarchy-cycle` is refused before anything is stored, EV#170). Hash and store only the validated `result.layout`, never the raw input. zod 4 issues are mapped to `{ path, code }` there and never leave the module.
- **Immutable by grant.** `platform_app` has INSERT and SELECT on `layout_revision` and `template`, a column-limited UPDATE on `layout_draft` (`document`, `version`, `updated_at`, `updated_by`), SELECT on `equipment`. Do not widen it; `repositories/eqv-write.ts` has no update or delete for Revisions or Templates.
- **Writes** run in the dispatch transaction; `promoteTemplate` re-judges `eqv.layout.publish` on that transaction right after its Template lock (throws `MenuActionForbiddenError` → `forbidden`). They take the per-layout advisory lock (`lockKey`) before reading, write their audit row (`audit.ts`) in that transaction, and answer ids and versions, never a document (replay record ≤ 128 KiB).
- **Draft versions.** `saveDraft.currentVersion` answers `'0'` while no row exists (never `null`: the engine turns that into `not_found`); the first row is version 1.
- **Templates** come from a published Revision (EV ADR-0015). Bundled ids (`BUNDLED_TEMPLATE_IDS`) are refused.
- **Menu ids.** This rule covers the Layouts reads and actions (`EQV_STUDIO_MENU_ID`); Onboarding sits on `EQV_ONBOARDING_MENU_ID` (see the Onboarding section). Every Layouts read except `eqv.equipment-options` (`eqv:focus`) and all actions sit on `EQV_STUDIO_MENU_ID` because `invalidates` names only same-menu endpoints. Do not declare `eqv.topview-context` / `eqv.topview-events` (step 9).
- **Permissions** are declared in `EQV_MENU_PERMISSIONS` (`menu.ts`, handed over by `eqvContribution`) (`eqv:view`, `eqv-studio:view`, `eqv-studio:layout-edit`, `eqv-studio:layout-publish`; `eqv-studio:view` is the entry permission of the Studio Layouts menu, #1654, with the same capability `eqv.view` as `eqv:view`, which the reads keep), not `eqv:*`-prefixed write names: the `eqv` namespace belongs to the app's module (Kernel registry refuses a clash). Real-server Site Scope is enforced by capability alone until #1087.
- `equipment.model_id` is a Hub catalog id with no FK; the Onboarding writes and reads check it through `knowledgeLookup.getModel` (`onboarding-scope.ts`), so a model hidden from the actor is "not there", the same as a missing equipment.

## Onboarding (#1658)

- **Files.** `onboarding-endpoints.ts` (7 reads), `onboarding-actions.ts` (`saveAliasRules`, `saveTypeDictionary`, `publishMapping`), `domain/mapping-checks.ts` (the only place zod issues of the core mapping validators become `{ path, code }`), `repositories/onboarding-read.ts` / `onboarding-write.ts`. All sit on `EQV_ONBOARDING_MENU_ID` (`eqv-onboarding`); only that constant changes if the owner picks another id.
- **Scope keys are Hub ids** (maker = vendor uuid, model = model uuid, equipment = `equipment_id`); no free maker/model string. A request carries exactly the ids its level needs.
- **Who writes what.** `global` level (rules or dictionary) → `eqv.dictionary.global_edit`; other levels → `eqv.rules.edit`; publish → `eqv.mapping.publish`. Judged in `authorize` from the raw input and again in `handle` after the advisory lock.
- **Immutable by grant.** `mapping_version` and `baseline_inventory` have INSERT and SELECT only; `binding` allows UPDATE of `effective_to` only (closing the open latest Binding); `alias_rules` / `type_dictionary` allow `document`, `version`, `updated_at`, `updated_by`. No DELETE anywhere. Repositories have no other update path.
- **Versions.** Saves: `'0'` while no row, first row 1. `publishMapping`: the equipment's Binding row count as a string. The equipment lock (`lockOnboarding`) is taken in `currentVersion` and held to the end.
- **Publish** needs an already published Layout Revision (never publishes a draft), judges through `@eqv/core` `publishMapping`, refuses `effectiveFrom` that is not strictly later than the latest Binding (`not_after_latest`) and an unchanged hash plus Revision (`same-as-latest`), reuses a stored same-hash Mapping Version, keeps the first Baseline of a hash, and runs `validateBindings` on the resulting set before commit. Type Dictionaries are not inputs of core `publishMapping`, so publish does not load them.
- **Vendor existence** goes through `knowledgeLookup.getVendor` (`onboarding-scope.ts`), never `knowledge.vendor` directly (module boundary doc 02).

## Read service

`read-service.ts` is the approved surface other modules call (`getPublishedRevision`, `listPublishedRevisions`, at most 500, newest first); it wraps `repositories/eqv-read.ts`, takes a caller-verified workspace and decides no permission, and re-checks the stored hash (a mismatch is `null` plus a log line). The Hub's pointer to a Revision (`knowledge.model_topview_link`) belongs to `log-knowledge`; the Revision and Template tables stay here and the Hub never copies a document.

## Not implemented

- A permission-aware eqv audit view: the global audit projection excludes `eqv_` subjects (migration 0121, ADR-0135 §9) and the rows stay in `core.audit_log`. Reopen when a menu needs an eqv audit view (the Onboarding subjects `eqv_alias_rules`, `eqv_type_dictionary`, `eqv_binding` are excluded the same way).
- Capability `eqv.window.import` and Sample Window storage or server cache (EV#105). Interim: `publishMapping` takes a client-supplied `ObservedInventory` as Baseline. Reopen when Sample Window storage lands: publish then takes a stored window id and the server derives the Baseline.
- `equipment` write action; `dataRange` (answers `null`, step 9).
