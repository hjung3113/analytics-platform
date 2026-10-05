import ts from 'typescript';
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

/**
 * The scaffold's one permission: the manifest declares it and the sample endpoint's ACL requires
 * it, because the server re-validates data permission per request (#47). Kept in one place so the
 * two never drift apart.
 */
export const SCAFFOLD_PERMISSION = 'platform:view';

export const menuPackage = (folder: string): string => `${PACKAGE_PREFIX}menu-${folder}`;

/** apps/platform-web/src/menus.ts import insert. */
export const importLine = (i: MenuInputs): string =>
  `import { manifests as ${i.binding} } from '${menuPackage(i.folder)}';`;

/** apps/platform-web/src/menus.ts spread insert. */
export const spreadLine = (i: MenuInputs): string => `  ...${i.binding},`;

/** apps/platform-web/src/dev/mock-assembly.tsx `/mock` import insert. */
export const mockImportLine = (i: MenuInputs): string =>
  `import { ${i.group}Mock } from '${menuPackage(i.folder)}/mock';`;

/** apps/platform-web/src/dev/mock-assembly.tsx `MOCK_ENDPOINTS` spread insert. */
export const mockSpreadLine = (i: MenuInputs): string => `  ...${i.group}Mock,`;

/** apps/platform-web/src/style.css insert. */
export const styleLine = (i: MenuInputs): string => `@import "${menuPackage(i.folder)}/styles.css";`;

/** apps/platform-web/package.json dependency insert. */
export const depLine = (i: MenuInputs): string => `    "${menuPackage(i.folder)}": "workspace:*",`;

/** The eleven generated files, paths relative to `menus/<folder>/`. LF, trailing newline, UTF-8. */
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
  { relPath: 'src/endpoints.ts', content: endpointsTs(i) },
  { relPath: 'src/mock/index.ts', content: mockIndexTs(i) },
  { relPath: 'src/index.ts', content: indexTs(i) },
  { relPath: `src/pages/${i.page}.tsx`, content: pageTsx(i) },
  { relPath: 'src/manifest.test.ts', content: manifestTest(i) },
  { relPath: 'src/mock/index.test.ts', content: mockIndexTest(i) },
];

const SAMPLE_PAGE_INPUTS: MenuInputs = {
  group: 'sample', folder: 'sample', menuId: 'sample', page: 'Sample',
  path: '/sample', pageType: 'overview', labelKo: 'x', labelEn: 'x', binding: 'sample',
};

/** F5: identifiers the generated page imports — the component name must never collide with these. */
export function pageImportedIdentifiers(): string[] {
  const sf = ts.createSourceFile('page.tsx', pageTsx(SAMPLE_PAGE_INPUTS), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || stmt.importClause === undefined) continue;
    const clause = stmt.importClause;
    if (clause.name !== undefined) names.push(clause.name.text);
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) names.push(element.name.text);
    }
  }
  return names;
}

function packageJson(i: MenuInputs): string {
  const body = {
    name: menuPackage(i.folder),
    private: true,
    version: '0.0.0',
    type: 'module',
    exports: { '.': './src/index.ts', './mock': './src/mock/index.ts', './styles.css': './src/styles.css' },
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
    path: '${i.path}', icon: LayoutDashboard, permission: '${SCAFFOLD_PERMISSION}',
    requiresScope: false, context: none, pageType: '${i.pageType}', features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/${i.page}')),
  },
];
`;
}

export type Slot = { id: string; ko: string; en: string };

/**
 * 06 §12 content slots per archetype, English names as written there. Page Header and Global Context are shell
 * slots (§8) the shell already draws; Data Trust is listed for the archetypes that name it (12.1, 12.2).
 * Order is the archetype's reading order.
 */
export const PAGE_SLOTS: Record<PageType, readonly Slot[]> = {
  overview: [
    { id: 'summary', ko: '핵심 KPI·요약', en: 'Primary KPI / Summary' },
    { id: 'trend', ko: '주요 추이·상태', en: 'Main Trend or Status' },
    { id: 'attention', ko: '주의 목록', en: 'Attention List' },
    { id: 'trust', ko: '데이터 신뢰', en: 'Data Trust' },
  ],
  analysis: [
    { id: 'kpi', ko: 'KPI 요약', en: 'KPI Summary' },
    { id: 'chart', ko: '주 차트', en: 'Primary Chart' },
    { id: 'annotation', ko: '선택·주석', en: 'Selection / Annotation' },
    { id: 'breakdown', ko: '분해 표', en: 'Breakdown Table' },
    { id: 'trust', ko: '데이터 신뢰', en: 'Data Trust' },
  ],
  management: [
    { id: 'filter', ko: '검색·필터', en: 'Search + Filter' },
    { id: 'table', ko: '데이터 표', en: 'Data Table' },
    { id: 'actions', ko: '선택 작업', en: 'Selection Actions' },
    { id: 'drawer', ko: '상세 드로어', en: 'Detail Drawer' },
    { id: 'history', ko: '이력·감사', en: 'History / Audit' },
  ],
  catalog: [
    { id: 'list', ko: '목록', en: 'Catalog List' },
    { id: 'definition', ko: '정의 상세', en: 'Definition Detail' },
    { id: 'version', ko: '버전', en: 'Version' },
    { id: 'ownership', ko: '소유', en: 'Ownership' },
    { id: 'coverage', ko: '적용 범위', en: 'Coverage' },
    { id: 'usage', ko: '사용·의존', en: 'Usage / Dependency' },
    { id: 'history', ko: '이력', en: 'History' },
  ],
  workflow: [
    { id: 'queue', ko: '큐·목록', en: 'Queue/List' },
    { id: 'filter', ko: '상태·우선순위·담당 필터', en: 'Status/Priority/Owner Filter' },
    { id: 'detail', ko: '상세', en: 'Detail' },
    { id: 'timeline', ko: '타임라인', en: 'Timeline' },
    { id: 'comments', ko: '댓글', en: 'Comments' },
    { id: 'related', ko: '관련 Context', en: 'Related Context' },
  ],
};

const str = (text: string): string => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const slotsLiteral = (slots: readonly Slot[]): string =>
  slots.map(slot => `  { id: ${str(slot.id)}, ko: ${str(slot.ko)}, en: ${str(slot.en)} },`).join('\n');

function endpointsTs(i: MenuInputs): string {
  return `/** ${menuPackage(i.folder)} — ${i.group} group. Scaffold: one sample query endpoint, no domain data. */
import { defineEndpoint } from '${PACKAGE_PREFIX}contracts';

/** What the sample mock handler returns today; replace with the real data shape. */
export type SampleData = { ready: true };

export const sampleEndpoint = defineEndpoint<Record<never, true>, SampleData>({
  id: '${i.group}.sample',
  menuId: '${i.menuId}',
  paramKeys: {},
  permission: '${SCAFFOLD_PERMISSION}',
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
`;
}

function mockIndexTs(i: MenuInputs): string {
  return `/** Mock server half of the sample endpoint (${menuPackage(i.folder)}, #126). The app composition
 * root registers this list via '${menuPackage(i.folder)}/mock' → createMockAdapter({ endpoints, registry });
 * pages never import this module. */
import { defineMockEndpoint, type AnyMockEndpoint } from '${PACKAGE_PREFIX}mock-server';
import { sampleEndpoint } from '../endpoints';

export const ${i.group}Mock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(sampleEndpoint, { handle: () => ({ ready: true }) }),
];
`;
}

function pageTsx(i: MenuInputs): string {
  const layoutImport = i.pageType === 'management' ? ', ManagementLayout'
    : i.pageType === 'analysis' ? ', AnalysisLayout' : '';
  const usesLayoutSlots = i.pageType === 'management' || i.pageType === 'analysis';
  const slotHelpers = usesLayoutSlots ? `  const slotLabel = (id: typeof SLOTS[number]['id']) => {
    const slot = SLOTS.find(candidate => candidate.id === id);
    return slot ? (lang === 'ko' ? slot.ko : slot.en) : id;
  };
  const slotPlaceholder = (id: (typeof SLOTS)[number]['id']) => <section key={id} data-slot={id} className="rounded-lg border border-dashed border-border-subtle p-4">
    <h2 className="t-caption font-medium text-text-secondary">{slotLabel(id)}</h2>
  </section>;
` : '';
  const slotsMarkup = i.pageType === 'management' ? `      <ManagementLayout
        filter={<>{slotPlaceholder('filter')}{/* Replace Search + Filter with PageFilterBar orientation="column". */}</>}
        table={filterSlot => <>{filterSlot}{slotPlaceholder('table')}{/* Replace Data Table with PlatformDataTable. */}</>}
      />
      <div className="space-y-3">
        {slotPlaceholder('actions')}
        {/* Replace Selection Actions with PlatformDataTable selection actions. */}
        {slotPlaceholder('drawer')}
        {/* Replace Detail Drawer with DetailDrawer. */}
        {slotPlaceholder('history')}
        {/* Replace History / Audit with AuditTimeline. */}
      </div>`
    : i.pageType === 'analysis' ? `      <AnalysisLayout
        kpi={{ id: 'kpi', title: slotLabel('kpi'), node: <>{slotPlaceholder('kpi')}{/* Replace KPI Summary with StatCard. */}</> }}
        charts={[{ id: 'chart', title: slotLabel('chart'), node: <>{slotPlaceholder('chart')}{/* Replace Primary Chart with AnalysisChartFrame. */}{slotPlaceholder('annotation')}{/* Replace Selection / Annotation with AnalysisChartFrame. */}</> }]}
        breakdown={{ id: 'breakdown', title: slotLabel('breakdown'), node: <>{slotPlaceholder('breakdown')}{/* Replace Breakdown Table with PlatformDataTable. */}</> }}
      />
      <div className="space-y-3">
        {slotPlaceholder('trust')}
        {/* Replace Data Trust with DataTrustIndicator. */}
      </div>`
      : `      {SLOTS.map(slot => <section key={slot.id} data-slot={slot.id} className="rounded-lg border border-dashed border-border-subtle p-4">
        <h2 className="t-caption font-medium text-text-secondary">{lang === 'ko' ? slot.ko : slot.en}</h2>
      </section>)}`;
  return `import { useI18n, useMenuQuery } from '${PACKAGE_PREFIX}kernel';
import { PlatformPage, QueryView${layoutImport} } from '${PACKAGE_PREFIX}components';
import { sampleEndpoint } from '../endpoints';

// 06 §12 ${i.pageType} skeleton: content slots in reading order. Replace each section with the platform component it names.
const SLOTS = [
${slotsLiteral(PAGE_SLOTS[i.pageType])}
];

// The Screen suffix keeps the component name clear of the imports above (review F5).
export default function ${i.page}Screen() {
  const { lang } = useI18n();
  const query = useMenuQuery(sampleEndpoint, {});
  const caption = lang === 'ko' ? '${i.labelKo}' : '${i.labelEn}';
${slotHelpers}  return <PlatformPage>
    <QueryView query={query}>{() => <div className="space-y-3">
      <p className="t-caption text-text-muted">{caption}</p>
${slotsMarkup}
    </div>}</QueryView>
  </PlatformPage>;
}
`;
}

function manifestTest(i: MenuInputs): string {
  return `import { describe, expect, it } from 'vitest';
import type { SpaceDef } from '${PACKAGE_PREFIX}contracts';
import { createRegistry, type GroupDef } from '${PACKAGE_PREFIX}kernel';
import { manifests } from './index';
import { sampleEndpoint } from './endpoints';

describe('manifest', () => {
  it('is the only menu of its group and passes createRegistry', () => {
    expect(manifests).toHaveLength(1);
    const menu = manifests[0];
    expect(menu.primary).toBe(true);
    expect(menu.pageKeys).toEqual([]);
    expect(menu.pageType).toBe('${i.pageType}');
    expect(menu.group).toBe('${i.group}');
    const spaces: SpaceDef[] = [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, homeMenuId: menu.id }];
    const groups: GroupDef[] = [{ id: menu.group, label: { ko: 'g', en: 'g' }, icon: menu.icon, space: 'analytics' }];
    const registry = createRegistry({ spaces, groups, menus: manifests });
    expect(registry.menuById('${i.menuId}').path).toBe('${i.path}');
  });

  it('owns the sample endpoint (#126)', () => {
    expect(sampleEndpoint.menuId).toBe(manifests[0].id);
    expect(sampleEndpoint.id.startsWith('${i.group}.')).toBe(true);
  });
});
`;
}

function mockIndexTest(i: MenuInputs): string {
  return `import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiResponse, Capability, ContextKey, MenuMeta } from '${PACKAGE_PREFIX}contracts';
import { createMockAdapter, getRole, setRole } from '${PACKAGE_PREFIX}mock-server';
import { ${i.group}Mock } from './index';
import { sampleEndpoint } from '../endpoints';

/**
 * Minimal inline MenuMeta mirroring the ${str(i.menuId)} manifest in '../index.ts'
 * (permission, requiresScope, context). Importing '../index' from 'src/mock/**' is lint-banned,
 * so this test restates the registration-relevant fields the adapter validates against.
 * manifest('../index.ts')를 바꾸면 여기도 같이 바꾼다.
 */
const none: Record<ContextKey, Capability> = {
  time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported',
  lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported',
};
const sampleMenu: MenuMeta = {
  id: ${str(i.menuId)},
  group: '${i.group}',
  label: { ko: ${str(i.labelKo)}, en: ${str(i.labelEn)} },
  description: { ko: ${str(i.labelKo)}, en: ${str(i.labelEn)} },
  path: ${str(i.path)},
  permission: '${SCAFFOLD_PERMISSION}',
  requiresScope: false,
  context: none,
  pageType: '${i.pageType}',
  features: { export: false, savedView: false, annotate: false, compare: false },
  pageKeys: [],
};

const registry = { menus: [sampleMenu] };
const adapter = createMockAdapter({ endpoints: [...${i.group}Mock], registry });

const previousRole = getRole();
beforeEach(() => { setRole('viewer'); });
afterEach(() => { setRole(previousRole); });

describe('${i.group} mock registration', () => {
  it('registers the sample endpoint without error', () => {
    expect(() => createMockAdapter({ endpoints: [...${i.group}Mock], registry })).not.toThrow();
  });

  it('answers the sample menuQuery with ok', async () => {
    const result: ApiResponse<unknown> = await adapter.menuQuery({ endpoint: '${i.group}.sample', context: {}, params: {} });
    expect(result.outcome).toBe('ok');
    expect(result.data).toEqual({ ready: true });
  });
});
`;
}
