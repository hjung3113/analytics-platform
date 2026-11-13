// ADR-0157 (#1902): a deployment bundle declares capabilities; the server's registry is «platform ∪ declared». DB-free:
// every rule here is judged before a query (or over preloaded rows). Synthetic `ext.widget.*` names only (decision 11).

import {
  CAPABILITIES,
  DECLARED_CAPABILITY_PREFIX,
  TOKEN_ONLY_SCOPES,
  isDeclaredCapabilityId,
} from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../db/tx.js';
import { runAsToken } from '../../../lib/auth-context.js';
import {
  PLATFORM_CAPABILITY_REGISTRY,
  UnknownCapabilityError,
  createCapabilityRegistry,
  declaredCapabilityProblems,
  relaxesDefaults,
} from '../capability-registry.js';
import { applyAdminModuleBypass, decideFromRows, tokenDenial } from '../check-service.js';
import { supportedScopeCandidates, validateSupportedScope } from '../supported-scope-policy.js';

const VIEW = 'ext.widget.view';
const ANNOTATE = 'ext.widget.annotate';
const registry = createCapabilityRegistry([{ id: VIEW, sessionOnly: false, sensitive: false, roleLevels: ['admin', 'developer', 'user'] }, { id: ANNOTATE }]);
const ws = '00000000-0000-4000-8000-000000000002';
const actorOf = (role_level: string) => ({ actor_id: '00000000-0000-4000-8000-000000000001', workspace_id: ws, role_level });
const noTx = new Proxy({}, { get() { throw new Error('the database must not be read for a declared capability'); } }) as Tx;
const activeGrant = { id: 'g1', managedSystemId: null, revokedAt: null, expiresAt: null };
const now = new Date('2026-11-13T00:00:00Z');

describe('reserved prefix (decision 3)', () => {
  it('no platform capability or token-only scope uses the declared prefix or grammar', () => {
    for (const name of [...CAPABILITIES, ...TOKEN_ONLY_SCOPES]) {
      expect(name.startsWith(DECLARED_CAPABILITY_PREFIX), name).toBe(false);
      expect(isDeclaredCapabilityId(name), name).toBe(false);
    }
  });

  it.each([
    ['widget.annotate', /must match ext/],
    ['ext.widget', /must match ext/],
    ['ext.Widget.view', /must match ext/],
    ['ext.widget-x.view', /must match ext/],
    [`ext.${'a'.repeat(60)}.view`, /must match ext/],
    ['workspace.read', /is a platform capability/],
    ['scope.read', /is a platform capability/],
    ['validation.worker', /token-only scope/],
  ])('refuses the id %s', (id, message) => {
    expect(declaredCapabilityProblems([{ id }]).join('\n')).toMatch(message);
  });

  it('refuses a duplicate, an empty allow-list and a bypass without admin on the allow-list', () => {
    expect(declaredCapabilityProblems([{ id: VIEW }, { id: VIEW }]).join('\n')).toMatch(/declared 2 times/);
    expect(declaredCapabilityProblems([{ id: VIEW, roleLevels: [] }]).join('\n')).toMatch(/at least one Role Level/);
    expect(declaredCapabilityProblems([{ id: VIEW, adminModuleBypass: 'always', roleLevels: ['developer'] }]).join('\n'))
      .toMatch(/requires admin in roleLevels/);
    expect(declaredCapabilityProblems([{ id: VIEW, adminModuleBypass: 'unless_denied', roleLevels: ['admin'] }])).toEqual([]);
  });
});

describe('closed defaults (decision 2)', () => {
  it('a declared capability without meta is sensitive, session-only, without Admin bypass, for admin and developer only', () => {
    expect(registry.meta(ANNOTATE)).toEqual({ sensitive: true, adminModuleBypass: 'none', sessionOnly: true, tokenOnly: false, declared: true });
    expect(registry.declared(ANNOTATE)).toMatchObject({ displayName: ANNOTATE, roleLevels: ['admin', 'developer'] });
    expect(registry.excludesRole(ANNOTATE, 'user')).toBe(true);
    expect(registry.excludesRole(ANNOTATE, 'developer')).toBe(false);
    // A Role Level the platform does not know yet is outside every allow-list (closed).
    expect(registry.excludesRole(ANNOTATE, 'auditor')).toBe(true);
    expect(relaxesDefaults(registry.declared(ANNOTATE) ?? (() => { throw new Error('missing'); })())).toBe(false);
    expect(relaxesDefaults(registry.declared(VIEW) ?? (() => { throw new Error('missing'); })())).toBe(true);
  });

  it('the registry answers only for its own names: an unregistered declared-prefix name throws', () => {
    expect(() => registry.meta('ext.widget.gone')).toThrow(UnknownCapabilityError);
    expect(() => registry.excludesRole('ext.widget.gone', 'admin')).toThrow(UnknownCapabilityError);
    expect(() => registry.isOrdinarilyRequestable('ext.widget.gone')).toThrow(UnknownCapabilityError);
    expect(registry.has('ext.widget.gone')).toBe(false);
  });
});

describe('two registries never read each other (decision 7)', () => {
  it('a name declared by one registry is unknown to another and to the platform registry', () => {
    const other = createCapabilityRegistry([{ id: 'ext.gadget.view' }]);
    expect(other.has(VIEW)).toBe(false);
    expect(registry.has('ext.gadget.view')).toBe(false);
    expect(PLATFORM_CAPABILITY_REGISTRY.has(VIEW)).toBe(false);
    expect(() => tokenDenial(VIEW, { capabilities: other })).toThrow(UnknownCapabilityError);
    expect(() => tokenDenial(VIEW)).toThrow(UnknownCapabilityError);
  });
});

describe('judgment reads the registry (decisions 2, 4, 6)', () => {
  it('a grant of one declared capability gives neither another declared capability nor workspace.read', () => {
    const developer = actorOf('developer');
    const granted = { denyRows: [], grantRows: [activeGrant] };
    const none = { denyRows: [], grantRows: [] };
    expect(decideFromRows(developer, ANNOTATE, { workspace_id: ws }, granted, now, registry)).toMatchObject({ allow: true });
    // The other two capabilities read only their own rows: the annotate grant is not among them.
    expect(decideFromRows(developer, VIEW, { workspace_id: ws }, none, now, registry)).toMatchObject({ allow: false, reason: 'no_grant' });
    expect(decideFromRows(developer, 'workspace.read', { workspace_id: ws }, none, now, registry)).toMatchObject({ allow: false });
  });

  it('the Admin role does not lift a declared capability by default; an explicit deny wins over the grant', () => {
    const admin = actorOf('admin');
    const denied = decideFromRows(admin, ANNOTATE, { workspace_id: ws }, { denyRows: [], grantRows: [] }, now, registry);
    expect(applyAdminModuleBypass('admin', ANNOTATE, denied, registry)).toMatchObject({ allow: false, reason: 'no_grant' });
    const withDeny = { denyRows: [{ id: 'd1', managedSystemId: null }], grantRows: [activeGrant] };
    expect(decideFromRows(admin, ANNOTATE, { workspace_id: ws }, withDeny, now, registry)).toMatchObject({ reason: 'explicit_deny' });
    const bypassing = createCapabilityRegistry([{ id: ANNOTATE, adminModuleBypass: 'unless_denied' }]);
    const plain = decideFromRows(admin, ANNOTATE, { workspace_id: ws }, { denyRows: [], grantRows: [] }, now, bypassing);
    expect(applyAdminModuleBypass('admin', ANNOTATE, plain, bypassing)).toMatchObject({ allow: true });
    const explicit = decideFromRows(admin, ANNOTATE, { workspace_id: ws }, withDeny, now, bypassing);
    expect(applyAdminModuleBypass('admin', ANNOTATE, explicit, bypassing)).toMatchObject({ reason: 'explicit_deny' });
  });

  it('a requestable denial offers a request only to a Role Level on the allow-list', () => {
    const none = { denyRows: [], grantRows: [] };
    expect(decideFromRows(actorOf('developer'), ANNOTATE, { workspace_id: ws }, none, now, registry)).toMatchObject({ requestable: [{ workspace_id: ws }] });
    expect(decideFromRows(actorOf('user'), ANNOTATE, { workspace_id: ws }, none, now, registry)).toMatchObject({ requestable: null });
  });

  it('a token cannot call a session-only declared capability; workspace.read alone does not reach a declared one', () => {
    runAsToken('t', [ANNOTATE, VIEW, 'workspace.read'], () => {
      expect(tokenDenial(ANNOTATE, { capabilities: registry, auditTokenDenials: false })).toMatchObject({ reason: 'session_required' });
      expect(tokenDenial(VIEW, { capabilities: registry })).toBeNull();
    });
    runAsToken('t', ['workspace.read'], () => {
      expect(tokenDenial(VIEW, { capabilities: registry })).toMatchObject({ reason: 'token_scope' });
    });
  });
});

describe('scope candidates and write validation (decisions 5, 6)', () => {
  it('a declared capability is workspace-wide only and never reaches the platform hand lists', async () => {
    expect(await supportedScopeCandidates(noTx, ws, ANNOTATE, registry)).toEqual([{ managed_system_id: null }]);
    await expect(supportedScopeCandidates(noTx, ws, 'ext.widget.gone', registry)).rejects.toBeInstanceOf(UnknownCapabilityError);
  });

  it.each([
    ['a Managed System scope', { managedSystemId: '00000000-0000-4000-8000-0000000000aa', scope: undefined, role: 'developer', field: 'requested_managed_system_id' }],
    ['a site scope', { managedSystemId: null, scope: { kind: 'site', site: 'SITE-A', room: null }, role: 'developer', field: 'requested_scope_kind' }],
    ['a User recipient', { managedSystemId: null, scope: undefined, role: 'user', field: 'requested_capability' }],
    ['an unknown recipient', { managedSystemId: null, scope: undefined, role: undefined, field: 'requested_capability' }],
  ] as const)('refuses %s as validation.failed', async (_label, input) => {
    await expect(validateSupportedScope(noTx, ws, ANNOTATE, input.managedSystemId, null, null, {
      capabilities: registry,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.role ? { recipientRole: input.role } : {}),
    })).rejects.toMatchObject({ code: 'validation.failed', detail: { fields: [{ path: [input.field] }] } });
  });

  it('accepts a workspace-wide request for a Role Level on the allow-list', async () => {
    await expect(validateSupportedScope(noTx, ws, ANNOTATE, null, null, null, { capabilities: registry, recipientRole: 'developer' })).resolves.toBeUndefined();
    await expect(validateSupportedScope(noTx, ws, VIEW, null, null, null, { capabilities: registry, recipientRole: 'user' })).resolves.toBeUndefined();
  });
});
