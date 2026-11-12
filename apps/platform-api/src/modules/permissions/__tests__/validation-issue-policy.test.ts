import { describe, expect, it } from 'vitest';
import { CAPABILITY_META, TOKEN_SCOPE_CAPABILITIES } from '@ap/feature-shared';
import type { Tx } from '../../../db/tx.js';
import { applyAdminModuleBypass, decideFromRows } from '../check-service.js';
import { isNotForUserRole, supportedScopeCandidates } from '../supported-scope-policy.js';

describe('human validation contribution/link rights', () => {
  it.each(['lifecycle.issue.contribute', 'lifecycle.issue.link'] as const)('%s is a session-only explicit workspace grant for every role', async capability => {
    expect(CAPABILITY_META[capability]).toEqual({ sensitive: false, adminModuleBypass: 'none', sessionOnly: true });
    expect(TOKEN_SCOPE_CAPABILITIES).not.toContain(capability);
    expect(isNotForUserRole(capability)).toBe(false);
    expect(await supportedScopeCandidates({} as Tx, 'workspace', capability)).toEqual([{ managed_system_id: null }]);
    for (const role_level of ['user', 'developer', 'admin']) {
      expect(decideFromRows({ actor_id: 'actor', workspace_id: 'workspace', role_level }, capability, { workspace_id: 'workspace' }, { denyRows: [], grantRows: [] }, new Date()).allow).toBe(false);
      expect(applyAdminModuleBypass(role_level, capability, { allow: false, reason: 'no_grant', requestable: null }).allow).toBe(false);
    }
  });
});
