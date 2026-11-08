// The SW change actions of the model spec (#1196 c, design v0.6 §15.2): add a change row, retire one (optionally with a
// replacement) and confirm a flagged one. Same right as the spec writes (`knowledge.spec.publish`, no new capability).
// Rules: the workspace is the actor's; the table is append-only for the runtime role; `based_on_rev_no` is the CURRENT
// published revision at write time (server-set); each write is one transaction with one body-free audit row (subject
// type `knowledge_model_spec`, subject id = the change id). Concurrency: add takes the model advisory lock before it
// reads the latest published revision; retire/confirm read the row's model unlocked, take the lock, then lock the row.

import { MenuActionInvalidError, type ActionHandlerResult, type FieldError, type MenuActionDeclaration } from '../menu-dispatch/types.js';
import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import {
  type ChangeFields,
  SPEC_CHANGES_OPEN_MAX,
  parseSpecChangeAdd,
  parseSpecChangeConfirm,
  parseSpecChangeRetire,
  validateSpecChange,
} from './domain/spec-change-input.js';
import { targetKeysOf } from './domain/spec-diff.js';
import { rangesOverlap } from './domain/spec-range.js';
import { buildTargetKey } from './domain/spec-target-key.js';
import {
  changeModelId,
  confirmChange,
  countOpen,
  currentPublished,
  insertChange,
  lockChange,
  lockModelChanges,
  modelExists,
  openRangesForKey,
  retireChange,
  softwareOrders,
} from './repositories/spec-change.js';
import { loadHashRows } from './repositories/spec-write.js';
import { SPEC_MENU_PERMISSION, SPEC_PERMISSION } from './spec-actions.js';

const INVALIDATES = ['logKnowledge.specChanges', 'logKnowledge.modelSpec', 'logKnowledge.specCoverage'] as const;
const INPUT_KEYS = {
  specChangeAdd: ['modelId', 'softwareId', 'endsBeforeSoftwareId', 'targetKind', 'target', 'changeKind', 'change', 'note', 'evidenceRef'],
  specChangeRetire: ['changeId', 'replacement'],
  specChangeConfirm: ['changeId'],
} as const;

export interface SpecChangeActionDeps {
  checkService: CheckService;
}

type AuditType = 'change_added' | 'change_retired' | 'change_confirmed';

export function specChangeActions(deps: SpecChangeActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      SPEC_PERMISSION,
      await deps.checkService.checkCapability(actor, SPEC_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;

  const record = (tx: Tx, actor: PlatformActor, type: AuditType, changeId: string, detail: Record<string, unknown>) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.spec.${type}`,
      subject_type: 'knowledge_model_spec',
      subject_id: changeId,
      summary: `model spec ${type.replace('_', ' ')}`,
      detail,
    });

  const base = (op: keyof typeof INPUT_KEYS, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.${op}`,
    menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
    inputKeys: INPUT_KEYS[op],
    permission: SPEC_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  /**
   * Judges and inserts one change against the model's CURRENT published revision. The caller holds the model lock.
   * `excludeId` is the row a replacement retires: it neither overlaps nor counts toward the cap.
   */
  async function writeChange(
    tx: Tx,
    actor: PlatformActor,
    modelId: string,
    fields: ChangeFields & { softwareId: string; endsBeforeSoftwareId: string | null },
    prefix: readonly string[],
    excludeId: string | null,
  ): Promise<{ changeId: string; basedOnRevNo: number }> {
    const ws = actor.workspace_id;
    const at = (name: string) => [...prefix, name];
    const refuse = (path: string[], code: string): never => {
      throw new MenuActionInvalidError([{ path, code }]);
    };
    const published = await currentPublished(tx, ws, modelId);
    if (!published) return refuse(at('revision'), 'none_published');

    const ids = [fields.softwareId, ...(fields.endsBeforeSoftwareId ? [fields.endsBeforeSoftwareId] : [])];
    const orders = await softwareOrders(tx, ws, modelId, ids);
    const start = orders.get(fields.softwareId);
    const errors: FieldError[] = [];
    if (start === undefined) errors.push({ path: at('softwareId'), code: 'not_found' });
    let end: number | null = null;
    if (fields.endsBeforeSoftwareId) {
      const e = orders.get(fields.endsBeforeSoftwareId);
      if (e === undefined) errors.push({ path: at('endsBeforeSoftwareId'), code: 'not_found' });
      else if (start !== undefined && e <= start) errors.push({ path: at('endsBeforeSoftwareId'), code: 'not_after_start' });
      else end = e;
    }
    if (errors.length > 0 || start === undefined) throw new MenuActionInvalidError(errors);

    const keys = targetKeysOf(await loadHashRows(tx, ws, published.id));
    const { target } = fields;
    const exists = keys[fields.targetKind].has(fields.targetKey);
    if (fields.changeKind === 'added') {
      if (exists) return refuse(at('targetKey'), 'already_exists');
      // A new child needs its parent in the published revision.
      const ev = (module: string, event: string) => keys.event.has(buildTargetKey({ kind: 'event', module, event }));
      const parentOk =
        target.kind === 'module' ||
        (target.kind === 'event' && keys.module.has(buildTargetKey({ kind: 'module', module: target.module }))) ||
        (target.kind === 'field' && ev(target.module, target.event)) ||
        (target.kind === 'relation' && ev(target.sourceModule, target.sourceEvent) && ev(target.targetModule, target.targetEvent));
      if (!parentOk) return refuse(at('targetKey'), 'not_found');
    } else if (!exists) {
      return refuse(at('targetKey'), 'not_found');
    }

    const mine = { start, endBefore: end };
    const others = await openRangesForKey(tx, ws, modelId, fields.targetKey, excludeId);
    if (others.some((o) => rangesOverlap(o, mine))) return refuse(at('range'), 'overlap');
    if ((await countOpen(tx, ws, modelId)) - (excludeId ? 1 : 0) >= SPEC_CHANGES_OPEN_MAX) return refuse(at('changes'), 'too_many');

    const changeId = await insertChange(tx, {
      workspaceId: ws,
      actorId: actor.actor_id,
      modelId,
      softwareId: fields.softwareId,
      endsBeforeSoftwareId: fields.endsBeforeSoftwareId,
      targetKind: fields.targetKind,
      targetKey: fields.targetKey,
      changeKind: fields.changeKind,
      change: fields.change,
      note: fields.note,
      basedOnRevNo: published.revisionNo,
      evidenceRef: fields.evidenceRef,
    });
    return { changeId, basedOnRevNo: published.revisionNo };
  }

  const auditAdded = (tx: Tx, actor: PlatformActor, changeId: string, modelId: string, f: ChangeFields & { softwareId: string; endsBeforeSoftwareId: string | null }, basedOnRevNo: number, replacesChangeId?: string) =>
    record(tx, actor, 'change_added', changeId, {
      modelId,
      changeId,
      softwareId: f.softwareId,
      endsBeforeSoftwareId: f.endsBeforeSoftwareId,
      targetKind: f.targetKind,
      changeKind: f.changeKind,
      basedOnRevNo,
      ...(replacesChangeId ? { replacesChangeId } : {}),
    });

  const specChangeAdd: MenuActionDeclaration = {
    spec: base('specChangeAdd', 'none'),
    authorize,
    validate: (input) => validateSpecChange('specChangeAdd', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const parsed = parseSpecChangeAdd(input);
      if (!parsed.ok) throw new Error('action specChangeAdd: validate passed but parse failed');
      const value = parsed.value;
      await lockModelChanges(tx, actor.workspace_id, value.modelId);
      if (!(await modelExists(tx, actor.workspace_id, value.modelId))) {
        throw new MenuActionInvalidError([{ path: ['modelId'], code: 'not_found' }]);
      }
      const { changeId, basedOnRevNo } = await writeChange(tx, actor, value.modelId, value, [], null);
      await auditAdded(tx, actor, changeId, value.modelId, value, basedOnRevNo);
      return { data: { changeId }, version: null };
    },
  };

  /** Model lock first, then the row; the row is re-read locked, and an unknown row is `null` (not_found). */
  const lockedVersion = async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const ws = actor.workspace_id;
    const changeId = input.changeId as string;
    const modelId = await changeModelId(tx, ws, changeId);
    if (!modelId) return null;
    await lockModelChanges(tx, ws, modelId);
    const row = await lockChange(tx, ws, changeId);
    return row ? String(row.rowVersion) : null;
  };

  const specChangeRetire: MenuActionDeclaration = {
    spec: base('specChangeRetire', 'version'),
    authorize,
    validate: (input) => validateSpecChange('specChangeRetire', input),
    currentVersion: lockedVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseSpecChangeRetire(input);
      if (!parsed.ok) throw new Error('action specChangeRetire: validate passed but parse failed');
      const { changeId, replacement } = parsed.value;
      const row = await lockChange(tx, ws, changeId);
      if (!row) throw new MenuActionInvalidError([{ path: ['changeId'], code: 'not_found' }]);
      if (row.retiredAt !== null) throw new MenuActionInvalidError([{ path: ['change'], code: 'already_retired' }]);
      let replacementId: string | null = null;
      if (replacement) {
        if (replacement.targetKind !== row.targetKind || replacement.targetKey !== row.targetKey) {
          throw new MenuActionInvalidError([{ path: ['replacement'], code: 'target_mismatch' }]);
        }
        // The new row first (it must not collide with the old one: `excludeId`), then the old one is retired.
        const written = await writeChange(tx, actor, row.modelId, replacement, ['replacement'], row.id);
        replacementId = written.changeId;
        await auditAdded(tx, actor, written.changeId, row.modelId, replacement, written.basedOnRevNo, row.id);
      }
      const version = await retireChange(tx, ws, row, actor.actor_id, replacementId);
      await record(tx, actor, 'change_retired', row.id, {
        modelId: row.modelId,
        changeId: row.id,
        ...(replacementId ? { replacementChangeId: replacementId } : {}),
      });
      return { data: { changeId: row.id, ...(replacementId ? { replacementChangeId: replacementId } : {}) }, version: String(version) };
    },
  };

  const specChangeConfirm: MenuActionDeclaration = {
    spec: base('specChangeConfirm', 'version'),
    authorize,
    validate: (input) => validateSpecChange('specChangeConfirm', input),
    currentVersion: lockedVersion,
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseSpecChangeConfirm(input);
      if (!parsed.ok) throw new Error('action specChangeConfirm: validate passed but parse failed');
      const row = await lockChange(tx, ws, parsed.value.changeId);
      if (!row) throw new MenuActionInvalidError([{ path: ['changeId'], code: 'not_found' }]);
      if (!row.needsRevalidation) throw new MenuActionInvalidError([{ path: ['needsRevalidation'], code: 'not_set' }]);
      const version = await confirmChange(tx, ws, row);
      await record(tx, actor, 'change_confirmed', row.id, {
        modelId: row.modelId,
        changeId: row.id,
        ...(row.revalidationRevNo === null ? {} : { revalidationRevNo: row.revalidationRevNo }),
      });
      return { data: { changeId: row.id }, version: String(version) };
    },
  };

  return [specChangeAdd, specChangeRetire, specChangeConfirm];
}
