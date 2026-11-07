import { describe, expect, it } from 'vitest';
import { API_TOKEN_SCOPE_BUNDLES, visibleApiTokenScopeBundles } from './api-token-bundles.js';
import { CAPABILITIES, CAPABILITY_META, isCapability } from './capabilities.js';

describe('API token scope bundles', () => {
  it('hides a whole bundle until every capability is registered', () => {
    expect(visibleApiTokenScopeBundles().map(b => b.id)).toEqual(['read', 'write']);
    expect(visibleApiTokenScopeBundles([...CAPABILITIES, 'validation.worker']).map(b => b.id)).toContain('validation-worker');
    expect(visibleApiTokenScopeBundles(['knowledge.catalog.manage']).map(b => b.id)).not.toContain('write');
  });
  it('never offers a session-only capability and pins the token-callable menu write rights', () => {
    expect(API_TOKEN_SCOPE_BUNDLES.find(b => b.id === 'write')?.capabilities).toEqual([
      'knowledge.catalog.manage', 'knowledge.catalog.import', 'improvement.manage',
    ]);
    for (const bundle of visibleApiTokenScopeBundles()) for (const capability of bundle.capabilities) {
      expect(isCapability(capability) && CAPABILITY_META[capability].sessionOnly !== true).toBe(true);
    }
  });
});
