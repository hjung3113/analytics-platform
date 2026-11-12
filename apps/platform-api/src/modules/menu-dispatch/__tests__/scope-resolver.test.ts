import { describe, expect, it } from 'vitest';

import { createSyntheticScopeResolver } from '../scope-resolver.js';

describe('synthetic Scope resolver', () => {
  it('resolves deterministically by actor and workspace, denying missing entries', async () => {
    const grants = [{ site: 'site-a', rooms: ['PHOTO', 'ETCH'] }];
    const resolver = createSyntheticScopeResolver([
      { actor_id: 'alice', workspace_id: 'w1', grants },
      { actor_id: 'bob', workspace_id: 'w1', grants: [{ site: 'site-b', rooms: ['ETCH'] }] },
    ]);
    const actor = { actor_id: 'alice', workspace_id: 'w1' };
    await expect(resolver.resolve(actor)).resolves.toEqual(grants);
    await expect(resolver.resolve(actor)).resolves.toEqual(grants);
    await expect(resolver.resolve({ actor_id: 'bob', workspace_id: 'w1' }))
      .resolves.toEqual([{ site: 'site-b', rooms: ['ETCH'] }]);
    await expect(resolver.resolve({ ...actor, workspace_id: 'w2' })).resolves.toEqual([]);
    await expect(resolver.resolve({ ...actor, actor_id: 'missing' })).resolves.toEqual([]);
  });
});
