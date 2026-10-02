import { describe, expect, it } from 'vitest';
import { findForbiddenModules, prodGraphGuard } from './prod-graph.ts';

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
    expect(run(['/repo/apps/platform-web/src/main.tsx', '/repo/apps/platform-web/src/dev/mock-assembly.tsx', '/repo/packages/mock-server/src/adapter.ts']))
      .toBe('production build bundles mock/dev code (ADR-0009):\n'
        + '  - [apps/platform-web/src/dev/] /repo/apps/platform-web/src/dev/mock-assembly.tsx\n'
        + '  - [packages/mock-server/] /repo/packages/mock-server/src/adapter.ts');
  });

  it('passes a clean graph and only runs for builds', () => {
    expect(run(['/repo/apps/platform-web/src/main.tsx', '/repo/in-house/real-assembly.ts'])).toBeNull();
    expect(prodGraphGuard().apply).toBe('build');
  });
});
