// Platform permission vocabulary → feature authorization (ADR-0069 decision 7).
//
// The platform's own permissions are a closed list (`KERNEL_PERMISSIONS` in the root
// `packages/sdk/contracts/src/menu.ts`). This table maps every entry to the rule that grants it here;
// `permissions-vocabulary.test.ts` reads the generated `@ap/contracts/vocab.json` (`kernelPermissions`)
// and fails when an entry is missing or listed twice (ADR-0068 "one vocabulary"). The menu permissions
// an app declares (ADR-0072) are not listed: feature grants none of them.

import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';

export type PlatformPermissionRule =
  /** Every active session. Not gated on `workspace.read`: `roleSatisfies('developer', …)` is false. */
  | 'every-session'
  /** Role Level developer/admin, or an active grant of a feature working capability. */
  | 'features-access'
  /** `workspace.admin` allowed. */
  | 'workspace-admin'
  /** Admin role, or an active workspace grant of `knowledge.catalog.manage` (the write capability of the log knowledge catalog). */
  | 'catalog-manage'
  /** Admin role, or an active workspace grant of `knowledge.item.publish` (the write capability of the log knowledge items). */
  | 'item-publish'
  /** Admin role, or an active workspace grant of `knowledge.spec.publish` (the write capability of the log knowledge model specs). */
  | 'spec-publish'
  /** Admin role, or an active workspace grant of `improvement.manage` (the write capability of the improvement items). */
  | 'improvement-manage'
  /** Admin role, or an active workspace grant of `lifecycle.project.manage` (the write capability of the development projects). */
  | 'lifecycle-project-manage'
  /** Admin role, or an active workspace grant of `lifecycle.round.manage` (the write capability of the validation rounds). */
  | 'lifecycle-round-manage'
  /** Admin role, or an active workspace grant of `lifecycle.gate.decide` (the Gate decision; a human session only, never a token). */
  | 'lifecycle-gate-decide'
  /** Admin role, or an active workspace grant of `knowledge.draft.create` (the write capability of the knowledge drafts; Developer and User may hold it). */
  | 'draft-create'
  /** An active workspace grant of `explorer.investigate` (the write capability of the log explorer investigations); no Admin role bypass (sensitive, #1472). */
  | 'explorer-investigate'
  /** An active workspace grant of `explorer.handoff` (handing evidence locations to a Round or a knowledge draft); no Admin role bypass (sensitive, #1474). */
  | 'explorer-handoff'
  /** Admin role, or an active workspace grant of `dataset.manage` (the write capability of the log test datasets). */
  | 'dataset-manage'
  /** An active workspace grant of `dataset.baseline.approve` (the approval of a log test dataset baseline); no Admin role bypass (sensitive, #1478). */
  | 'dataset-baseline-approve'
  /** Admin role, or an active workspace grant of `dataset.suite.run` (requesting a regression suite run); a User never holds it, even with a live grant (#1479). */
  | 'dataset-suite-run';

export const PLATFORM_PERMISSION_TABLE = [
  { permission: 'platform:view', rule: 'every-session' },
  { permission: 'notice:view', rule: 'every-session' },
  { permission: 'voc:view', rule: 'every-session' },
  { permission: 'console:access', rule: 'workspace-admin' },
  { permission: 'features:access', rule: 'features-access' },
  // Not a kernel permission: the menu permission of the log knowledge catalog management menu (design v0.6 §2.1,
  // #1194 r). The app declares it with `menuPermission`; this entry makes bootstrap list it for exactly the users
  // the catalog write actions accept.
  { permission: 'knowledge:catalog-manage', rule: 'catalog-manage' },
  // Menu permission of the log knowledge item menus (ADR-0109, #1197 w); the item write actions declare it.
  { permission: 'knowledge:item-publish', rule: 'item-publish' },
  // Menu permission of the model spec writes and the draft read (ADR-0111, #1196 b1).
  { permission: 'knowledge:spec-publish', rule: 'spec-publish' },
  // Menu permission of the improvement item writes (#1328 b); the six write actions declare it.
  { permission: 'improvement:manage', rule: 'improvement-manage' },
  // Menu permissions of the log lifecycle writes (#1444 c): project actions and round actions.
  { permission: 'lifecycle:project-manage', rule: 'lifecycle-project-manage' },
  { permission: 'lifecycle:round-manage', rule: 'lifecycle-round-manage' },
  // Menu permission of the Gate decision (#1446 e).
  { permission: 'lifecycle:gate-decide', rule: 'lifecycle-gate-decide' },
  // Menu permission of the knowledge draft writes (#1198 a); the four draft actions declare it.
  { permission: 'knowledge:draft-create', rule: 'draft-create' },
  // Menu permission of the log explorer investigation writes (#1468 b); the five investigation actions declare it.
  { permission: 'explorer:investigate', rule: 'explorer-investigate' },
  // Menu permission of the evidence-location handoff (#1474 X-h); the `logExplorer.evidenceHandoff` action declares it.
  { permission: 'explorer:handoff', rule: 'explorer-handoff' },
  // Menu permission of the log test dataset writes (#1477 D-a).
  { permission: 'dataset:manage', rule: 'dataset-manage' },
  // Menu permission of the log test dataset baseline approval (#1478 D-b); the approve action declares it.
  { permission: 'dataset:baseline-approve', rule: 'dataset-baseline-approve' },
  // Menu permission of the regression suite run (#1479 D-c); the suiteRun action declares it.
  { permission: 'dataset:suite-run', rule: 'dataset-suite-run' },
] as const satisfies ReadonlyArray<{ permission: string; rule: PlatformPermissionRule }>;

/** Capabilities whose active grant (workspace or Managed-System scoped) opens `features:access`. */
export const FEATURES_ACCESS_CAPABILITIES = [
  'voc.triage',
  'finding.read',
  'survey.manage',
] as const;

export interface PlatformActor {
  actor_id: string;
  workspace_id: string;
  role_level: string;
}

/** Sorted subset of the platform vocabulary this actor holds. */
export async function resolvePlatformPermissions(
  checkService: CheckService,
  actor: PlatformActor,
): Promise<string[]> {
  const held: string[] = [];
  for (const { permission, rule } of PLATFORM_PERMISSION_TABLE) {
    if (await holds(checkService, actor, rule)) held.push(permission);
  }
  return held.sort();
}

/** Whether this actor holds one permission, by the table's rule (single source). A permission the table does not list — a menu permission of the app — is never held here. */
export async function holdsPlatformPermission(
  checkService: CheckService,
  actor: PlatformActor,
  permission: string,
  options: { tx?: Tx } = {},
): Promise<boolean> {
  const entry = PLATFORM_PERMISSION_TABLE.find((e) => e.permission === permission);
  return entry ? holds(checkService, actor, entry.rule, options) : false;
}

async function holds(
  checkService: CheckService,
  actor: PlatformActor,
  rule: PlatformPermissionRule,
  options: { tx?: Tx } = {},
): Promise<boolean> {
  switch (rule) {
    case 'every-session': {
      if (currentAuthContext().kind !== 'token') return true;
      // ADR-0116 deny by default: a token call has no session right. The read right of a token is the
      // `workspace.read` capability: it must be in the token's scopes (checked inside `checkCapability`)
      // and held by the token's actor. Every judgment of a token call thus goes through the capability check.
      const decision = await checkService.checkCapability(
        actor,
        'workspace.read',
        { workspace_id: actor.workspace_id },
        options,
      );
      return decision.allow;
    }
    case 'workspace-admin': {
      const decision = await checkService.checkCapability(
        actor,
        'workspace.admin',
        {
          workspace_id: actor.workspace_id,
        },
        options,
      );
      return decision.allow;
    }
    case 'catalog-manage': {
      // The same decision the write actions take (`catalog-actions.ts`): capability check, then the module's Admin bypass.
      const decision = await checkService.checkCapability(
        actor,
        'knowledge.catalog.manage',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'knowledge.catalog.manage', decision).allow;
    }
    case 'item-publish': {
      // The same decision the item write actions take (`item-actions.ts`): capability check, then the module's Admin bypass.
      const decision = await checkService.checkCapability(
        actor,
        'knowledge.item.publish',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'knowledge.item.publish', decision).allow;
    }
    case 'spec-publish': {
      // The same decision the spec write actions take (`spec-actions.ts`): capability check, then the module's Admin bypass.
      const decision = await checkService.checkCapability(
        actor,
        'knowledge.spec.publish',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'knowledge.spec.publish', decision).allow;
    }
    case 'improvement-manage': {
      // The same decision the improvement write actions take (`improvement-items/item-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'improvement.manage',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'improvement.manage', decision).allow;
    }
    case 'lifecycle-project-manage': {
      // The same decision the project write actions take (`log-lifecycle/project-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'lifecycle.project.manage',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'lifecycle.project.manage', decision).allow;
    }
    case 'lifecycle-round-manage': {
      // The same decision the round write actions take (`log-lifecycle/round-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'lifecycle.round.manage',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'lifecycle.round.manage', decision).allow;
    }
    case 'lifecycle-gate-decide': {
      // The same decision the Gate action takes (`log-lifecycle/gate-actions.ts`); a token call is refused inside checkCapability (session-only).
      const decision = await checkService.checkCapability(
        actor,
        'lifecycle.gate.decide',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'lifecycle.gate.decide', decision).allow;
    }
    case 'draft-create': {
      // The same decision the draft write actions take (`log-knowledge/draft-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'knowledge.draft.create',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'knowledge.draft.create', decision).allow;
    }
    case 'explorer-investigate': {
      // The same decision the investigation write actions take (`log-explorer/investigation-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'explorer.investigate',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'explorer.investigate', decision).allow;
    }
    case 'explorer-handoff': {
      // The same decision the handoff action takes (`log-explorer/handoff-action.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'explorer.handoff',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'explorer.handoff', decision).allow;
    }
    case 'dataset-manage': {
      // The same decision the dataset write actions take (`log-datasets/dataset-actions.ts`).
      const decision = await checkService.checkCapability(
        actor,
        'dataset.manage',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'dataset.manage', decision).allow;
    }
    case 'dataset-baseline-approve': {
      // The same decision the baseline approve action takes (`log-datasets/baseline-actions.ts`): a User never holds it, even with a live grant.
      if (actor.role_level === 'user') return false;
      const decision = await checkService.checkCapability(
        actor,
        'dataset.baseline.approve',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'dataset.baseline.approve', decision).allow;
    }
    case 'dataset-suite-run': {
      // The same decision the suiteRun action takes (`log-datasets/suite-actions.ts`): a User never holds it, even with a live grant.
      if (actor.role_level === 'user') return false;
      const decision = await checkService.checkCapability(
        actor,
        'dataset.suite.run',
        { workspace_id: actor.workspace_id },
        options,
      );
      return applyAdminModuleBypass(actor.role_level, 'dataset.suite.run', decision).allow;
    }
    case 'features-access': {
      // A token call has no role shortcut: only the capability scopes below can open it.
      if (currentAuthContext().kind !== 'token' && (actor.role_level === 'developer' || actor.role_level === 'admin')) return true;
      for (const capability of FEATURES_ACCESS_CAPABILITIES) {
        const scope = await checkService.capabilityScope(
          actor,
          capability,
          { workspace_id: actor.workspace_id },
          options,
        );
        if (scope.kind === 'all' || scope.managed_system_ids.length > 0) return true;
      }
      return false;
    }
  }
}
