import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_FEATURES, contextCapabilities, groupId, type ApiResponse, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { accessMock } from './index';
import { sampleEndpoint } from '../endpoints';

/**
 * Minimal inline MenuMeta mirroring the 'access-scaffold' manifest in '../index.ts'
 * (permission, requiresScope, context). Importing '../index' from 'src/mock/**' is lint-banned,
 * so this test restates the registration-relevant fields the adapter validates against.
 * manifest('../index.ts')를 바꾸면 여기도 같이 바꾼다.
 */
const sampleMenu: MenuMeta = {
  id: 'access-scaffold',
  group: groupId('access'),
  label: { ko: '권한', en: 'Access' },
  description: { ko: '권한', en: 'Access' },
  path: '/access',
  permission: 'platform:view',
  requiresScope: false,
  context: contextCapabilities(),
  pageType: 'management',
  features: NO_FEATURES,
  pageKeys: [],
};

const registry = { menus: [sampleMenu] };
const adapter = createMockAdapter({ endpoints: [...accessMock], registry });

const previousRole = getRole();
beforeEach(() => { setRole('viewer'); });
afterEach(() => { setRole(previousRole); });

describe('access mock registration', () => {
  it('registers the sample endpoint without error', () => {
    expect(() => createMockAdapter({ endpoints: [...accessMock], registry })).not.toThrow();
  });

  it('answers the sample menuQuery with ok', async () => {
    const result: ApiResponse<unknown> = await adapter.menuQuery({ endpoint: 'access.sample', context: {}, params: {} });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ ready: true });
  });
});
