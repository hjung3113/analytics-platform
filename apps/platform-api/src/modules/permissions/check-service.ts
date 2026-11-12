// Permission check application service.
//
// Owns the read-side of the Permission module per
// apps/platform-api/docs/02-domain-module-boundaries.md. All capability checks
// in the codebase MUST go through `checkCapability` — controllers and other
// modules never reach into `permission_grants` / `permission_denies` /
// `permission_requests` directly. AGENTS.md:65-66 ("Backend application
// services own permissions") locks this boundary.
//
// Check order: docs/architecture/platform-api/05-permission-policy.md ## Permission Check Order —
//   1. workspace context → workspace_mismatch
//   2. explicit deny      → explicit_deny
//   3. direct grant       → workspace-wide grants only (grant.managed_system_id IS NULL)
//                           allow via direct_grant (or grant_expired/revoked)
//   4. role-derived       → allow via role
//   5. managed-system     → MS-scoped grants whose managed_system_id matches
//                           scope.managed_system_id (FO ADR-0019 Section D: now
//                           first-class; emits via: 'managed_system_scope').
//                           Slice 3 will add the *fallback* direction
//                           (MS-scoped grant satisfies a workspace-wide
//                           check on an MS-eligible capability) — not done
//                           in Slice 2.
//   6. requestable check  → compute fallback request candidates
//
// Slice 1 role rule (issue #4):
//   - Admin satisfies workspace.read AND workspace.admin via role.
//   - User satisfies workspace.read via role; workspace.admin falls through.

import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  type Capability,
  adminModuleBypassFor,
  isSessionOnlyCapability,
  isTokenOnlyCapability,
} from '@ap/feature-shared';
import type { Db } from '../../db/client.js';
import { permissionDenies, permissionGrants } from '../../db/schema/permission.js';
import type { Tx } from '../../db/tx.js';
import { currentAuthContext, noteSessionOnlyDenial } from '../../lib/auth-context.js';
import { allManagedSystemIds } from '../managed-systems/read-projections.js';
import { isOrdinarilyRequestable, isNotForUserRole } from './supported-scope-policy.js';

// ──────────────────────────────────────────────────────────────────────────
// Decision shape — locked verbatim by issue #4. Do not extend without an
// ADR; downstream code (state mapper, frontend gate) discriminates on these
// fields by name.
// ──────────────────────────────────────────────────────────────────────────

export type DenyReason =
  | 'workspace_mismatch'
  | 'explicit_deny'
  | 'no_grant'
  | 'grant_expired'
  | 'grant_revoked'
  | 'sensitive_reason_missing'
  // ADR-0116: token calls. Never requestable, never lifted by the Admin bypass.
  | 'session_required'
  | 'token_scope'
  // #1491: a human session reached a token-only capability.
  | 'token_required';

/**
 * ADR-0116 token rule, applied before any grant or role is read: a token call to a session-only capability is
 * `session_required` (even when the capability is in its scopes); a capability outside the token's scopes is
 * `token_scope`. Null = the normal check for the token's actor runs (issuer's / system actor's current grants and
 * role, so the effective right is that intersect the scopes). Session calls and non-request code are unaffected.
 * Snapshot readers may disable audit marking; the denial decision itself is unchanged.
 */
export function tokenDenial(capability: Capability, options: { auditTokenDenials?: boolean } = {}): Decision | null {
  const auth = currentAuthContext();
  if (auth.kind !== 'token') {
    return isTokenOnlyCapability(capability)
      ? { allow: false, reason: 'token_required', requestable: null }
      : null;
  }
  if (isSessionOnlyCapability(capability)) {
    if (options.auditTokenDenials !== false) noteSessionOnlyDenial(capability);
    return { allow: false, reason: 'session_required', requestable: null };
  }
  if (!auth.scopes.includes(capability)) {
    return { allow: false, reason: 'token_scope', requestable: null };
  }
  return null;
}

export function isRequestableDenial(reason: DenyReason): boolean {
  return reason === 'no_grant' || reason === 'grant_revoked' || reason === 'grant_expired';
}

export interface RequestableScope {
  workspace_id: string;
  managed_system_id?: string;
}

export type Decision =
  | { allow: true; via: 'direct_grant' | 'role' | 'managed_system_scope'; grant_id?: string }
  | { allow: false; reason: DenyReason; requestable: RequestableScope[] | null };

export type CapabilityScope = { kind: 'all' } | { kind: 'scoped'; managed_system_ids: string[] };

export interface ActorContext {
  actor_id: string;
  workspace_id: string;
  role_level: string; // 'admin' | 'developer' | 'user' (lower-case in DB)
}

export interface CheckScope {
  /** Workspace the actor is *attempting* to act in. */
  workspace_id: string;
  /** Optional MS scope; Slice 1 always falls through. */
  managed_system_id?: string;
}

export interface CheckServiceDeps {
  db: Db;
  now?: () => Date;
}

export type CheckService = ReturnType<typeof createCheckService>;

/** Scope to one read call; never hold this wrapper across requests or mutations. */
export function memoizeCapabilityChecks(checkService: CheckService): CheckService {
  const decisions = new Map<string, Promise<Decision>>();
  return {
    ...checkService,
    checkCapability(actor, capability, scope, options) {
      if (options?.tx) return checkService.checkCapability(actor, capability, scope, options);
      const key = JSON.stringify([
        actor.actor_id,
        actor.workspace_id,
        actor.role_level,
        capability,
        scope.workspace_id,
        scope.managed_system_id ?? '',
      ]);
      const cached = decisions.get(key);
      if (cached) return cached;
      const decision = checkService
        .checkCapability(actor, capability, scope, options)
        .catch((error) => {
          decisions.delete(key);
          throw error;
        });
      decisions.set(key, decision);
      return decision;
    },
  };
}

export function createCheckService(deps: CheckServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function checkCapability(
    actor: ActorContext,
    capability: Capability,
    scope: CheckScope,
    options: { tx?: Tx } = {},
  ): Promise<Decision> {
    // When invoked inside a mutation transaction, callers pass `tx` so steps
    // 2/3/5 observe writes the same tx just performed (S-002, FO ADR-0019
    // Section D). Without it, we fall back to the pool-bound handle for
    // read-only callers like the route-level pre-check at routes.ts.
    const db: Tx = options.tx ?? deps.db;

    const byToken = tokenDenial(capability);
    if (byToken) return byToken;

    // (1) workspace context — actor must be acting inside their own workspace.
    if (actor.workspace_id !== scope.workspace_id) {
      return { allow: false, reason: 'workspace_mismatch', requestable: null };
    }

    // One loader for decision and scope reads (#1531): it also drops grants the actor's CURRENT role may not exercise.
    const rows = await loadDenyAndGrantRows(db, actor, capability);
    return decideFromRows(actor, capability, scope, rows, now());
  }

  async function capabilityScope(
    actor: ActorContext,
    capability: Capability,
    scope: { workspace_id: string },
    options: { tx?: Tx } = {},
  ): Promise<CapabilityScope> {
    const db: Tx = options.tx ?? deps.db;
    if (actor.workspace_id !== scope.workspace_id)
      return { kind: 'scoped', managed_system_ids: [] };

    return resolveCapabilityScope(db, actor, capability, now);
  }

  /**
   * Batched read (#1667): the deny and grant rows of many actors for many capabilities in two statements, whatever the
   * counts. Decisions and scopes then come from memory through the same functions `checkCapability` and
   * `resolveCapabilityScope` use, so a single call and a batch cannot disagree.
   */
  async function loadCapabilitySnapshot(
    actors: readonly ActorContext[],
    capabilities: readonly Capability[],
    options: { tx?: Tx; auditTokenDenials?: boolean } = {},
  ): Promise<CapabilitySnapshot> {
    const db: Tx = options.tx ?? deps.db;
    const rowsByKey = await loadDenyAndGrantRowsBatch(db, actors, capabilities);
    const rightNow = now();
    // The workspace's Managed System ids are read at most once per snapshot, and only when a scope needs them.
    const idsByWorkspace = new Map<string, Promise<string[]>>();
    const allIds = (workspaceId: string) => {
      let ids = idsByWorkspace.get(workspaceId);
      if (!ids) {
        ids = allManagedSystemIds(db, workspaceId);
        idsByWorkspace.set(workspaceId, ids);
      }
      return ids;
    };
    const rowsOf = (actor: ActorContext, capability: Capability) => {
      const rows = rowsByKey.get(snapshotKey(actor, capability));
      if (!rows) {
        throw new Error(`capability snapshot: ${actor.actor_id} / ${capability} was not loaded`);
      }
      return rows;
    };
    return {
      decision(actor, capability) {
        const byToken = tokenDenial(capability, options);
        if (byToken) return byToken;
        return decideFromRows(
          actor,
          capability,
          { workspace_id: actor.workspace_id },
          rowsOf(actor, capability),
          rightNow,
        );
      },
      async scope(actor, capability) {
        if (tokenDenial(capability, options)) return { kind: 'scoped', managed_system_ids: [] };
        const bypass = actor.role_level === 'admin' ? adminModuleBypassFor(capability) : 'none';
        if (bypass === 'always') return { kind: 'all' };
        return scopeFromRows(actor, capability, rowsOf(actor, capability), rightNow, () =>
          allIds(actor.workspace_id),
        );
      },
    };
  }

  return { checkCapability, capabilityScope, loadCapabilitySnapshot };
}

/** Decisions and scopes of a preloaded set of (actor, capability) pairs; reading a pair that was not loaded throws. */
export interface CapabilitySnapshot {
  /** What `checkCapability(actor, capability, { workspace_id: actor.workspace_id })` answers. */
  decision(actor: ActorContext, capability: Capability): Decision;
  /** What `capabilityScope(actor, capability, { workspace_id: actor.workspace_id })` answers. */
  scope(actor: ActorContext, capability: Capability): Promise<CapabilityScope>;
}

interface DenyRow {
  id: string;
  managedSystemId: string | null;
}
interface GrantRow {
  id: string;
  managedSystemId: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}
export interface DenyAndGrantRows {
  denyRows: DenyRow[];
  grantRows: GrantRow[];
}

const rowKey = (workspaceId: string, actorId: string, capability: string) =>
  `${workspaceId}\u0000${actorId}\u0000${capability}`;
const snapshotKey = (actor: ActorContext, capability: Capability) =>
  rowKey(actor.workspace_id, actor.actor_id, capability);

/**
 * #1531: a grant counts only while the CURRENT role may hold the capability. A demoted actor keeps its grant rows (a later
 * promotion restores them), but a User never exercises a capability that is excluded for the User role (ADR-0107 decision 3).
 * Every decision and scope read goes through here (single and batch), so this is the one place the rule lives.
 */
function withRoleExclusion(
  actor: ActorContext,
  capability: Capability,
  rows: DenyAndGrantRows,
): DenyAndGrantRows {
  if (actor.role_level === 'user' && isNotForUserRole(capability)) {
    return { denyRows: rows.denyRows, grantRows: [] };
  }
  return rows;
}

const denyColumns = { id: permissionDenies.id, managedSystemId: permissionDenies.managedSystemId };
const grantColumns = {
  id: permissionGrants.id,
  managedSystemId: permissionGrants.managedSystemId,
  revokedAt: permissionGrants.revokedAt,
  expiresAt: permissionGrants.expiresAt,
};

/** The actor's active denies and unsuperseded grants for one capability: one pair of queries, whatever the scope. */
export async function loadDenyAndGrantRows(
  db: Tx,
  actor: ActorContext,
  capability: Capability,
): Promise<DenyAndGrantRows> {
  const [denyRows, grantRows] = await Promise.all([
    db
      .select(denyColumns)
      .from(permissionDenies)
      .where(
        and(
          eq(permissionDenies.workspaceId, actor.workspace_id),
          eq(permissionDenies.actorId, actor.actor_id),
          eq(permissionDenies.capability, capability),
          isNull(permissionDenies.revokedAt),
        ),
      ),
    db
      .select(grantColumns)
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.workspaceId, actor.workspace_id),
          eq(permissionGrants.actorId, actor.actor_id),
          eq(permissionGrants.capability, capability),
          isNull(permissionGrants.supersededAt),
        ),
      ),
  ]);
  return withRoleExclusion(actor, capability, { denyRows, grantRows });
}

/**
 * The same rows as `loadDenyAndGrantRows` for every (actor, capability) pair, in one statement per table
 * (`actor_id = any(...)`, `capability = any(...)`), keyed by `snapshotKey`. A pair without rows maps to empty rows.
 */
export async function loadDenyAndGrantRowsBatch(
  db: Tx,
  actors: readonly ActorContext[],
  capabilities: readonly Capability[],
): Promise<Map<string, DenyAndGrantRows>> {
  const out = new Map<string, DenyAndGrantRows>();
  if (actors.length === 0 || capabilities.length === 0) return out;
  const workspaceIds = [...new Set(actors.map((a) => a.workspace_id))];
  const actorIds = [...new Set(actors.map((a) => a.actor_id))];
  const capabilityList = [...capabilities];
  const [denyRows, grantRows] = await Promise.all([
    db
      .select({
        ...denyColumns,
        actorId: permissionDenies.actorId,
        workspaceId: permissionDenies.workspaceId,
        capability: permissionDenies.capability,
      })
      .from(permissionDenies)
      .where(
        and(
          inArray(permissionDenies.workspaceId, workspaceIds),
          inArray(permissionDenies.actorId, actorIds),
          inArray(permissionDenies.capability, capabilityList),
          isNull(permissionDenies.revokedAt),
        ),
      ),
    db
      .select({
        ...grantColumns,
        actorId: permissionGrants.actorId,
        workspaceId: permissionGrants.workspaceId,
        capability: permissionGrants.capability,
      })
      .from(permissionGrants)
      .where(
        and(
          inArray(permissionGrants.workspaceId, workspaceIds),
          inArray(permissionGrants.actorId, actorIds),
          inArray(permissionGrants.capability, capabilityList),
          isNull(permissionGrants.supersededAt),
        ),
      ),
  ]);
  const raw = new Map<string, DenyAndGrantRows>();
  const slot = (workspaceId: string, actorId: string, capability: string) => {
    const key = rowKey(workspaceId, actorId, capability);
    let rows = raw.get(key);
    if (!rows) {
      rows = { denyRows: [], grantRows: [] };
      raw.set(key, rows);
    }
    return rows;
  };
  for (const { actorId, workspaceId, capability, ...row } of denyRows) {
    slot(workspaceId, actorId, capability).denyRows.push(row);
  }
  for (const { actorId, workspaceId, capability, ...row } of grantRows) {
    slot(workspaceId, actorId, capability).grantRows.push(row);
  }
  for (const actor of actors) {
    for (const capability of capabilities) {
      const key = snapshotKey(actor, capability);
      out.set(key, withRoleExclusion(actor, capability, raw.get(key) ?? { denyRows: [], grantRows: [] }));
    }
  }
  return out;
}

/**
 * Steps 2–6 of the check order over already-loaded rows (the token and workspace steps stay with the caller).
 * `checkCapability` and the batch snapshot both end here: the decision rules exist once.
 */
export function decideFromRows(
  actor: ActorContext,
  capability: Capability,
  scope: CheckScope,
  { denyRows, grantRows }: DenyAndGrantRows,
  rightNow: Date,
): Decision {
  // (2) explicit deny — a workspace-wide active deny blocks every check;
  // an MS-scoped deny blocks only that same MS scope. Both precede grants
  // and role checks. 05-policy:33.
  for (const row of denyRows) {
    if (row.managedSystemId === null || row.managedSystemId === scope.managed_system_id) {
      return { allow: false, reason: 'explicit_deny', requestable: null };
    }
  }

  // (3) direct capability grant. Active = NOT revoked AND (expires_at NULL
  // OR expires_at > now()). Rows are classified rather than filtered in SQL so
  // grant_expired / grant_revoked stay distinct from no_grant.
  let sawRevoked = false;
  let sawExpired = false;
  // Step 3 — workspace-wide grants only. MS-scoped grants are step 5's
  // territory (FO ADR-0019 Section D).
  for (const row of grantRows) {
    if (row.managedSystemId !== null) continue;
    if (row.revokedAt !== null) {
      sawRevoked = true;
      continue;
    }
    if (row.expiresAt !== null && row.expiresAt.getTime() <= rightNow.getTime()) {
      sawExpired = true;
      continue;
    }
    return { allow: true, via: 'direct_grant', grant_id: row.id };
  }

  // (4) role-derived capability — Slice 1 rule (issue #4 locked):
  if (roleSatisfies(actor.role_level, capability)) {
    return { allow: true, via: 'role' };
  }

  // (5) managed-system scope (FO ADR-0019 Section D): when the caller
  // supplied scope.managed_system_id, match MS-scoped grants whose
  // managed_system_id is exactly that id. Emits the dedicated
  // `via: 'managed_system_scope'` attribution so the audit/state-mapper
  // can distinguish workspace-wide grants from MS-scoped grants.
  //
  // Slice 3 will add the *fallback* direction: an MS-scoped grant
  // satisfies a workspace-wide check (scope.managed_system_id absent)
  // when the capability is on the MS-eligible list. That branch is
  // intentionally not added here.
  if (scope.managed_system_id !== undefined) {
    for (const row of grantRows) {
      if (row.managedSystemId !== scope.managed_system_id) continue;
      if (row.revokedAt !== null) {
        sawRevoked = true;
        continue;
      }
      if (row.expiresAt !== null && row.expiresAt.getTime() <= rightNow.getTime()) {
        sawExpired = true;
        continue;
      }
      return { allow: true, via: 'managed_system_scope', grant_id: row.id };
    }
  }

  // If we saw a revoked or expired grant earlier and nothing else allowed,
  // surface that distinct reason. Revoked takes precedence over expired
  // because revocation is an intentional action vs. passive expiry.
  // A capability that cannot be requested ordinarily (workspace.admin) carries
  // no requestable scope on any of these denies, like explicit_deny.
  // Likewise for a User and a User-excluded capability: the request path refuses it (#1531), so no request is offered.
  const requestableScope: RequestableScope[] | null =
    isOrdinarilyRequestable(capability) &&
    !(actor.role_level === 'user' && isNotForUserRole(capability))
      ? [{ workspace_id: actor.workspace_id }]
      : null;
  if (sawRevoked) {
    return { allow: false, reason: 'grant_revoked', requestable: requestableScope };
  }
  if (sawExpired) {
    return { allow: false, reason: 'grant_expired', requestable: requestableScope };
  }

  // (6) requestable computation (Slice 1): no explicit deny here, so the
  // actor MAY request workspace-only scope on this capability. Slice 2
  // extends with MS scope candidates.
  return { allow: false, reason: 'no_grant', requestable: requestableScope };
}

/** Single capability scope rule, shared by HTTP hints and db/tx read-model filters. */
export async function resolveCapabilityScope(
  db: Tx,
  actor: ActorContext,
  capability: Capability,
  now: () => Date = () => new Date(),
): Promise<CapabilityScope> {
  if (tokenDenial(capability)) return { kind: 'scoped', managed_system_ids: [] };
  const bypass = actor.role_level === 'admin' ? adminModuleBypassFor(capability) : 'none';
  if (bypass === 'always') return { kind: 'all' };

  const rows = await loadDenyAndGrantRows(db, actor, capability);
  return scopeFromRows(actor, capability, rows, now(), () =>
    allManagedSystemIds(db, actor.workspace_id),
  );
}

/** The scope rule over loaded rows (token and `always` bypass are the callers' step). `allIds` runs only when a scope needs the id list. */
async function scopeFromRows(
  actor: ActorContext,
  capability: Capability,
  { denyRows, grantRows }: DenyAndGrantRows,
  rightNow: Date,
  allIds: () => Promise<string[]>,
): Promise<CapabilityScope> {
  const bypass = actor.role_level === 'admin' ? adminModuleBypassFor(capability) : 'none';
  if (denyRows.some((row) => row.managedSystemId === null)) {
    return { kind: 'scoped', managed_system_ids: [] };
  }
  const deniedIds = new Set(
    denyRows.map((row) => row.managedSystemId).filter((id): id is string => id !== null),
  );

  const isActive = (row: {
    revokedAt: Date | null;
    expiresAt: Date | null;
  }) =>
    row.revokedAt === null &&
    (row.expiresAt === null || row.expiresAt.getTime() > rightNow.getTime());
  const broadAllow =
    grantRows.some((row) => row.managedSystemId === null && isActive(row)) ||
    roleSatisfies(actor.role_level, capability) ||
    bypass === 'unless_denied';
  if (broadAllow && deniedIds.size === 0) return { kind: 'all' };

  const allowedIds = broadAllow
    ? await allIds()
    : grantRows
        .filter(
          (row): row is typeof row & { managedSystemId: string } =>
            row.managedSystemId !== null && isActive(row),
        )
        .map((row) => row.managedSystemId);
  return {
    kind: 'scoped',
    managed_system_ids: allowedIds.filter((id) => !deniedIds.has(id)),
  };
}

/**
 * Mirror a domain module's admin-role bypass onto an advisory decision.
 *
 * `checkCapability` answers for the generic layer only: `roleSatisfies` covers
 * the four role-derived Slice 1 capabilities and nothing else. Several domain
 * modules layer their own admin bypass on top of it before enforcing — Finding
 * point authorization, Task Request self-approval, and Survey read/manage. A
 * caller that asks the generic service *about* one of those capabilities
 * therefore gets a stricter answer than the enforcing route would give.
 *
 * That divergence is safe in the deny direction but wrong as a display hint:
 * `GET /me/permissions/check` is what the frontend gates on, so an Admin was
 * told they needed `survey.manage` while `POST /surveys` would have let them
 * through (issue #372). This function re-applies the module's rule from the
 * single declaration in `CAPABILITY_META.adminModuleBypass`.
 *
 * It is deliberately advisory-only: enforcement still happens in the domain
 * modules, so this widens no permission wall. `workspace_mismatch` is never
 * bypassed — a cross-workspace actor is not this workspace's Admin.
 */
export function applyAdminModuleBypass(
  roleLevel: string,
  capability: Capability,
  decision: Decision,
): Decision {
  if (decision.allow || roleLevel !== 'admin') return decision;
  if (decision.reason === 'workspace_mismatch') return decision;
  // A token's scope / session-only refusal is not a missing grant: the Admin role never lifts it.
  if (
    decision.reason === 'session_required' ||
    decision.reason === 'token_scope' ||
    decision.reason === 'token_required'
  )
    return decision;
  switch (adminModuleBypassFor(capability)) {
    case 'always':
      return { allow: true, via: 'role' };
    case 'unless_denied':
      return decision.reason === 'explicit_deny' ? decision : { allow: true, via: 'role' };
    case 'none':
      return decision;
  }
}

function roleSatisfies(roleLevel: string, capability: Capability): boolean {
  // role_level is stored lower-case (core.actors CHECK constraint).
  if (roleLevel === 'admin') {
    // admin role implicitly satisfies voc.triage and voc.read (workspace-wide);
    // developer/user need MS-scoped grants for those capabilities.
    return (
      capability === 'workspace.read' ||
      capability === 'workspace.admin' ||
      capability === 'voc.triage' ||
      capability === 'voc.read'
    );
  }
  if (roleLevel === 'user') {
    return capability === 'workspace.read';
  }
  // 'developer' has no implicit Slice 1 capabilities; needs MS scope.
  return false;
}
