import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_FEATURES, contextCapabilities, groupId, type ApiResponse, type MenuMeta } from '@ap/contracts';
import { createMockAdapter, getRole, setRole } from '@ap/mock-server';
import { systemsMock } from './index';
import { sampleEndpoint } from '../endpoints';

/**
 * Minimal inline MenuMeta mirroring the 'systems' manifest in '../index.ts'
 * (permission, requiresScope, context). Importing '../index' from 'src/mock/**' is lint-banned,
 * so this test restates the registration-relevant fields the adapter validates against.
 * manifest('../index.ts')를 바꾸면 여기도 같이 바꾼다.
 */
const sampleMenu: MenuMeta = {
  id: 'systems',
  group: groupId('systems'),
  label: { ko: '시스템', en: 'Systems' },
  description: { ko: '시스템', en: 'Systems' },
  path: '/operations/systems',
  permission: 'platform:view',
  requiresScope: false,
  context: contextCapabilities(),
  pageType: 'catalog',
  features: NO_FEATURES,
  pageKeys: [],
};

const registry = { menus: [sampleMenu] };
const adapter = createMockAdapter({ endpoints: [...systemsMock], registry });

const previousRole = getRole();
beforeEach(() => { setRole('viewer'); });
afterEach(() => { setRole(previousRole); });

describe('systems mock registration', () => {
  it('registers the sample endpoint without error', () => {
    expect(() => createMockAdapter({ endpoints: [...systemsMock], registry })).not.toThrow();
  });

  it('answers the sample menuQuery with ok', async () => {
    const result: ApiResponse<unknown> = await adapter.menuQuery({ endpoint: 'systems.sample', context: {}, params: {} });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ ready: true });
  });
});
