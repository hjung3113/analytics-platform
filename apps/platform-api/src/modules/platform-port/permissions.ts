// Platform permission vocabulary → feature authorization (ADR-0069 decision 7).
//
// The platform's own permissions are a closed list (`KERNEL_PERMISSIONS` in the root
// `packages/sdk/contracts/src/menu.ts`). `PLATFORM_PERMISSION_TABLE` maps every entry to the rule that grants it here;
// `permissions-vocabulary.test.ts` reads the generated `@ap/contracts/vocab.json` (`kernelPermissions`)
// and fails when an entry is missing or listed twice (ADR-0068 "one vocabulary").
//
// The menu permissions of the business modules (a capability grant plus the capability's Admin bypass) are not listed here:
// each module declares them in its `MenuDispatchContribution.permissions` (#1667) and the server hands the registry's
// declarations to `useMenuPermissions`. A new menu permission never edits this file.

import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import type { Capability } from '@ap/feature-shared';
import {
  type CapabilityScope,
  type CheckService,
  type Decision,
  applyAdminModuleBypass,
} from '../permissions/check-service.js';
import type { MenuPermissionDeclaration } from '../menu-dispatch/types.js';

export type PlatformPermissionRule =
  /** Every active session. Not gated on `workspace.read`: `roleSatisfies('developer', …)` is false. */
  | 'every-session'
  /** Role Level developer/admin, or an active grant of a feature working capability. */
  | 'features-access'
  /** `workspace.admin` allowed. */
  | 'workspace-admin';

/** The kernel permissions, in the platform's canonical order. Menu permissions follow, in registration order. */
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

let menuPermissions: readonly MenuPermissionDeclaration[] = [];

/**
 * The menu permissions the modules declared (`MenuDispatchRegistry.permissions`). `buildServer` calls this once the
 * registry is built; the declarations are static per module, so a second server in one process sets the same list.
 */
export function useMenuPermissions(declarations: readonly MenuPermissionDeclaration[]): void {
  menuPermissions = declarations;
}

/** Every permission this port can list, kernel first (canonical order), then the declared menu permissions. */
export function platformPermissionOrder(): string[] {
  return [...PLATFORM_PERMISSION_TABLE.map((e) => e.permission), ...menuPermissions.map((d) => d.permission)];
}

/** The capabilities one permission judgment reads; the batched path loads them for every permission at once. */
function capabilitiesRead(): Capability[] {
  return [
    ...new Set<Capability>([
      'workspace.read',
      'workspace.admin',
      ...FEATURES_ACCESS_CAPABILITIES,
      ...menuPermissions.map((d) => d.capability),
    ]),
  ];
}

/** Where a rule reads its capability decisions from: one call each (`holdsPlatformPermission`) or a preloaded snapshot. */
interface CapabilityReader {
  decision(capability: Capability): Promise<Decision> | Decision;
  scope(capability: Capability): Promise<CapabilityScope>;
}

async function judgeKernelRule(
  actor: PlatformActor,
  rule: PlatformPermissionRule,
  reader: CapabilityReader,
): Promise<boolean> {
  switch (rule) {
    case 'every-session': {
      if (currentAuthContext().kind !== 'token') return true;
      // ADR-0116 deny by default: a token call has no session right. The read right of a token is the
      // `workspace.read` capability: it must be in the token's scopes (checked inside `checkCapability`)
      // and held by the token's actor. Every judgment of a token call thus goes through the capability check.
      return (await reader.decision('workspace.read')).allow;
    }
    case 'workspace-admin':
      return (await reader.decision('workspace.admin')).allow;
    case 'features-access': {
      // A token call has no role shortcut: only the capability scopes below can open it.
      if (currentAuthContext().kind !== 'token' && (actor.role_level === 'developer' || actor.role_level === 'admin')) return true;
      for (const capability of FEATURES_ACCESS_CAPABILITIES) {
        const scope = await reader.scope(capability);
        if (scope.kind === 'all' || scope.managed_system_ids.length > 0) return true;
      }
      return false;
    }
  }
}

/**
 * A declared menu permission: the same decision the module's write actions take — capability check, then the capability's
 * Admin bypass. The User exclusion is the check service's (`NOT_FOR_USER_ROLE`), not repeated here.
 */
async function judgeMenuPermission(
  actor: PlatformActor,
  declaration: MenuPermissionDeclaration,
  reader: CapabilityReader,
): Promise<boolean> {
  return applyAdminModuleBypass(actor.role_level, declaration.capability, await reader.decision(declaration.capability)).allow;
}

/**
 * Whether this actor holds a module's own menu permission, by its capability: the capability check, then the capability's Admin
 * bypass — the decision the module's write actions take. A module judges its own permissions with this, without the registry.
 */
export async function holdsMenuPermission(
  checkService: CheckService,
  actor: PlatformActor,
  capability: Capability,
  options: { tx?: Tx } = {},
): Promise<boolean> {
  return judgeMenuPermission(actor, { permission: capability, capability }, readerOf(checkService, actor, options));
}

const readerOf = (
  checkService: CheckService,
  actor: PlatformActor,
  options: { tx?: Tx } = {},
): CapabilityReader => ({
  decision: (capability) =>
    checkService.checkCapability(actor, capability, { workspace_id: actor.workspace_id }, options),
  scope: (capability) =>
    checkService.capabilityScope(actor, capability, { workspace_id: actor.workspace_id }, options),
});

/**
 * The permissions many actors hold, from one batched read: two statements whatever the number of actors or declared
 * permissions. Results are in canonical order (`platformPermissionOrder`); callers that list them sorted sort them.
 */
export async function resolvePlatformPermissionsBatch(
  checkService: CheckService,
  actors: readonly PlatformActor[],
  options: { tx?: Tx } = {},
): Promise<Map<string, string[]>> {
  const snapshot = await checkService.loadCapabilitySnapshot(actors, capabilitiesRead(), options);
  const out = new Map<string, string[]>();
  for (const actor of actors) {
    const reader: CapabilityReader = {
      decision: (capability) => snapshot.decision(actor, capability),
      scope: (capability) => snapshot.scope(actor, capability),
    };
    const held: string[] = [];
    for (const { permission, rule } of PLATFORM_PERMISSION_TABLE) {
      if (await judgeKernelRule(actor, rule, reader)) held.push(permission);
    }
    for (const declaration of menuPermissions) {
      if (await judgeMenuPermission(actor, declaration, reader)) held.push(declaration.permission);
    }
    out.set(actor.actor_id, held);
  }
  return out;
}

/** Sorted subset of the platform vocabulary this actor holds. */
export async function resolvePlatformPermissions(
  checkService: CheckService,
  actor: PlatformActor,
): Promise<string[]> {
  const held = (await resolvePlatformPermissionsBatch(checkService, [actor])).get(actor.actor_id) ?? [];
  return held.sort();
}

/** Whether this actor holds one permission, by its rule (single source). A permission neither the kernel table nor a module declares — a menu permission of the app — is never held here. */
export async function holdsPlatformPermission(
  checkService: CheckService,
  actor: PlatformActor,
  permission: string,
  options: { tx?: Tx } = {},
): Promise<boolean> {
  const reader = readerOf(checkService, actor, options);
  const entry = PLATFORM_PERMISSION_TABLE.find((e) => e.permission === permission);
  if (entry) return judgeKernelRule(actor, entry.rule, reader);
  const declaration = menuPermissions.find((d) => d.permission === permission);
  return declaration ? judgeMenuPermission(actor, declaration, reader) : false;
}
