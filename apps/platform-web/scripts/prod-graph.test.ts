import { describe, expect, it } from 'vitest';
import { findForbiddenModules } from './prod-graph.ts';

describe('findForbiddenModules (#153)', () => {
  it('flags mock-server, menu mocks and the app dev folder, and nothing else', () => {
    const ids = [
      '/repo/apps/platform-web/src/main.tsx',
      '/repo/apps/platform-web/src/menus.ts',
      '/repo/packages/kernel/src/index.ts',
      '/repo/menus/equipment/src/index.ts',
      '/repo/menus/equipment/src/mockups.ts',
      '/repo/packages/mock-server/src/adapter.ts',
      '/repo/node_modules/@ap/mock-server/src/index.ts',
      '/repo/menus/equipment/src/mock/index.ts',
      '/repo/apps/platform-web/src/dev/DevTools.tsx',
      'C:\\repo\\menus\\home\\src\\mock\\data.ts',
    ];
    expect(findForbiddenModules(ids)).toEqual([
      { id: '/repo/packages/mock-server/src/adapter.ts', rule: 'packages/mock-server/' },
      { id: '/repo/node_modules/@ap/mock-server/src/index.ts', rule: '@ap/mock-server' },
      { id: '/repo/menus/equipment/src/mock/index.ts', rule: 'menus/*/src/mock/' },
      { id: '/repo/apps/platform-web/src/dev/DevTools.tsx', rule: 'apps/platform-web/src/dev/' },
      { id: 'C:\\repo\\menus\\home\\src\\mock\\data.ts', rule: 'menus/*/src/mock/' },
    ]);
  });

  it('passes a clean graph', () => {
    expect(findForbiddenModules(['/repo/packages/shell/src/index.ts'])).toEqual([]);
  });
});
