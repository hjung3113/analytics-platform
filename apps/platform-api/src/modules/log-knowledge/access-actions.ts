// The object access write actions of the log knowledge hub (#1504 S-a, ADR-0124, design log-knowledge-search §3.4): set the access
// mode of a model / SW version / Item, add and revoke an allow / deny rule. Right: `knowledge.access.manage` (workspace-scoped,
// session-only: ADR-0116 decision 4, a permission grant is never token-callable; Admin holds it through the module bypass, a User
// role is refused by the supported-scope policy). Managing is judged by the capability alone, not by the visibility rule: a manager
// reaches a target they cannot see, otherwise a restricted object with no rule for them could never be reopened. They may grant
// themselves access; every change is audited (ids only) in the same transaction. Grantee = Actor (team / role grantees wait for a
// Core membership read). A rule is revoked, never deleted. The search outbox (#1506) is written by `access-write.ts` in the same transaction.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
  type MenuEndpointDeclaration,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import { holdsPlatformPermission, type PlatformActor } from '../platform-port/permissions.js';
import { findWorkspaceActor } from '../auth/index.js';
import { LOG_KNOWLEDGE_ACCESS_MENU_ID } from './catalog-menu.js';
import { ACCESS_INPUT_KEYS, type AccessOp, parseAccessInput, validateAccessInput } from './domain/access-input.js';
import {
  activeRuleExists,
  insertRule,
  lockRule,
  lockTarget,
  revokeRule,
  setAccessMode,
} from './repositories/access-write.js';

export const ACCESS_PERMISSION = 'knowledge.access.manage';
/** The menu permission the actions declare: bootstrap lists it exactly for the users `ACCESS_PERMISSION` lets write (`platform-port/permissions.ts`). */
export const ACCESS_MENU_PERMISSION = 'knowledge:access-manage';

/** Reads of the same menu that show what an access write changes. The model and item reads sit on other menus and the engine invalidates only within an action's own menu: an accepted limit (their next fetch judges the new rules). */
const INVALIDATES = ['logKnowledge.accessRules'] as const;

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);

/** An action on the access-management menu: `knowledge.access.manage`, Admin through the module bypass. The one judgement for every action there (access rules, search index ops). */
export const accessManageAuthorize = (checkService: CheckService) => async (actor: PlatformActor, tx: Tx): Promise<boolean> =>
  applyAdminModuleBypass(actor.role_level, ACCESS_PERMISSION, await checkService.checkCapability(actor, ACCESS_PERMISSION, { workspace_id: actor.workspace_id }, { tx })).allow;

/** An endpoint on the access-management menu: `platform:view` and the menu permission. */
export const accessMenuAuthorize = (checkService: CheckService): MenuEndpointDeclaration['authorize'] => async (actor, tx) =>
  (await holdsPlatformPermission(checkService, actor, 'platform:view', tx ? { tx } : {})) &&
  (await holdsPlatformPermission(checkService, actor, ACCESS_MENU_PERMISSION, tx ? { tx } : {}));

export function accessActions(deps: { checkService: CheckService }): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = accessManageAuthorize(deps.checkService);

  const record = (tx: Tx, actor: PlatformActor, eventType: 'knowledge.access.mode_changed' | 'knowledge.access.rule_added' | 'knowledge.access.rule_revoked', subjectId: string, detail: Record<string, unknown>) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: eventType,
      subject_type: 'knowledge_access',
      subject_id: subjectId,
      summary: eventType.replace(/\./g, ' ').replace('_', ' '),
      detail,
    });

  const base = (op: AccessOp, concurrency: 'none' | 'version') => ({
    id: `logKnowledge.${op}`,
    menuId: LOG_KNOWLEDGE_ACCESS_MENU_ID,
    inputKeys: ACCESS_INPUT_KEYS[op],
    permission: ACCESS_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  /** The parsed input; `validate` ran before the handler, so a failure here is a bug. */
  function parsed<Op extends AccessOp>(op: Op, input: Record<string, unknown>) {
    const result = parseAccessInput(op, input);
    if (!result.ok) throw new Error(`action ${op}: validate passed but parse failed`);
    return result.value;
  }

  const accessModeSet: MenuActionDeclaration = {
    spec: base('accessModeSet', 'version'),
    authorize,
    validate: (input) => validateAccessInput('accessModeSet', input),
    async currentVersion(tx, actor, input) {
      const value = parsed('accessModeSet', input);
      const target = await lockTarget(tx, actor.workspace_id, value.targetKind, value.targetId);
      return target ? String(target.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('accessModeSet', input);
      const target = await lockTarget(tx, ws, value.targetKind, value.targetId);
      if (!target) throw new Error('action accessModeSet: currentVersion judged not_found first');
      // Same mode: nothing changes, nothing is audited, the current version is answered.
      if (target.accessMode === value.mode) {
        return { data: { targetKind: value.targetKind, targetId: target.id, mode: target.accessMode }, version: String(target.rowVersion) };
      }
      const version = await setAccessMode(tx, ws, actor.actor_id, value.targetKind, target, value.mode);
      await record(tx, actor, 'knowledge.access.mode_changed', target.id, {
        targetKind: value.targetKind,
        targetId: target.id,
        from: target.accessMode,
        to: value.mode,
      });
      return { data: { targetKind: value.targetKind, targetId: target.id, mode: value.mode }, version: String(version) };
    },
  };

  const accessRuleAdd: MenuActionDeclaration = {
    spec: base('accessRuleAdd', 'none'),
    authorize,
    validate: (input) => validateAccessInput('accessRuleAdd', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('accessRuleAdd', input);
      // The target row lock serialises two adds of one target, so the duplicate check below cannot race.
      const target = await lockTarget(tx, ws, value.targetKind, value.targetId);
      const errors: FieldError[] = [];
      if (!target) errors.push({ path: ['targetId'], code: 'not_found' });
      if (!(await findWorkspaceActor(tx, { workspaceId: ws, actorId: value.granteeId }))) errors.push({ path: ['granteeId'], code: 'not_found' });
      if (value.validUntil !== null && value.validUntil.getTime() <= Date.now()) errors.push({ path: ['validUntil'], code: 'past' });
      if (errors.length > 0) throw new MenuActionInvalidError(errors);
      if (await activeRuleExists(tx, ws, value.targetKind, value.targetId, value.granteeId, value.effect)) {
        throw invalid({ path: ['granteeId'], code: 'duplicate' });
      }
      const rule = await insertRule(tx, {
        workspaceId: ws,
        actorId: actor.actor_id,
        kind: value.targetKind,
        targetId: value.targetId,
        granteeId: value.granteeId,
        effect: value.effect,
        validUntil: value.validUntil,
      });
      await record(tx, actor, 'knowledge.access.rule_added', rule.ruleId, {
        ruleId: rule.ruleId,
        targetKind: rule.targetKind,
        targetId: rule.targetId,
        granteeId: rule.granteeId,
        effect: rule.effect,
        expires: rule.validUntil !== null,
      });
      return { data: { ruleId: rule.ruleId }, version: null };
    },
  };

  const accessRuleRevoke: MenuActionDeclaration = {
    spec: base('accessRuleRevoke', 'none'),
    authorize,
    validate: (input) => validateAccessInput('accessRuleRevoke', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const value = parsed('accessRuleRevoke', input);
      const rule = await lockRule(tx, ws, value.ruleId);
      if (!rule) throw invalid({ path: ['ruleId'], code: 'not_found' });
      // Already revoked: nothing changes, nothing is audited.
      if (rule.revokedAt !== null) return { data: { ruleId: rule.ruleId }, version: null };
      await revokeRule(tx, ws, actor.actor_id, rule.ruleId);
      await record(tx, actor, 'knowledge.access.rule_revoked', rule.ruleId, {
        ruleId: rule.ruleId,
        targetKind: rule.targetKind,
        targetId: rule.targetId,
        granteeId: rule.granteeId,
        effect: rule.effect,
      });
      return { data: { ruleId: rule.ruleId }, version: null };
    },
  };

  return [accessModeSet, accessRuleAdd, accessRuleRevoke];
}
