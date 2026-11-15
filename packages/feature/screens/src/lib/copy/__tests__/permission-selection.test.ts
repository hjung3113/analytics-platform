import { describe, expect, it } from 'vitest';
import { CAPABILITIES, TOKEN_ONLY_SCOPES, TOKEN_SCOPE_CAPABILITIES, isTokenOnlyCapability } from '@ap/feature-shared';
import { PERMISSION_DECLARATIONS, tokenSelectionGroups } from '../permission-selection';

describe('permission selection declaration', () => {
  it('explicitly describes and categorizes every capability and token-only scope', () => {
    for (const id of [...CAPABILITIES, ...TOKEN_ONLY_SCOPES]) {
      expect(PERMISSION_DECLARATIONS[id].category.trim()).not.toBe('');
      expect(PERMISSION_DECLARATIONS[id].description.trim()).not.toBe('');
    }
  });
  it.each([false, true])('offers every applicable token scope (service=%s)', service => {
    const rows = tokenSelectionGroups(service).flatMap(group => group.items);
    for (const id of TOKEN_SCOPE_CAPABILITIES) {
      if (!service && isTokenOnlyCapability(id)) expect(rows.some(row => row.id === id)).toBe(false);
      else expect(rows.find(row => row.id === id)?.disabledReason).toBeUndefined();
    }
    for (const id of TOKEN_ONLY_SCOPES) expect(rows.some(row => row.id === id)).toBe(service);
    expect(rows.find(row => row.id === 'workspace.admin')?.disabledReason).toContain('로그인 세션');
  });
});
