// Platform permission vocabulary → feature authorization (platform ADR-0069 decision 7).
//
// The platform's own permissions are a closed list (`KERNEL_PERMISSIONS` in the root
// `packages/sdk/contracts/src/menu.ts`). `PLATFORM_PERMISSION_TABLE` maps every entry to the rule that grants it here;
// `permissions-vocabulary.test.ts` reads the generated `@ap/contracts/vocab.json` (`kernelPermissions`)
// and fails when an entry is missing or listed twice (platform ADR-0068 "one vocabulary").
//
// The menu permissions of the business modules (a capability grant plus the capability's Admin bypass) are not listed here:
// each module declares them in its `MenuDispatchContribution.permissions` (#1667) and the server hands the registry's
// declarations to a per-server `createPlatformPermissionResolver`. A new menu permission never edits this file.

import type { Tx } from '../../db/tx.js';
import { currentAuthContext } from '../../lib/auth-context.js';
import type { CapabilityName } from '@ap/feature-shared';
import {
  type CapabilityScope,
  type CheckService,
  type Decision,
  applyAdminModuleBypass,
  capabilitiesOf,
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

/**
 * The platform permissions one server resolves: the kernel table plus the menu permissions that server's modules declared
 * (`MenuDispatchRegistry.permissions`, #1667). The declarations belong to the instance — an immutable copy — so two
 * servers in one process, built with different contributions, never read each other's rules.
 */
export interface PlatformPermissionResolver {
  /** Every permission this resolver can list, kernel first (canonical order), then the declared menu permissions. */
  order(): string[];
  /** The permissions many actors hold, from one batched read (see `resolvePlatformPermissionsBatch`). */
  resolveBatch(
    checkService: CheckService,
    actors: readonly PlatformActor[],
    options?: { tx?: Tx },
  ): Promise<Map<string, string[]>>;
  /** Sorted subset of the vocabulary this actor holds. */
  resolve(checkService: CheckService, actor: PlatformActor, options?: { auditTokenDenials?: boolean }): Promise<string[]>;
  /** Whether this actor holds one permission, kernel or declared. */
  holds(checkService: CheckService, actor: PlatformActor, permission: string, options?: { tx?: Tx }): Promise<boolean>;
}

/**
 * `declarations` may be bound later with `use` (once), after `buildServer` assembles the menu registry.
 * The port routes only resolve at request time. Until `use` is called only the kernel table applies.
 */
export function createPlatformPermissionResolver(
  declarations: readonly MenuPermissionDeclaration[] = [],
): PlatformPermissionResolver & { use(declarations: readonly MenuPermissionDeclaration[]): void } {
  let menu: readonly MenuPermissionDeclaration[] = Object.freeze(declarations.map((d) => Object.freeze({ ...d })));
  let bound = declarations.length > 0;
  const self = {
    use(next: readonly MenuPermissionDeclaration[]): void {
      if (bound) throw new Error('platform permission resolver: menu permissions are already bound');
      menu = Object.freeze(next.map((d) => Object.freeze({ ...d })));
      bound = true;
    },
    order: () => [...PLATFORM_PERMISSION_TABLE.map((e) => e.permission), ...menu.map((d) => d.permission)],
    resolveBatch: (checkService: CheckService, actors: readonly PlatformActor[], options: { tx?: Tx } = {}) =>
      resolveBatchWith(menu, checkService, actors, options),
    resolve: async (checkService: CheckService, actor: PlatformActor, options: { auditTokenDenials?: boolean } = {}) =>
      ((await resolveBatchWith(menu, checkService, [actor], options)).get(actor.actor_id) ?? []).sort(),
    holds: (checkService: CheckService, actor: PlatformActor, permission: string, options: { tx?: Tx } = {}) =>
      holdsPlatformPermission(checkService, actor, permission, { ...options, menuPermissions: menu }),
  };
  return self;
}

/** The capabilities one permission judgment reads; the batched path loads them for every permission at once. */
function capabilitiesRead(menu: readonly MenuPermissionDeclaration[]): CapabilityName[] {
  return [
    ...new Set<CapabilityName>([
      'workspace.read',
      'workspace.admin',
      ...FEATURES_ACCESS_CAPABILITIES,
      ...menu.map((d) => d.capability),
    ]),
  ];
}

/** Where a rule reads its capability decisions from: one call each (`holdsPlatformPermission`) or a preloaded snapshot. */
interface CapabilityReader {
  decision(capability: CapabilityName): Promise<Decision> | Decision;
  scope(capability: CapabilityName): Promise<CapabilityScope>;
  /** Bypass against the registry the decisions came from (ADR-0157: a declared capability's meta lives only there). */
  bypass(roleLevel: string, capability: CapabilityName, decision: Decision): Decision;
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
 * Admin bypass. The Role Level exclusion is the check service's (`NOT_FOR_USER_ROLE`, a declared capability's allow-list),
 * not repeated here. Every meta is the server's registry's (ADR-0157 decision 7).
 */
async function judgeMenuPermission(
  actor: PlatformActor,
  declaration: MenuPermissionDeclaration,
  reader: CapabilityReader,
): Promise<boolean> {
  return reader.bypass(actor.role_level, declaration.capability, await reader.decision(declaration.capability)).allow;
}

/**
 * Whether this actor holds a module's own menu permission, by its capability: the capability check, then the capability's Admin
 * bypass — the decision the module's write actions take. A module judges its own permissions with this, without the registry.
 */
export async function holdsMenuPermission(
  checkService: CheckService,
  actor: PlatformActor,
  capability: CapabilityName,
  options: { tx?: Tx } = {},
): Promise<boolean> {
  return judgeMenuPermission(actor, { permission: capability, capability }, readerOf(checkService, actor, options));
}

const bypassOf = (checkService: CheckService) => {
  const capabilities = capabilitiesOf(checkService);
  return (roleLevel: string, capability: CapabilityName, decision: Decision) =>
    applyAdminModuleBypass(roleLevel, capability, decision, capabilities);
};

const readerOf = (
  checkService: CheckService,
  actor: PlatformActor,
  options: { tx?: Tx } = {},
): CapabilityReader => ({
  decision: (capability) =>
    checkService.checkCapability(actor, capability, { workspace_id: actor.workspace_id }, options),
  scope: (capability) =>
    checkService.capabilityScope(actor, capability, { workspace_id: actor.workspace_id }, options),
  bypass: bypassOf(checkService),
});

/**
 * The permissions many actors hold, from one batched read: two permission-row statements whatever the number of actors or
 * declared permissions, plus at most one workspace Managed System lookup (when a deny on a Managed System needs the
 * workspace's system list). Results are in canonical order (`order`); callers that list them sorted sort them.
 */
async function resolveBatchWith(
  menu: readonly MenuPermissionDeclaration[],
  checkService: CheckService,
  actors: readonly PlatformActor[],
  options: { tx?: Tx; auditTokenDenials?: boolean } = {},
): Promise<Map<string, string[]>> {
  const snapshot = await checkService.loadCapabilitySnapshot(actors, capabilitiesRead(menu), options);
  const out = new Map<string, string[]>();
  const bypass = bypassOf(checkService);
  for (const actor of actors) {
    const reader: CapabilityReader = {
      decision: (capability) => snapshot.decision(actor, capability),
      scope: (capability) => snapshot.scope(actor, capability),
      bypass,
    };
    const held: string[] = [];
    for (const { permission, rule } of PLATFORM_PERMISSION_TABLE) {
      if (await judgeKernelRule(actor, rule, reader)) held.push(permission);
    }
    for (const declaration of menu) {
      if (await judgeMenuPermission(actor, declaration, reader)) held.push(declaration.permission);
    }
    out.set(actor.actor_id, held);
  }
  return out;
}

/**
 * Whether this actor holds one permission, by its rule (single source). The kernel table always applies; a menu permission
 * resolves only against the `menuPermissions` the caller passes (a server's resolver does: `PlatformPermissionResolver.holds`).
 * A permission neither names — a menu permission of the app — is never held here.
 */
export async function holdsPlatformPermission(
  checkService: CheckService,
  actor: PlatformActor,
  permission: string,
  options: { tx?: Tx; menuPermissions?: readonly MenuPermissionDeclaration[] } = {},
): Promise<boolean> {
  const { menuPermissions, ...readOptions } = options;
  const reader = readerOf(checkService, actor, readOptions);
  const entry = PLATFORM_PERMISSION_TABLE.find((e) => e.permission === permission);
  if (entry) return judgeKernelRule(actor, entry.rule, reader);
  const declaration = menuPermissions?.find((d) => d.permission === permission);
  return declaration ? judgeMenuPermission(actor, declaration, reader) : false;
}
