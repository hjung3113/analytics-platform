import { PACKAGE_PREFIX } from './prefix.ts';

export type PageType = 'overview' | 'analysis' | 'management' | 'catalog' | 'workflow';

export const PAGE_TYPES = ['overview', 'analysis', 'management', 'catalog', 'workflow'] as const;

/** Stored inputs (`.gen-menu.json`); insert lines and file contents are derived from these. */
export type MenuInputs = {
  group: string;
  folder: string;
  menuId: string;
  page: string;
  path: string;
  pageType: PageType;
  labelKo: string;
  labelEn: string;
  binding: string;
};

export const menuPackage = (folder: string): string => `${PACKAGE_PREFIX}menu-${folder}`;

/** apps/platform-web/src/menus.ts import insert. */
export const importLine = (i: MenuInputs): string =>
  `import { manifests as ${i.binding} } from '${menuPackage(i.folder)}';`;

/** apps/platform-web/src/menus.ts spread insert. */
export const spreadLine = (i: MenuInputs): string => `  ...${i.binding},`;

/** apps/platform-web/src/style.css insert. */
export const styleLine = (i: MenuInputs): string => `@import "${menuPackage(i.folder)}/styles.css";`;

/** apps/platform-web/package.json dependency insert. */
export const depLine = (i: MenuInputs): string => `    "${menuPackage(i.folder)}": "workspace:*",`;

/** The nine generated files, paths relative to `menus/<folder>/`. LF, trailing newline, UTF-8. */
export const renderFiles = (i: MenuInputs): { relPath: string; content: string }[] => [
  { relPath: 'package.json', content: packageJson(i) },
  {
    relPath: 'tsconfig.json',
    content: `{"extends": "${PACKAGE_PREFIX}tsconfig/base.json", "include": ["src", "vitest.config.ts"]}\n`,
  },
  { relPath: 'eslint.config.js', content: `export { menu as default } from '${PACKAGE_PREFIX}eslint-config';\n` },
  {
    relPath: 'vitest.config.ts',
    content: `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { environment: 'node' } });\n`,
  },
  { relPath: 'src/styles.css', content: `@source "./";\n` },
  { relPath: 'src/api.ts', content: `export { serve } from '${PACKAGE_PREFIX}mock-server';\n` },
  { relPath: 'src/index.ts', content: indexTs(i) },
  { relPath: `src/pages/${i.page}.tsx`, content: pageTsx(i) },
  { relPath: 'src/manifest.test.ts', content: manifestTest(i) },
];

function packageJson(i: MenuInputs): string {
  const body = {
    name: menuPackage(i.folder),
    private: true,
    version: '0.0.0',
    type: 'module',
    exports: { '.': './src/index.ts', './styles.css': './src/styles.css' },
    scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit', test: 'vitest run' },
    dependencies: {
      [`${PACKAGE_PREFIX}components`]: 'workspace:*',
      [`${PACKAGE_PREFIX}contracts`]: 'workspace:*',
      [`${PACKAGE_PREFIX}kernel`]: 'workspace:*',
      [`${PACKAGE_PREFIX}mock-server`]: 'workspace:*',
      'lucide-react': '^1.48.0',
    },
    peerDependencies: { 'react': '^19.3.0', 'react-dom': '^19.3.0' },
    devDependencies: {
      [`${PACKAGE_PREFIX}eslint-config`]: 'workspace:*',
      [`${PACKAGE_PREFIX}tsconfig`]: 'workspace:*',
      '@types/node': '^26.6.3',
      '@types/react': '^19.3.0',
      '@types/react-dom': '^19.3.0',
      'eslint': '^10.11.0',
      'react': '^19.3.0',
      'react-dom': '^19.3.0',
      'typescript': '^5.9.3',
      'vitest': '^3.2.7',
    },
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

function indexTs(i: MenuInputs): string {
  return `/** ${menuPackage(i.folder)} — ${i.group} group. Scaffold: one primary menu, no domain data. */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import type { Capability, ContextKey } from '${PACKAGE_PREFIX}contracts';
import type { MenuEntry } from '${PACKAGE_PREFIX}kernel';

const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: '${i.menuId}', primary: true, group: '${i.group}',
    label: { ko: '${i.labelKo}', en: '${i.labelEn}' },
    description: { ko: '${i.labelKo}', en: '${i.labelEn}' },
    path: '${i.path}', icon: LayoutDashboard, permission: 'platform:view',
    requiresScope: false, context: none, pageType: '${i.pageType}', features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/${i.page}')),
  },
];
`;
}

function pageTsx(i: MenuInputs): string {
  return `import { useI18n, usePlatform, usePlatformQuery } from '${PACKAGE_PREFIX}kernel';
import { PlatformPage, QueryView } from '${PACKAGE_PREFIX}components';
import { serve } from '../api';

export default function ${i.page}() {
  const { global } = usePlatform();
  const { lang } = useI18n();
  const query = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false,
    compute: () => ({ ready: true }),
    isEmpty: () => false,
  }));
  const caption = lang === 'ko' ? '${i.labelKo}' : '${i.labelEn}';
  return <PlatformPage>
    <QueryView query={query}>{() => <p className="t-caption text-text-muted">{caption}</p>}</QueryView>
  </PlatformPage>;
}
`;
}

function manifestTest(i: MenuInputs): string {
  return `import { describe, expect, it } from 'vitest';
import { createRegistry, type GroupDef } from '${PACKAGE_PREFIX}kernel';
import { manifests } from './index';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual([]);
    expect(menu.pageType).toBe('${i.pageType}');
    expect(menu.group).toBe('${i.group}');
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon }];
    const registry = createRegistry({ groups, menus: manifests });
    expect(registry.menuById('${i.menuId}').path).toBe('${i.path}');
  });
});
`;
}
