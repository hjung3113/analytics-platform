import { describe, expect, it } from 'vitest';
import { CAPABILITY_META, TOKEN_SCOPE_CAPABILITIES, API_TOKEN_SCOPE_BUNDLES } from '@ap/feature-shared';
import type { Tx } from '../../../db/tx.js';
import { applyAdminModuleBypass, decideFromRows } from '../check-service.js';
import { supportedScopeCandidates, validateSupportedScope } from '../supported-scope-policy.js';

describe('scope.read isolation from existing writes', () => {
  it('has no role bypass, allows token scopes and stays out of token bundles', () => {
    expect(CAPABILITY_META['scope.read']).toEqual({ sensitive: false, adminModuleBypass: 'none' });
    expect(TOKEN_SCOPE_CAPABILITIES).toContain('scope.read');
    expect(API_TOKEN_SCOPE_BUNDLES.flatMap(bundle => [...bundle.capabilities])).not.toContain('scope.read');
    for (const role of ['admin', 'developer', 'user']) {
      expect(decideFromRows({ actor_id: 'actor', workspace_id: 'workspace', role_level: role }, 'scope.read', { workspace_id: 'workspace' }, { denyRows: [], grantRows: [] }, new Date()).allow).toBe(false);
      expect(applyAdminModuleBypass(role, 'scope.read', { allow: false, reason: 'no_grant', requestable: null }).allow).toBe(false);
    }
  });
  it.each([{}, { approval: true }, { approval: true, field: 'managed_system_id' }])('refuses managed-system candidates for request/approval/direct grant: %j', async options => {
    // No I/O should be needed for a capability outside the existing scope policy.
    const tx = {} as Tx;
    expect(await supportedScopeCandidates(tx, 'workspace', 'scope.read')).toEqual([]);
    await expect(validateSupportedScope(tx, 'workspace', 'scope.read', null, null, null, options)).rejects.toMatchObject({ code: 'validation.failed' });
  });
});
