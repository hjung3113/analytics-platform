// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { manifests } from './index';

describe('personal API token manifest', () => {
  it('uses /tokens outside the API proxy, in My Activity after permission requests', () => {
    expect(manifests.find(menu => menu.id === 'api-tokens')).toMatchObject({ path: '/tokens', group: 'myActivity', permission: 'platform:view', pageKeys: [], label: { ko: 'API 토큰' } });
    expect(manifests.filter(menu => menu.group === 'myActivity').map(menu => menu.id)).toEqual(['notifications', 'permission-requests', 'api-tokens']);
  });
});
