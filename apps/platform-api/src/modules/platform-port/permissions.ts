// Platform permission vocabulary → FeedbackOps authorization (ADR-0069 decision 7).
//
// The platform's own permissions are a closed list (`KERNEL_PERMISSIONS` in the root
// `packages/sdk/contracts/src/menu.ts`). This table maps every entry to the rule that grants it here;
// `permissions-vocabulary.test.ts` reads the generated `@ap/contracts/vocab.json` (`kernelPermissions`)
// and fails when an entry is missing or listed twice (ADR-0068 "one vocabulary"). The menu permissions
// an app declares (ADR-0072) are not listed: FeedbackOps grants none of them.

import type { CheckService } from '../permissions/check-service.js';

export type PlatformPermissionRule =
  /** Every active session. Not gated on `workspace.read`: `roleSatisfies('developer', …)` is false. */
  | 'every-session'
  /** Role Level developer/admin, or an active grant of a FeedbackOps working capability. */
  | 'features-access'
  /** `workspace.admin` allowed. */
  | 'workspace-admin';

export const PLATFORM_PERMISSION_TABLE = [
  { permission: 'platform:view', rule: 'every-session' },
  { permission: 'notice:view', rule: 'every-session' },
  { permission: 'voc:view', rule: 'every-session' },
  { permission: 'console:access', rule: 'workspace-admin' },
  { permission: 'features:access', rule: 'features-access' },
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
): Promise<boolean> {
  const entry = PLATFORM_PERMISSION_TABLE.find((e) => e.permission === permission);
  return entry ? holds(checkService, actor, entry.rule) : false;
}

async function holds(
  checkService: CheckService,
  actor: PlatformActor,
  rule: PlatformPermissionRule,
): Promise<boolean> {
  switch (rule) {
    case 'every-session':
      return true;
    case 'workspace-admin': {
      const decision = await checkService.checkCapability(actor, 'workspace.admin', {
        workspace_id: actor.workspace_id,
      });
      return decision.allow;
    }
    case 'features-access': {
      if (actor.role_level === 'developer' || actor.role_level === 'admin') return true;
      for (const capability of FEATURES_ACCESS_CAPABILITIES) {
        const scope = await checkService.capabilityScope(actor, capability, {
          workspace_id: actor.workspace_id,
        });
        if (scope.kind === 'all' || scope.managed_system_ids.length > 0) return true;
      }
      return false;
    }
  }
}
