// The Onboarding writes as menu-dispatch actions (#1658, ADR-0139): saveAliasRules, saveTypeDictionary, publishMapping. Each writes its audit
// row in the same transaction, answers ids, versions and hashes (never a document: the replay record holds 128 KiB), and takes its verdict
// from `@eqv/core`. Rights: a write at `global` level needs `eqv.dictionary.global_edit` (a global row changes every equipment), any other
// rule or dictionary write needs `eqv.rules.edit`, and publish needs `eqv.mapping.publish`; each is judged per request on the transaction
// (also after the lock wait) and answers `forbidden` without detail.
//
// Version contract of the saves: `currentVersion` answers `'0'` while no row exists (never `null`), the first row is version 1, `'0'`
// against an existing row is a `conflict`. publishMapping's version is the equipment's Binding row count (`'0'` with none), so a publish
// lands only over the Bindings its author saw, and its `expectedMappingHash` makes it publish only the Mapping its author
// reviewed (another flattened hash is `mapping/changed`). An unknown scope target, an unknown equipment and a hidden Hub model all answer `not_found`.
import { type AliasRulesFile, latestBinding, layoutRevision, publishMapping, validateBindings } from '@eqv/core';

import type { Tx } from '../../db/tx.js';
import { type FieldError, type MenuActionDeclaration, MenuActionForbiddenError, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type EqvDeps, eqvAuthorize } from './authorize.js';
import { recordAliasRules, recordMappingPublished, recordTypeDictionary } from './audit.js';
import { checkEquipmentLayout, isLayoutId, REVISION_PATTERN } from './domain/layout-checks.js';
import {
  checkAliasRules,
  checkBaseline,
  checkTypeDictionary,
  isEquipmentId,
  isObject,
  issueErrors,
  parseScope,
  scopeKey,
  wallClockProblem,
  type MappingScopeRef,
} from './domain/mapping-checks.js';
import {
  EQV_DICTIONARY_GLOBAL_EDIT_CAPABILITY,
  EQV_MAPPING_PUBLISH_CAPABILITY,
  EQV_MAPPING_PUBLISH_PERMISSION,
  EQV_ONBOARDING_MENU_ID,
  EQV_RULES_EDIT_CAPABILITY,
  EQV_RULES_EDIT_PERMISSION,
} from './menu.js';
import { equipmentScope, scopeAddressable, type ModelLookup } from './onboarding-scope.js';
import { isWindowHex, windowHashOf } from './domain/window-checks.js';
import { findRevision } from './repositories/eqv-write.js';
import * as read from './repositories/onboarding-read.js';
import * as write from './repositories/onboarding-write.js';
import { getWindowRow } from './repositories/window-read.js';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

export function onboardingActions(deps: EqvDeps & { knowledgeLookup: ModelLookup }): MenuActionDeclaration[] {
  const rulesEdit = eqvAuthorize(deps, EQV_RULES_EDIT_CAPABILITY);
  const globalEdit = eqvAuthorize(deps, EQV_DICTIONARY_GLOBAL_EDIT_CAPABILITY);
  const mappingPublish = eqvAuthorize(deps, EQV_MAPPING_PUBLISH_CAPABILITY);
  const O = EQV_ONBOARDING_MENU_ID;

  /** The capability a request needs by its level; an unreadable level needs `eqv.rules.edit` (validate refuses it right after). */
  const canWrite = (actor: Parameters<typeof rulesEdit>[0], tx: Tx | undefined, input: Record<string, unknown>) =>
    input.level === 'global' ? globalEdit(actor, tx) : rulesEdit(actor, tx);

  /** The two scoped saves differ only in their table, verdict, audit row and allowed levels. */
  function scopedSave(cfg: {
    id: 'eqv.saveAliasRules' | 'eqv.saveTypeDictionary';
    kind: 'alias_rules' | 'type_dictionary';
    allowEquipment: boolean;
    check: (scope: MappingScopeRef, document: unknown) => { ok: true; file: unknown } | { ok: false; errors: FieldError[] };
    inputKeys: readonly string[];
    invalidates: readonly string[];
  }): MenuActionDeclaration {
    const rowOf = (tx: Tx, ws: string, scope: MappingScopeRef) =>
      cfg.kind === 'alias_rules' ? read.getAliasRulesRow(tx, ws, scope) : read.getTypeDictionaryRow(tx, ws, scope);
    return {
      spec: { id: cfg.id, menuId: O, inputKeys: cfg.inputKeys, permission: EQV_RULES_EDIT_PERMISSION, requiresScope: false, concurrency: 'version', invalidates: cfg.invalidates },
      authorize: (actor, tx, input) => canWrite(actor, tx, input ?? {}),
      // A replay shows the stored answer only where a fresh call would still address the scope (a hidden Hub model or a missing equipment is "not there").
      async canReplay(tx, actor, input) {
        const parsed = parseScope(input, cfg.allowEquipment);
        return parsed.ok && (await scopeAddressable(tx, deps.knowledgeLookup, actor, parsed.scope));
      },
      validate(input) {
        const parsed = parseScope(input, cfg.allowEquipment);
        if (!parsed.ok) return parsed.errors;
        if (!isObject(input.document)) return [{ path: ['document'], code: 'invalid' }];
        const checked = cfg.check(parsed.scope, input.document);
        return checked.ok ? [] : checked.errors;
      },
      async currentVersion(tx, actor, input) {
        const parsed = parseScope(input, cfg.allowEquipment);
        if (!parsed.ok) return null;
        await write.lockOnboarding(tx, cfg.kind, actor.workspace_id, scopeKey(parsed.scope));
        if (!(await scopeAddressable(tx, deps.knowledgeLookup, actor, parsed.scope))) return null;
        const row = await rowOf(tx, actor.workspace_id, parsed.scope);
        return row ? String(row.version) : '0';
      },
      async handle(tx, actor, input) {
        const parsed = parseScope(input, cfg.allowEquipment);
        if (!parsed.ok) throw invalid(...parsed.errors);
        const scope = parsed.scope;
        await write.lockOnboarding(tx, cfg.kind, actor.workspace_id, scopeKey(scope));
        // The wait for this lock came after the dispatcher's last check: judge the right again, before any read or write.
        if (!(await canWrite(actor, tx, input))) throw new MenuActionForbiddenError();
        if (!(await scopeAddressable(tx, deps.knowledgeLookup, actor, scope))) throw invalid({ path: ['level'], code: 'not_found' });
        const checked = cfg.check(scope, input.document);
        if (!checked.ok) throw invalid(...checked.errors);
        // Only the validated file is stored.
        const document = checked.file;
        const detailScope = {
          level: scope.level,
          ...('vendorId' in scope ? { vendorId: scope.vendorId } : {}),
          ...('modelId' in scope ? { modelId: scope.modelId } : {}),
          ...('equipmentId' in scope ? { equipmentId: scope.equipmentId } : {}),
        };
        const existing = await rowOf(tx, actor.workspace_id, scope);
        const record = cfg.kind === 'alias_rules' ? recordAliasRules : recordTypeDictionary;
        const label = cfg.kind === 'alias_rules' ? 'Alias rules' : 'Type Dictionary';
        let row: { id: string; version: number };
        if (!existing) {
          const values = { workspaceId: actor.workspace_id, scope, document, actorId: actor.actor_id };
          row = cfg.kind === 'alias_rules' ? await write.insertAliasRules(tx, values) : await write.insertTypeDictionary(tx, values);
          await record({ tx, actor, type: 'created', subjectId: row.id, scope: detailScope, version: row.version, summary: `${label} of ${scope.level} scope created` });
        } else {
          const values = { id: existing.id, workspaceId: actor.workspace_id, document, actorId: actor.actor_id };
          row = cfg.kind === 'alias_rules' ? await write.updateAliasRules(tx, values) : await write.updateTypeDictionary(tx, values);
          await record({ tx, actor, type: 'saved', subjectId: row.id, scope: detailScope, version: row.version, summary: `${label} of ${scope.level} scope saved` });
        }
        return { data: { id: row.id, version: String(row.version) }, version: String(row.version) };
      },
    };
  }

  const saveAliasRules = scopedSave({
    id: 'eqv.saveAliasRules',
    kind: 'alias_rules',
    allowEquipment: true,
    check: checkAliasRules,
    inputKeys: ['level', 'vendorId', 'modelId', 'equipmentId', 'document'],
    invalidates: ['eqv.aliasRules', 'eqv.fleet'],
  });
  const saveTypeDictionary = scopedSave({
    id: 'eqv.saveTypeDictionary',
    kind: 'type_dictionary',
    allowEquipment: false,
    check: checkTypeDictionary,
    inputKeys: ['level', 'vendorId', 'modelId', 'document'],
    invalidates: ['eqv.typeDictionary', 'eqv.fleet'],
  });

  const publish: MenuActionDeclaration = {
    spec: {
      id: 'eqv.publishMapping',
      menuId: O,
      inputKeys: ['equipmentId', 'layoutId', 'layoutRevision', 'windowHash', 'effectiveFrom', 'expectedMappingHash'],
      permission: EQV_MAPPING_PUBLISH_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      // Fleet status and a window's `mappingCount` change with a publish (#1658 Sample Window·Fleet PR, D4).
      invalidates: ['eqv.mappingVersions', 'eqv.bindings', 'eqv.fleet', 'eqv.sampleWindows'],
    },
    authorize: (actor, tx) => mappingPublish(actor, tx),
    async canReplay(tx, actor, input) {
      return isEquipmentId(input.equipmentId) && (await equipmentScope(tx, deps.knowledgeLookup, actor, input.equipmentId)) !== null;
    },
    validate(input) {
      const errors: FieldError[] = [];
      if (!isEquipmentId(input.equipmentId)) errors.push({ path: ['equipmentId'], code: 'invalid' });
      if (!isLayoutId(input.layoutId)) errors.push({ path: ['layoutId'], code: 'invalid' });
      if (typeof input.layoutRevision !== 'string' || !REVISION_PATTERN.test(input.layoutRevision)) errors.push({ path: ['layoutRevision'], code: 'invalid' });
      const clock = wallClockProblem(input.effectiveFrom);
      if (clock) errors.push({ path: ['effectiveFrom'], code: clock });
      if (!isWindowHex(input.windowHash)) errors.push({ path: ['windowHash'], code: 'invalid' });
      // The Mapping hash the author reviewed (`sha256:<64 lowercase hex>`, the same form as a Revision).
      if (typeof input.expectedMappingHash !== 'string' || !REVISION_PATTERN.test(input.expectedMappingHash)) errors.push({ path: ['expectedMappingHash'], code: 'invalid' });
      return errors;
    },
    // The version the author saw is the number of Bindings of the equipment; the equipment lock is taken here and held to the end.
    async currentVersion(tx, actor, input) {
      const equipmentId = String(input.equipmentId);
      await write.lockOnboarding(tx, 'equipment', actor.workspace_id, equipmentId);
      if (!(await equipmentScope(tx, deps.knowledgeLookup, actor, equipmentId))) return null;
      return String((await read.listBindingRows(tx, actor.workspace_id, equipmentId)).length);
    },
    async handle(tx, actor, input) {
      const ws = actor.workspace_id;
      const equipmentId = String(input.equipmentId);
      const layoutId = String(input.layoutId);
      const revision = String(input.layoutRevision);
      const effectiveFrom = String(input.effectiveFrom);
      await write.lockOnboarding(tx, 'equipment', ws, equipmentId);
      if (!(await mappingPublish(actor, tx))) throw new MenuActionForbiddenError();
      const scope = await equipmentScope(tx, deps.knowledgeLookup, actor, equipmentId);
      if (!scope) throw invalid({ path: ['equipmentId'], code: 'not_found' });
      // The Baseline is the stored Inventory of an active window of this equipment. An unknown, hidden, staged, replaced or retired window all
      // answer the same `not_active` (no existence leak), and nothing is stored.
      const window = await getWindowRow(tx, ws, equipmentId, windowHashOf(String(input.windowHash)));
      if (!window || window.state !== 'active') throw invalid({ path: ['windowHash'], code: 'not_active' });
      const baseline = checkBaseline(equipmentId, window.inventory, ['windowHash']);
      if (!baseline.ok) throw new Error(`eqv publish: the stored Inventory of window ${window.hash} (${equipmentId}) failed validation`);

      // The action never publishes a draft: the Layout Revision exists already (the Layouts menu publishes it).
      const source = await findRevision(tx, ws, layoutId, revision);
      if (!source) throw invalid({ path: ['layoutRevision'], code: 'not_found' });
      const layout = checkEquipmentLayout(layoutId, source.document, ['layoutRevision']);
      if (!layout.ok) throw invalid(...layout.errors);
      if ((await layoutRevision(layout.layout)) !== revision) throw invalid({ path: ['layoutRevision'], code: 'hash_mismatch' });

      // The rule files that apply to this equipment, in the order global, maker, model, equipment.
      const applicable: MappingScopeRef[] = [
        { level: 'global' },
        { level: 'maker', vendorId: scope.vendorId },
        { level: 'model', vendorId: scope.vendorId, modelId: scope.modelId },
        { level: 'equipment', equipmentId },
      ];
      const ruleFiles: AliasRulesFile[] = [];
      for (const s of applicable) {
        const row = await read.getAliasRulesRow(tx, ws, s);
        if (row) ruleFiles.push(row.document as AliasRulesFile);
      }
      const published = await publishMapping({
        equipmentId,
        maker: scope.vendorId,
        model: scope.modelId,
        ruleFiles,
        aliases: baseline.inventory.aliases.map((a) => a.alias),
        layout: layout.layout,
      });
      // Any issue stores nothing. Mapping Conflicts are not issues and never block (ONBOARDING D9).
      if (!published.ok) throw invalid(...issueErrors(published.issues, ['mapping']));
      const mapping = published.mapping;
      // The rules may have been saved since the author reviewed (#2053): publish only the reviewed Mapping, and say so before any other verdict.
      if (mapping.hash !== input.expectedMappingHash) throw invalid({ path: ['mapping'], code: 'changed' });

      const rows = await read.listBindingRows(tx, ws, equipmentId);
      const toCore = (r: (typeof rows)[number]) => ({
        layoutId: r.layoutId,
        mappingHash: r.mappingHash,
        layoutRevision: r.layoutRevision,
        effectiveFrom: r.effectiveFrom,
        ...(r.effectiveTo === null ? {} : { effectiveTo: r.effectiveTo }),
      });
      const latest = latestBinding(rows.map(toCore));
      if (latest && !(effectiveFrom > latest.effectiveFrom)) throw invalid({ path: ['effectiveFrom'], code: 'not_after_latest' });
      if (latest && latest.mappingHash === mapping.hash && latest.layoutRevision === revision) throw invalid({ path: ['mapping'], code: 'same-as-latest' });

      // Immutable rows: the same hash reuses the stored Mapping Version, and the first Baseline of a hash stays (D5).
      if (!(await read.getMappingVersionRow(tx, ws, equipmentId, mapping.hash))) {
        await write.insertMappingVersion(tx, { workspaceId: ws, equipmentId, layoutId, layoutRevision: revision, hash: mapping.hash, document: mapping, actorId: actor.actor_id });
      }
      if (!(await read.getBaselineRow(tx, ws, equipmentId, mapping.hash))) {
        await write.insertBaseline(tx, { workspaceId: ws, equipmentId, mappingHash: mapping.hash, document: baseline.inventory, windowId: window.id, actorId: actor.actor_id });
      }
      const open = latest && latest.effectiveTo === undefined ? rows.find((r) => r.effectiveFrom === latest.effectiveFrom) : undefined;
      if (open) await write.closeBinding(tx, { workspaceId: ws, id: open.id, effectiveTo: effectiveFrom });
      const binding = await write.insertBinding(tx, {
        workspaceId: ws, equipmentId, layoutId, layoutRevision: revision, mappingHash: mapping.hash, effectiveFrom, actorId: actor.actor_id,
      });

      // The resulting set must pass the core verdict before the transaction can commit.
      const after = [
        ...rows.map((r) => toCore(r.id === open?.id ? { ...r, effectiveTo: effectiveFrom } : r)),
        { layoutId, mappingHash: mapping.hash, layoutRevision: revision, effectiveFrom },
      ];
      const verdict = validateBindings({ schemaVersion: '0.4', equipmentId, bindings: after });
      if (!verdict.ok) throw invalid(...issueErrors(verdict.issues, ['bindings']));

      await recordMappingPublished({
        tx, actor, subjectId: binding.id, equipmentId, mappingHash: mapping.hash, layoutRevision: revision, effectiveFrom, summary: `Mapping published for ${equipmentId}`,
      });
      return { data: { mappingHash: mapping.hash, bindingId: binding.id, version: String(after.length) }, version: String(after.length) };
    },
  };

  return [saveAliasRules, saveTypeDictionary, publish];
}
