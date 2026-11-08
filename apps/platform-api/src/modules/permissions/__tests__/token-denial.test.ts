// ADR-0116 token rule inside the capability check; DB-free (the denial precedes every query).

import { CAPABILITIES, CAPABILITY_META, TOKEN_SCOPE_CAPABILITIES, isSessionOnlyCapability, isTokenOnlyCapability } from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import { runAsToken } from '../../../lib/auth-context.js';
import { applyAdminModuleBypass, createCheckService, resolveCapabilityScope, tokenDenial } from '../check-service.js';

const actor = { actor_id: '00000000-0000-4000-8000-000000000001', workspace_id: '00000000-0000-4000-8000-000000000002', role_level: 'admin' };
const scope = { workspace_id: actor.workspace_id };
const noDb = new Proxy({}, { get() { throw new Error('DB must not be read before a token denial'); } }) as never;

describe('session-only capability registry', () => {
  it('marks exactly the high-risk capabilities and keeps them out of token scopes', () => {
    const marked = CAPABILITIES.filter(isSessionOnlyCapability).sort();
    expect(marked).toEqual(['dataset.baseline.approve', 'dataset.manage', 'knowledge.item.publish', 'knowledge.spec.publish', 'task_request.self_approve', 'workspace.admin']);
    expect(TOKEN_SCOPE_CAPABILITIES.some((c) => CAPABILITY_META[c].sessionOnly)).toBe(false);
  });
});

describe('log explorer capabilities are token scopes since node X-f (#1472), each its own scope', () => {
  it('read, export and investigate are requestable token scopes and none is session-only', () => {
    for (const cap of ['explorer.source.read', 'explorer.export', 'explorer.investigate'] as const) {
      expect(TOKEN_SCOPE_CAPABILITIES).toContain(cap);
      expect(isSessionOnlyCapability(cap)).toBe(false);
    }
  });

  it('a token holding only the read scope is not refused for export by being session-only, but token_scope', () => {
    runAsToken('t', ['explorer.source.read'], () => {
      expect(tokenDenial('explorer.source.read')).toBeNull();
      expect(tokenDenial('explorer.export')).toEqual({ allow: false, reason: 'token_scope', requestable: null });
    });
  });
});

describe('tokenDenial', () => {
  it('is a no-op for a session / outside a request', () => {
    expect(tokenDenial('workspace.admin')).toBeNull();
  });

  it('session-only beats scope; outside scope is token_scope; in scope falls through to the normal check', () => {
    runAsToken('t', ['workspace.admin', 'voc.read'], () => {
      expect(tokenDenial('workspace.admin')).toEqual({ allow: false, reason: 'session_required', requestable: null });
      expect(tokenDenial('finding.manage')).toEqual({ allow: false, reason: 'token_scope', requestable: null });
      expect(tokenDenial('voc.read')).toBeNull();
    });
  });

  it('checkCapability and capability scope deny before any grant or role is read', async () => {
    const svc = createCheckService({ db: noDb });
    await runAsToken('t', ['voc.read'], async () => {
      expect(await svc.checkCapability(actor, 'finding.manage', scope)).toMatchObject({ allow: false, reason: 'token_scope' });
      expect(await svc.checkCapability(actor, 'workspace.admin', scope)).toMatchObject({ allow: false, reason: 'session_required' });
      expect(await resolveCapabilityScope(noDb, actor, 'finding.manage')).toEqual({ kind: 'scoped', managed_system_ids: [] });
    });
  });

  it.each(['session_required', 'token_scope'] as const)('the Admin module bypass never lifts %s', (reason) => {
    for (const cap of ['finding.manage', 'knowledge.catalog.import', 'survey.manage'] as const) {
      expect(applyAdminModuleBypass('admin', cap, { allow: false, reason, requestable: null })).toMatchObject({ allow: false, reason });
    }
  });
});

describe('token-only capability (#1491)', () => {
  it('is marked exactly on validation.catalog.report, and stays a valid token scope', () => {
    expect(CAPABILITIES.filter(isTokenOnlyCapability)).toEqual(['validation.catalog.report']);
    expect(TOKEN_SCOPE_CAPABILITIES).toContain('validation.catalog.report');
    expect(isSessionOnlyCapability('validation.catalog.report')).toBe(false);
  });

  it('refuses a session (and non-request code) before any grant or role is read; a token with the scope falls through', async () => {
    expect(tokenDenial('validation.catalog.report')).toEqual({ allow: false, reason: 'token_required', requestable: null });
    const svc = createCheckService({ db: noDb });
    expect(await svc.checkCapability(actor, 'validation.catalog.report', scope)).toMatchObject({ allow: false, reason: 'token_required' });
    expect(await resolveCapabilityScope(noDb, actor, 'validation.catalog.report')).toEqual({ kind: 'scoped', managed_system_ids: [] });
    runAsToken('t', ['validation.catalog.report'], () => {
      expect(tokenDenial('validation.catalog.report')).toBeNull();
    });
    await runAsToken('t', ['voc.read'], async () => {
      expect(await svc.checkCapability(actor, 'validation.catalog.report', scope)).toMatchObject({ allow: false, reason: 'token_scope' });
    });
  });

  it('the Admin role never lifts token_required', () => {
    expect(applyAdminModuleBypass('admin', 'validation.catalog.report', { allow: false, reason: 'token_required', requestable: null })).toMatchObject({ allow: false, reason: 'token_required' });
  });
});
