// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * What the bridge may reach inside FeedbackOps (platform ADR-0071): the entry's whole import graph (static, type,
 * re-export and dynamic specifiers) has no router, no login/session shell, no second network path. Source scan, no bundler.
 */
const FO = fileURLToPath(new URL('../../../products/feedbackops', import.meta.url));
const FRONTEND_SRC = join(FO, 'apps/frontend/src');
const ENTRIES = [join(FRONTEND_SRC, 'global-screens/index.ts'), join(FRONTEND_SRC, 'global-screens/core.ts'), join(FRONTEND_SRC, 'operator-screens/scope-picker/index.ts')];
const DASHBOARD_ENTRY = join(FRONTEND_SRC, 'operator-screens/dashboard/index.ts');
const PACKAGE_ENTRIES: Record<string, string> = {
  '@fops/ui': join(FO, 'packages/ui/src/index.ts'),
  '@fops/shared': join(FO, 'packages/shared/src/index.ts'),
};
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

/** Like the project resolver: a `.js`/`.jsx` specifier names its `.ts`/`.tsx` source (FeedbackOps shared re-exports spell `.js`). */
function resolveFile(base: string): string | null {
  const stem = base.replace(/\.jsx?$/, '');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${stem}.ts`, `${stem}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function walk(entries: string[]) {
  const files = new Map<string, string>();
  const specifiers = new Set<string>();
  const unresolved: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    files.set(file, text);
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      specifiers.add(specifier!);
      let target: string | null = null;
      if (specifier!.startsWith('@/')) target = resolveFile(join(FRONTEND_SRC, specifier!.slice(2)));
      else if (specifier!.startsWith('.')) target = resolveFile(resolve(dirname(file), specifier!));
      else if (specifier! in PACKAGE_ENTRIES) target = PACKAGE_ENTRIES[specifier!]!;
      if (target !== null) queue.push(target);
      else if (specifier!.startsWith('@/') || specifier!.startsWith('.')) unresolved.push(`${relative(FO, file)} -> ${specifier}`);
    }
  }
  return { files, specifiers, unresolved };
}

const { files, specifiers, unresolved } = walk(ENTRIES);
const reached = [...files.keys()].map(file => relative(FRONTEND_SRC, file));

const EAGER_MODULES = ['notifications-slot.tsx', 'voc-compose-slot.tsx', 'home-todo-slot.tsx', 'scope-control.tsx', 'fo/FoBridge.tsx', 'fo/session.ts'];
const FOPS_FRONTEND_IMPORT = /\bimport\s+(?!type\b)[^;]*?from\s*['"]@fops\/frontend/;
const FULL_ENTRY_IMPORT = /\bimport\s+(?!type\b)[^;]*?from\s*['"]@fops\/frontend\/global-screens['"]/;

describe('FeedbackOps bridge entry graph (ADR-0071)', () => {
  it.each(EAGER_MODULES)('keeps the eagerly loaded %s off the screen barrel (main chunk)', file => {
    const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
    // An entry that imports FeedbackOps at all imports only the `core` subset; `voc-compose-slot.tsx` imports none (it lazy-loads its page).
    if (FOPS_FRONTEND_IMPORT.test(text)) expect(text).toMatch(/from\s*['"]@fops\/frontend\/global-screens\/core['"]/);
    expect(FULL_ENTRY_IMPORT.test(text)).toBe(false);
  });

  it('reaches the 목록 범위 picker and its bridge-safe reads', () => {
    expect(reached).toEqual(expect.arrayContaining(['operator-screens/scope-picker/ManagedSystemScopeControl.tsx', 'lib/api/me.ts', 'lib/api/permission-reads.ts', 'lib/api/registry-reads.ts']));
  });

  it('reaches the InboxPanel', () => {
    expect(reached).toContain('features/home/InboxPanel.tsx');
  });

  it('reaches the home 내 할 일 panel', () => {
    expect(reached).toContain('features/home/todo/HomeTodoPanel.tsx');
  });

  it('reaches the survey screens and their hooks', () => {
    expect(reached).toEqual(expect.arrayContaining(['features/surveys/components/participation/SurveyParticipationScreens.tsx', 'features/surveys/hooks/useSurveys.ts']));
  });

  it('reaches the reporter VOC screens and not the operator inbox or detail panel', () => {
    expect(reached).toEqual(expect.arrayContaining(['features/voc/components/reporter/MyVocListScreen.tsx', 'features/voc/components/reporter/ReporterVocDetail.tsx']));
    expect(reached.filter(file => /^features\/voc\/(routes\/|components\/(list\/VocList\.tsx|detail\/(VocDetailPanel|FullDetailView)\.tsx))/.test(file))).toEqual([]);
  });

  it('reaches the VOC compose screen and none of the standalone create screen, the router, the reporter card or the similar-VOC panels', () => {
    expect(reached).toContain('features/voc/components/compose/VocComposeScreen.tsx');
    expect(reached.filter(file => /^features\/voc\/components\/create\/(VocCreateScreen|ReporterCard|SemanticVocPanel|SimilarVocPanel|useVocCreateController)\.tsx?$/.test(file))).toEqual([]);
    expect(reached.filter(file => /^lib\/(auth\/|api\/(managed-systems|analytics-areas)\.ts$)/.test(file))).toEqual([]);
  });

  it('reaches the permission requests page and its bridge-safe api module, not the standalone permissions api', () => {
    expect(reached).toEqual(expect.arrayContaining(['features/home/permission-requests/PermissionRequestsScreen.tsx', 'lib/api/permission-requests.ts']));
    expect(reached).not.toContain('lib/api/permissions.ts');
  });

  it('resolves every local import edge and walks past the package barrels', () => {
    expect(unresolved).toEqual([]);
    expect(files.size).toBeGreaterThan(60);
    expect([...files.keys()].map(file => relative(FO, file))).toContain('packages/shared/src/notifications.ts');
  });

  it('imports no router', () => {
    expect([...specifiers].filter(specifier => /^@tanstack\/(react-)?router/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source and neither the auth module nor the api barrel', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index)\.ts$/;
    expect(reached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator dashboard entry (#759) is walked on its own: it has no sonner either, which the screen barrel's graph does.
describe('FeedbackOps operator dashboard entry graph (ADR-0071)', () => {
  const dashboard = walk([DASHBOARD_ENTRY]);
  const dashboardReached = [...dashboard.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the dashboard, its bridge-safe reads and not the standalone HomeScreen', () => {
    expect(dashboardReached).toEqual(
      expect.arrayContaining(['features/home/DashboardScreen.tsx', 'lib/api/me.ts', 'lib/api/dashboard.ts', 'lib/api/tasks.ts', 'lib/api/task-requests.ts']),
    );
    expect(dashboardReached).not.toContain('features/home/HomeScreen.tsx');
    expect(dashboard.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...dashboard.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$/;
    expect(dashboardReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...dashboard.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The shared pieces no screen node owns (#761 h2) are walked one by one as their own roots: each must stay bridge-safe
// whichever screen reaches it. `lib/router/document-title.tsx` keeps `useRouterState`; its pure formatter lives in lib/host.
describe('FeedbackOps shared bridge pieces (ADR-0071)', () => {
  const PIECES = [
    'lib/attachments/useAttachmentUploadQueue.ts',
    'lib/cross-system/analyticsAreasCatalog.ts',
    'features/findings/hooks/useFindingsList.ts',
    'features/admin/permissions/request-access-button.tsx',
    'features/admin/permissions/permission-requests-search.ts',
    'components/MyVocsRecoveryLink.tsx',
    'features/voc/components/create/AttachmentDropzone.tsx',
    'features/cross-system/create-finding/CreateFindingModal.tsx',
    'features/cross-system/request-task/TaskRequestDraftCard.tsx',
    'features/cross-system/progress-notes/ProgressNotesComposer.tsx',
    'lib/host/document-title-format.ts',
  ];
  const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index)\.ts$/;

  it.each(PIECES)('%s reaches no router, route, layout, auth, api barrel, second fetch or sonner', piece => {
    const piecePath = join(FRONTEND_SRC, piece);
    expect(existsSync(piecePath)).toBe(true);
    const walked = walk([piecePath]);
    const paths = [...walked.files.keys()].map(file => relative(FRONTEND_SRC, file));
    expect(walked.unresolved).toEqual([]);
    expect(paths.filter(file => banned.test(file))).toEqual([]);
    expect([...walked.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
    const callers = [...walked.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers.filter(file => file !== 'lib/api/client.ts')).toEqual([]);
  });
});

// The operator VOC clusters entry (#761 c) is walked on its own: list screen, create dialog and detail parts, no router
// and no toast library (notices go through the host seam).
describe('FeedbackOps operator VOC clusters entry graph (ADR-0071)', () => {
  const clusters = walk([join(FRONTEND_SRC, 'operator-screens/voc-clusters/index.ts')]);
  const clustersReached = [...clusters.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the list screen, the create dialog and the detail parts, not the routes', () => {
    expect(clustersReached).toEqual(
      expect.arrayContaining([
        'features/voc-cluster/components/ClusterListScreen.tsx',
        'features/voc-cluster/components/modals/CreateClusterModal.tsx',
        'features/voc-cluster/components/detail/VocClusterDetailPanel.tsx',
        'lib/api/permission-reads.ts',
        'lib/api/registry-reads.ts',
      ]),
    );
    expect(clustersReached.filter(file => file.startsWith('routes/'))).toEqual([]);
    expect(clusters.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...clusters.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$/;
    expect(clustersReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...clusters.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});
