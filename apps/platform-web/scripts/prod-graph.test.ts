import { describe, expect, it } from 'vitest';
import { findForbiddenModules, prodGraphGuard } from './prod-graph.ts';

describe('findForbiddenModules (#153)', () => {
  it('flags mock-server, menu mocks and the app dev folder, and nothing else', () => {
    const ids = [
      '/repo/apps/platform-web/src/main.tsx',
      '/repo/apps/platform-web/src/menus.ts',
      '/repo/packages/sdk/kernel/src/index.ts',
      '/repo/menus/mars/equipment/src/index.ts',
      '/repo/menus/mars/equipment/src/mockups.ts',
      '/repo/packages/adapters/mock-server/src/adapter.ts',
      '/repo/node_modules/@ap/mock-server/src/index.ts',
      '/repo/menus/mars/equipment/src/mock/index.ts',
      '/repo/apps/platform-web/src/dev/DevTools.tsx',
      'C:\\repo\\platform\\home\\src\\mock\\data.ts',
      '/repo/platform/home/src/index.ts',
    ];
    expect(findForbiddenModules(ids)).toEqual([
      { id: '/repo/packages/adapters/mock-server/src/adapter.ts', rule: 'packages/adapters/mock-server/' },
      { id: '/repo/node_modules/@ap/mock-server/src/index.ts', rule: '@ap/mock-server' },
      { id: '/repo/menus/mars/equipment/src/mock/index.ts', rule: 'menus/*/*/src/mock/' },
      { id: '/repo/apps/platform-web/src/dev/DevTools.tsx', rule: 'apps/platform-web/src/dev/' },
      { id: 'C:\\repo\\platform\\home\\src\\mock\\data.ts', rule: 'platform/*/src/mock/' },
    ]);
  });

  it.each([
    '@ap/menu-topview/mock-data',
    '/repo/node_modules/.pnpm/@ap+menu-topview/node_modules/@ap/menu-topview/mock-data/index.js',
    '/repo/menus/tools/topview/src/mock-data/index.ts',
  ])('flags the viewer mock data (#801, #1659): %s', id => {
    expect(findForbiddenModules([id])).toEqual([{ id, rule: '@ap/menu-topview/mock-data' }]);
  });

  it('lets the viewer menu source into a production graph, only its mock-data out', () => {
    expect(findForbiddenModules(['/repo/menus/tools/topview/src/index.ts', '/repo/menus/tools/topview/src/endpoints.ts', '/repo/menus/tools/topview/src/model-topview.tsx'])).toEqual([]);
  });

  it('ignores obsolete one-level menu paths', () => {
    expect(findForbiddenModules(['/repo/menus/home/src/mock/index.ts'])).toEqual([]);
  });

  it('passes a clean graph', () => {
    expect(findForbiddenModules(['/repo/packages/sdk/shell/src/index.ts'])).toEqual([]);
  });
});

describe('prodGraphGuard (#153 review P2-1)', () => {
  const run = (moduleIds: string[]): string | null => {
    const guard = prodGraphGuard();
    const hook = guard.generateBundle as (this: unknown, o: unknown, b: unknown) => void;
    let message: string | null = null;
    const ctx = { error: (m: string) => { message = m; throw new Error(m); } };
    try {
      hook.call(ctx, {}, { 'index.js': { type: 'chunk', moduleIds }, 'a.css': { type: 'asset' } });
    } catch { /* this.error throws */ }
    return message;
  };

  it('fails the build listing every offender, assembly modules included', () => {
    expect(run(['/repo/apps/platform-web/src/main.tsx', '/repo/apps/platform-web/src/dev/mock-assembly.tsx', '/repo/packages/adapters/mock-server/src/adapter.ts']))
      .toBe('production build bundles mock/dev code (ADR-0009):\n'
        + '  - [apps/platform-web/src/dev/] /repo/apps/platform-web/src/dev/mock-assembly.tsx\n'
        + '  - [packages/adapters/mock-server/] /repo/packages/adapters/mock-server/src/adapter.ts');
  });

  it('passes a clean graph and only runs for builds', () => {
    expect(run(['/repo/apps/platform-web/src/main.tsx', '/repo/in-house/real-assembly.ts'])).toBeNull();
    expect(prodGraphGuard().apply).toBe('build');
  });
});
