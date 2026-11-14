// The capability vocabulary of one server: the platform capabilities ∪ the capabilities its declaration bundle declares
// (ADR-0157 decision 7). Every capability-meta question (sensitive, Admin bypass, session/token-only, who may hold it,
// whether it is ordinarily requestable) is answered here, once; a name the registry does not hold throws
// (`UnknownCapabilityError`), so a declared capability never falls through a hand list's «unknown → open» branch.
//
// The registry belongs to the server instance, like `createPlatformPermissionResolver`: two servers in one process built
// from different bundles never read each other's declarations, and no `@ap/feature-shared` constant is mutated.

import {
  CAPABILITIES,
  CAPABILITY_META,
  type AdminModuleBypass,
  type Capability,
  type CapabilityName,
  type DeclaredCapabilityId,
  ROLE_LEVEL_VALUES,
  type RoleLevel,
  TOKEN_ONLY_SCOPES,
  isCapability,
  isDeclaredCapabilityId,
} from '@ap/feature-shared';

import { NOT_FOR_USER_ROLE, isOrdinarilyRequestable } from './supported-scope-policy.js';

/** A declared capability after the bundle defaults are applied (ADR-0157 decision 2). */
export interface DeclaredCapability {
  readonly id: DeclaredCapabilityId;
  readonly displayName: string;
  readonly sensitive: boolean;
  readonly adminModuleBypass: AdminModuleBypass;
  readonly sessionOnly: boolean;
  /** Allow-list: a Role Level not listed may never request, receive or exercise the capability. */
  readonly roleLevels: readonly RoleLevel[];
}

/** A bundle `capabilities` row as written: only `id` is required; every omitted field takes the closed default. */
export interface DeclaredCapabilityInput {
  id: string;
  displayName?: string | undefined;
  sensitive?: boolean | undefined;
  adminModuleBypass?: AdminModuleBypass | undefined;
  sessionOnly?: boolean | undefined;
  roleLevels?: readonly RoleLevel[] | undefined;
}

/** ADR-0157 decision 2: the closed defaults of a declared capability. */
export const DECLARED_CAPABILITY_DEFAULTS = {
  sensitive: true,
  adminModuleBypass: 'none',
  sessionOnly: true,
  roleLevels: ['admin', 'developer'],
} as const satisfies Omit<DeclaredCapability, 'id' | 'displayName'>;

export interface CapabilityMetaView {
  sensitive: boolean;
  adminModuleBypass: AdminModuleBypass;
  sessionOnly: boolean;
  tokenOnly: boolean;
  declared: boolean;
}

export class UnknownCapabilityError extends Error {
  constructor(readonly capability: string) {
    super(`capability ${capability} is not in this server's registry`);
    this.name = 'UnknownCapabilityError';
  }
}

export interface CapabilityRegistry {
  /** True for a platform capability and for a capability this server's bundle declares. */
  has(name: string): name is CapabilityName;
  /** True only for a declared capability of this server. */
  isDeclared(name: string): name is DeclaredCapabilityId;
  /** The meta of a registered name; throws `UnknownCapabilityError` otherwise. Read at judgment time, never stored. */
  meta(name: string): CapabilityMetaView;
  /**
   * True when a holder of this Role Level may never exercise the capability, whatever grant rows exist. Platform: the
   * User exclusion list (ADR-0107). Declared: every Role Level outside the allow-list (ADR-0157 decision 6). Throws on an
   * unregistered name.
   */
  excludesRole(name: string, roleLevel: string): boolean;
  /** Whether a member may file an ordinary request (`workspace.admin` and `scope.read` are not). Throws on an unregistered name. */
  isOrdinarilyRequestable(name: string): boolean;
  /** The declared row, or undefined for a platform or unknown name. */
  declared(name: string): DeclaredCapability | undefined;
  /** Every declared capability, in bundle order. */
  declaredList(): readonly DeclaredCapability[];
  /** Platform capabilities (canonical order), then the declared ones. */
  names(): readonly CapabilityName[];
}

/** Problems of the declared rows (ADR-0157 decisions 1–3); an empty list means the rows are valid. */
export function declaredCapabilityProblems(rows: readonly DeclaredCapabilityInput[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.id, (seen.get(row.id) ?? 0) + 1);
  for (const [id, count] of seen) if (count > 1) problems.push(`capability ${id}: declared ${count} times`);
  for (const row of rows) {
    if (isCapability(row.id)) {
      problems.push(`capability ${row.id}: is a platform capability; a bundle neither overrides nor extends one`);
      continue;
    }
    if ((TOKEN_ONLY_SCOPES as readonly string[]).includes(row.id)) {
      problems.push(`capability ${row.id}: is a token-only scope name`);
      continue;
    }
    if (!isDeclaredCapabilityId(row.id)) {
      problems.push(`capability ${row.id}: must match ext.<segment>.<segment> (lower-case letters, digits, _; at most 64 characters)`);
      continue;
    }
    const roleLevels = row.roleLevels ?? DECLARED_CAPABILITY_DEFAULTS.roleLevels;
    if (roleLevels.length === 0) problems.push(`capability ${row.id}: roleLevels must name at least one Role Level`);
    for (const level of roleLevels) {
      if (!(ROLE_LEVEL_VALUES as readonly string[]).includes(level)) problems.push(`capability ${row.id}: unknown Role Level ${level}`);
    }
    if (new Set(roleLevels).size !== roleLevels.length) problems.push(`capability ${row.id}: roleLevels must not contain duplicates`);
    const bypass = row.adminModuleBypass ?? DECLARED_CAPABILITY_DEFAULTS.adminModuleBypass;
    if (bypass !== 'none' && !roleLevels.includes('admin')) {
      problems.push(`capability ${row.id}: adminModuleBypass ${bypass} requires admin in roleLevels`);
    }
  }
  return problems;
}

/** Applies the closed defaults (ADR-0157 decision 2). The rows must already be valid. */
export function withDeclaredDefaults(row: DeclaredCapabilityInput): DeclaredCapability {
  return Object.freeze({
    id: row.id as DeclaredCapabilityId,
    displayName: row.displayName ?? row.id,
    sensitive: row.sensitive ?? DECLARED_CAPABILITY_DEFAULTS.sensitive,
    adminModuleBypass: row.adminModuleBypass ?? DECLARED_CAPABILITY_DEFAULTS.adminModuleBypass,
    sessionOnly: row.sessionOnly ?? DECLARED_CAPABILITY_DEFAULTS.sessionOnly,
    roleLevels: Object.freeze([...(row.roleLevels ?? DECLARED_CAPABILITY_DEFAULTS.roleLevels)]),
  });
}

/** True when a declared capability relaxes at least one closed default (ADR-0157 decision 10 boot log counts these). */
export function relaxesDefaults(capability: DeclaredCapability): boolean {
  return (
    !capability.sensitive ||
    capability.adminModuleBypass !== 'none' ||
    !capability.sessionOnly ||
    capability.roleLevels.some((level) => !(DECLARED_CAPABILITY_DEFAULTS.roleLevels as readonly string[]).includes(level))
  );
}

/** Builds one server's registry. Throws on invalid rows: callers validate first to report every problem at once. */
export function createCapabilityRegistry(rows: readonly DeclaredCapabilityInput[] = []): CapabilityRegistry {
  const problems = declaredCapabilityProblems(rows);
  if (problems.length > 0) throw new Error(`declared capabilities refused:\n- ${problems.join('\n- ')}`);
  const declared = Object.freeze(rows.map(withDeclaredDefaults));
  const byId = new Map<string, DeclaredCapability>(declared.map((row) => [row.id, row]));
  const names: readonly CapabilityName[] = Object.freeze([...CAPABILITIES, ...declared.map((row) => row.id)]);

  const registry: CapabilityRegistry = {
    has: (name): name is CapabilityName => isCapability(name) || byId.has(name),
    isDeclared: (name): name is DeclaredCapabilityId => byId.has(name),
    meta(name) {
      if (isCapability(name)) {
        const meta = CAPABILITY_META[name];
        return {
          sensitive: meta.sensitive,
          adminModuleBypass: meta.adminModuleBypass,
          sessionOnly: meta.sessionOnly === true,
          tokenOnly: meta.tokenOnly === true,
          declared: false,
        };
      }
      const row = byId.get(name);
      if (!row) throw new UnknownCapabilityError(name);
      return { sensitive: row.sensitive, adminModuleBypass: row.adminModuleBypass, sessionOnly: row.sessionOnly, tokenOnly: false, declared: true };
    },
    excludesRole(name, roleLevel) {
      if (isCapability(name)) return roleLevel === 'user' && NOT_FOR_USER_ROLE.has(name);
      const row = byId.get(name);
      if (!row) throw new UnknownCapabilityError(name);
      return !(row.roleLevels as readonly string[]).includes(roleLevel);
    },
    isOrdinarilyRequestable(name) {
      if (isCapability(name)) return isOrdinarilyRequestable(name);
      if (!byId.has(name)) throw new UnknownCapabilityError(name);
      return true;
    },
    declared: (name) => byId.get(name),
    declaredList: () => declared,
    names: () => names,
  };
  return Object.freeze(registry);
}

/** The registry of a server whose bundle declares nothing: exactly the platform capabilities. */
export const PLATFORM_CAPABILITY_REGISTRY: CapabilityRegistry = createCapabilityRegistry([]);
