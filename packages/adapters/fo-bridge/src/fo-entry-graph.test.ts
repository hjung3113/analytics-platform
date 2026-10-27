// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * What the bridge may reach inside FeedbackOps (platform ADR-0071): the entry's whole import graph (static, type,
 * re-export and dynamic specifiers) has no router, no login/session shell, no second network path. Source scan, no bundler.
 */
const FO = fileURLToPath(new URL('../../../..', import.meta.url));
const FRONTEND_SRC = join(FO, 'apps/fo-frontend/src');
const INBOX_PANEL_ENTRY = join(FRONTEND_SRC, 'global-screens/inbox-panel.ts');
const ENTRIES = [join(FRONTEND_SRC, 'global-screens/index.ts'), join(FRONTEND_SRC, 'global-screens/core.ts'), INBOX_PANEL_ENTRY, join(FRONTEND_SRC, 'operator-screens/scope-picker/index.ts')];
const DASHBOARD_ENTRY = join(FRONTEND_SRC, 'operator-screens/dashboard/index.ts');
const VOC_DETAIL_ENTRY = join(FRONTEND_SRC, 'operator-screens/voc-detail/index.ts');
const TASK_DETAIL_ENTRY = join(FRONTEND_SRC, 'operator-screens/task-detail/index.ts');
const FINDING_DETAIL_ENTRY = join(FRONTEND_SRC, 'operator-screens/finding-detail/index.ts');
const PACKAGE_ENTRIES: Record<string, string> = {
  '@fops/ui': join(FO, 'packages/fo-ui/src/index.ts'),
  '@fops/shared': join(FO, 'packages/fo-shared/src/index.ts'),
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

const EAGER_MODULES = ['notifications-slot.tsx', 'voc-compose-slot.tsx', 'home-todo-slot.tsx', 'scope-control.tsx', 'nav-counts.tsx', 'saved-views.tsx', 'fo/FoBridge.tsx', 'fo/session.ts'];
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

  it('reaches the InboxPanel through its own entry, which the eager core subset does not reach', () => {
    expect(reached).toContain('features/home/InboxPanel.tsx');
    expect(walk([join(FRONTEND_SRC, 'global-screens/inbox-panel.ts')]).files.has(join(FRONTEND_SRC, 'features/home/InboxPanel.tsx'))).toBe(true);
    const core = [...walk([join(FRONTEND_SRC, 'global-screens/core.ts')]).files.keys()].map(file => relative(FRONTEND_SRC, file));
    expect(core).not.toContain('features/home/InboxPanel.tsx');
  });

  it('keeps the notifications slot off the InboxPanel entry (its page loads it lazily)', () => {
    const slot = readFileSync(fileURLToPath(new URL('notifications-slot.tsx', import.meta.url)), 'utf8');
    expect(slot).not.toMatch(/inbox-panel|InboxPanel/);
    expect(slot).toMatch(/lazy\(\(\) => import\('\.\/pages\/RecentInbox'\)\)/);
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
    expect([...files.keys()].map(file => relative(FO, file))).toContain('packages/fo-shared/src/notifications.ts');
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

// The operator VOC detail entry (#761 v) is walked on its own: the detail tree renders inside the bridge, so it has no router,
// no sonner and no `lib/auth`; its moves and notices go through the host seam.
describe('FeedbackOps operator VOC detail entry graph (ADR-0071)', () => {
  const detail = walk([VOC_DETAIL_ENTRY]);
  const detailReached = [...detail.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the detail parts hook and body, not the standalone panel, its frame or the inbox route', () => {
    expect(detailReached).toEqual(
      expect.arrayContaining(['features/voc/components/detail/useVocDetailParts.tsx', 'features/voc/components/detail/VocDetailBody.tsx', 'lib/host/host-seam.tsx']),
    );
    expect(detailReached).not.toContain('features/voc/components/detail/VocDetailPanel.tsx');
    expect(detailReached.filter(file => /^features\/voc\/(routes\/|components\/list\/)/.test(file))).toEqual([]);
    expect(detail.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...detail.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(detailReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...detail.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator Task detail entry (#763 d) is walked on its own, with the same rules as the VOC detail entry.
describe('FeedbackOps operator Task detail entry graph (ADR-0071)', () => {
  const detail = walk([TASK_DETAIL_ENTRY]);
  const detailReached = [...detail.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the detail parts hook, not the standalone panel or the task routes', () => {
    expect(detailReached).toEqual(expect.arrayContaining(['features/tasks/components/TaskDetailParts.tsx', 'lib/host/host-seam.tsx']));
    expect(detailReached).not.toContain('features/tasks/components/TaskDetailPanel.tsx');
    expect(detailReached.filter(file => /^features\/tasks\/routes\//.test(file))).toEqual([]);
    expect(detail.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...detail.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(detailReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...detail.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator Finding detail entry (#762 d) is walked on its own, with the same rules as the Task detail entry.
describe('FeedbackOps operator Finding detail entry graph (ADR-0071)', () => {
  const detail = walk([FINDING_DETAIL_ENTRY]);
  const detailReached = [...detail.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the detail parts hook, its body, the Request Task host and the controller, not the standalone panel, the public edge or the routes', () => {
    expect(detailReached).toEqual(
      expect.arrayContaining([
        'features/findings/components/FindingDetail/FindingDetailParts.tsx',
        'features/findings/components/FindingDetail/FullFindingDetail.tsx',
        'features/findings/components/FindingDetail/FindingRequestTaskDraftHost.tsx',
        'features/findings/components/FindingDetail/useFindingDetailController.ts',
        'lib/host/host-seam.tsx',
      ]),
    );
    expect(detailReached).not.toContain('features/findings/components/FindingDetail/FindingDetailPanel.tsx');
    expect(detailReached).not.toContain('features/findings/public.ts');
    expect(detailReached.filter(file => /^(?:features\/findings\/)?routes\//.test(file))).toEqual([]);
    expect(detail.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...detail.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(detailReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...detail.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
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
    'features/admin/permissions/permission-requests-schema.ts',
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

// The operator VOC inbox entry (#761 i) is walked on its own: the host renders the detail, so the VOC detail tree stays out.
describe('FeedbackOps operator VOC inbox entry graph (ADR-0071)', () => {
  const inbox = walk([join(FRONTEND_SRC, 'operator-screens/voc-inbox/index.ts')]);
  const inboxReached = [...inbox.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the inbox screen, its list and not the detail tree, the standalone shell or the triage and create routes', () => {
    expect(inboxReached).toEqual(expect.arrayContaining(['features/voc/routes/InboxScreen.tsx', 'features/voc/components/list/VocList.tsx', 'lib/cross-system/usePermissionCheckBridge.ts']));
    expect(inboxReached.filter(file => /^features\/voc\/components\/detail\//.test(file))).toEqual([]);
    expect(inboxReached.filter(file => /^features\/voc\/routes\/(VocRouteShell|CreateRoute|TriageRoute)\.tsx$/.test(file))).toEqual([]);
    expect(inbox.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...inbox.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(inboxReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...inbox.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator Milestones entry (#763 m) is walked on its own: the host frames the detail and create parts, and the standalone route stays out.
describe('FeedbackOps operator Milestones entry graph (ADR-0071)', () => {
  const milestones = walk([join(FRONTEND_SRC, 'operator-screens/milestones/index.ts')]);
  const milestonesReached = [...milestones.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the source section and the host seam, and not the standalone route or anything under routes/', () => {
    expect(milestonesReached).toEqual(expect.arrayContaining(['features/tasks/routes/MilestonesScreen.tsx', 'features/tasks/components/milestone-detail/MilestoneSourceSection.tsx', 'lib/host/host-seam.tsx']));
    expect(milestonesReached).not.toContain('features/tasks/routes/MilestonesRoute.tsx');
    expect(milestonesReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(milestones.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...milestones.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(milestonesReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...milestones.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator Task list entry (#763 l) is walked on its own: the host renders the detail, so the Task detail tree stays out.
describe('FeedbackOps operator Task list entry graph (ADR-0071)', () => {
  const taskList = walk([join(FRONTEND_SRC, 'operator-screens/task-list/index.ts')]);
  const taskListReached = [...taskList.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the list screen, its selection hook and the bridge me read, not the Task detail tree or the standalone route', () => {
    expect(taskListReached).toEqual(expect.arrayContaining(['features/tasks/routes/TaskListScreen.tsx', 'features/tasks/hooks/useTaskPanelSelection.ts', 'lib/api/me.ts']));
    expect(taskListReached.filter(file => /^features\/tasks\/components\/(TaskDetailPanel|TaskDetailParts|ResponsibilityEditor|TaskMilestoneEditor)/.test(file))).toEqual([]);
    expect(taskListReached).not.toContain('features/tasks/routes/TaskListRoute.tsx');
    expect(taskList.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...taskList.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(taskListReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...taskList.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The operator Task board entry (#763 b) is walked on its own: the host renders the detail, so the Task detail tree stays out.
describe('FeedbackOps operator Task board entry graph (ADR-0071)', () => {
  const taskBoard = walk([join(FRONTEND_SRC, 'operator-screens/task-board/index.ts')]);
  const taskBoardReached = [...taskBoard.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the board screen, the status transition and the host seam, not the Task detail tree or the standalone route', () => {
    expect(taskBoardReached).toEqual(expect.arrayContaining(['features/tasks/routes/TaskBoardScreen.tsx', 'features/tasks/hooks/useTaskStatusTransition.ts', 'lib/host/host-seam.tsx']));
    expect(taskBoardReached.filter(file => /^features\/tasks\/components\/(TaskDetailPanel|TaskDetailParts|ResponsibilityEditor|TaskMilestoneEditor)/.test(file))).toEqual([]);
    expect(taskBoardReached).not.toContain('routes/TaskBoardRoute.tsx');
    expect(taskBoardReached).not.toContain('features/tasks/routes/TaskBoardRoute.tsx');
    expect(taskBoard.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...taskBoard.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(taskBoardReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...taskBoard.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The VOC triage entry (#761 t) is walked on its own: it has no sonner or router, which the screen barrel's graph does.
describe('FeedbackOps VOC triage entry graph (ADR-0071)', () => {
  const triage = walk([join(FRONTEND_SRC, 'operator-screens/voc-triage/index.ts')]);
  const triageReached = [...triage.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the triage screen and its bridge-safe reads, not the route shell', () => {
    expect(triageReached).toEqual(
      expect.arrayContaining(['features/voc/components/triage/TriageScreen.tsx', 'features/voc/components/triage/TriagePanel.tsx', 'lib/api/me.ts', 'lib/api/nav.ts', 'lib/api/permission-reads.ts']),
    );
    expect(triageReached.filter(file => /^features\/voc\/routes\/(TriageRoute|VocRouteShell)\.tsx$/.test(file))).toEqual([]);
    expect(triage.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...triage.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel or the raw-fetch permissions api', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions)\.ts$/;
    expect(triageReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...triage.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

// The VOC search entry (#761 p1) is the schema pieces only: a host asks it before mounting, so it must stay tiny and bridge-safe.
describe('FeedbackOps VOC search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/voc-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schema and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(expect.arrayContaining(['features/voc/routes/voc-search.ts', 'lib/host/search-fields.ts']));
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

// The Task search entry (#763 s) is the same shape as the VOC one: schema pieces only, bridge-safe.
describe('FeedbackOps Task search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/tasks-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schema and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(expect.arrayContaining(['features/tasks/routes/task-search.ts', 'lib/host/search-fields.ts']));
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

// The Findings and 연동 search entries (#762 s) are the same shape: schema pieces only, bridge-safe.
describe('FeedbackOps Findings search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/findings-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schema and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(
      expect.arrayContaining(['features/findings/routes/findings-search.ts', 'features/voc/routes/voc-search.ts', 'lib/host/search-fields.ts']),
    );
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

describe('FeedbackOps Surveys search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/surveys-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schemas and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(expect.arrayContaining(['features/surveys/routes/surveys-search.ts', 'lib/host/search-fields.ts']));
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

describe('FeedbackOps Admin search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/admin-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schemas and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(
      expect.arrayContaining([
        'features/admin/analytics-areas/search.ts',
        'features/admin/permissions/permission-grants-search.ts',
        'features/admin/permissions/permission-requests-schema.ts',
        'lib/host/search-fields.ts',
      ]),
    );
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

describe('FeedbackOps 연동 search entry graph (ADR-0071 decision 9)', () => {
  const search = walk([join(FRONTEND_SRC, 'operator-screens/integration-search/index.ts')]);
  const searchReached = [...search.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the search schemas and no screen, router, layout, auth source or api module', () => {
    expect(searchReached).toEqual(expect.arrayContaining(['features/integration/routes/integration-search.ts', 'lib/host/search-fields.ts']));
    expect(searchReached.filter(file => /^(?:routes|lib\/router|lib\/layout|lib\/auth|lib\/api)\/|\.tsx$/.test(file))).toEqual([]);
    expect(search.unresolved).toEqual([]);
    expect([...search.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });
});

// The Task Request hooks (#763 q1) notify, navigate and link through the host seam, so the later Task Requests screen can run in the
// bridge: each hook is walked as its own root.
describe('FeedbackOps Task Request hooks graph (ADR-0071)', () => {
  const ROOTS = [
    'useTaskRequestDecision.ts',
    'useTaskRequestConversion.ts',
    'useTaskRequestLink.ts',
    'useTaskRequestsQueue.ts',
    'TaskRequestLinkedTask.tsx',
    'useTaskRequestConvertedTaskLink.ts',
    'useTaskRequestPanelController.ts',
  ].map(file => join(FRONTEND_SRC, 'features/tasks/routes/task-requests', file));
  const hooks = walk(ROOTS);
  const hooksReached = [...hooks.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches no route, router, layout, auth source, api barrel, auth or permissions api, or findings public entry', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(hooks.unresolved).toEqual([]);
    expect(hooksReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...hooks.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...hooks.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Task Requests entry graph (ADR-0071)', () => {
  const requests = walk([join(FRONTEND_SRC, 'operator-screens/task-requests/index.ts')]);
  const requestsReached = [...requests.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the panel parts and the host seam, and not the standalone route or anything under routes/', () => {
    expect(requestsReached).toEqual(expect.arrayContaining(['features/tasks/routes/TaskRequestsScreen.tsx', 'features/tasks/routes/task-requests/TaskRequestPanelParts.tsx', 'lib/host/host-seam.tsx']));
    expect(requestsReached).not.toContain('features/tasks/routes/TaskRequestsRoute.tsx');
    expect(requestsReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(requests.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...requests.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings public surface', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(requestsReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...requests.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Evidence entry graph (ADR-0071)', () => {
  const evidence = walk([join(FRONTEND_SRC, 'operator-screens/evidence/index.ts')]);
  const evidenceReached = [...evidence.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the panel parts, the host seam and the bridge-safe me read, and not the standalone route, anything under routes/ or InternalLink', () => {
    expect(evidenceReached).toEqual(expect.arrayContaining(['features/integration/routes/EvidenceScreen.tsx', 'features/integration/components/EvidencePanel.tsx', 'lib/host/host-seam.tsx', 'lib/api/me.ts']));
    expect(evidenceReached).not.toContain('features/integration/routes/EvidenceRoute.tsx');
    expect(evidenceReached).not.toContain('lib/router/InternalLink.tsx');
    expect(evidenceReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(evidence.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...evidence.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings public surface', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(evidenceReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...evidence.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Coverage entry graph (ADR-0071)', () => {
  const coverage = walk([join(FRONTEND_SRC, 'operator-screens/coverage/index.ts')]);
  const coverageReached = [...coverage.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the area-report table, the bridge permission check and the host seam, and not the standalone route or anything under routes/', () => {
    expect(coverageReached).toEqual(expect.arrayContaining(['features/integration/routes/CoverageScreen.tsx', 'features/integration/components/AnalyticsAreaReportTable.tsx', 'lib/cross-system/usePermissionCheckBridge.ts', 'lib/host/host-seam.tsx']));
    expect(coverageReached).not.toContain('features/integration/routes/CoverageRoute.tsx');
    expect(coverageReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(coverage.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...coverage.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(coverageReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...coverage.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator entity links entry graph (ADR-0071)', () => {
  const links = walk([join(FRONTEND_SRC, 'operator-screens/entity-links/index.ts')]);
  const linksReached = [...links.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the inventory table, the inventory hook and the host seam, and not the standalone route or anything under routes/', () => {
    expect(linksReached).toEqual(expect.arrayContaining(['features/integration/routes/LinksScreen.tsx', 'features/integration/components/EntityLinksInventoryTable.tsx', 'features/integration/hooks/useEntityLinkInventory.ts']));
    expect(linksReached).not.toContain('features/integration/routes/LinksRoute.tsx');
    expect(linksReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(links.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...links.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(linksReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...links.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Findings list entry graph (ADR-0071)', () => {
  const findings = walk([join(FRONTEND_SRC, 'operator-screens/findings/index.ts')]);
  const findingsReached = [...findings.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the list hook and the host seam, and not the Finding detail tree or anything under routes/', () => {
    expect(findingsReached).toEqual(expect.arrayContaining(['features/findings/routes/FindingsScreen.tsx', 'features/findings/hooks/useFindingsList.ts', 'lib/host/host-seam.tsx']));
    expect(findingsReached.filter(file => file.startsWith('features/findings/components/FindingDetail/'))).toEqual([]);
    expect(findingsReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(findings.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...findings.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings public surface', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(findingsReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...findings.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Surveys list entry graph (ADR-0071)', () => {
  const surveys = walk([join(FRONTEND_SRC, 'operator-screens/surveys/index.ts')]);
  const surveysReached = [...surveys.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the list component and the host seam, and not the Survey detail tree or anything under routes/', () => {
    expect(surveysReached).toEqual(expect.arrayContaining(['features/surveys/routes/SurveysScreen.tsx', 'features/surveys/components/list/SurveyListScreen.tsx', 'lib/host/host-seam.tsx']));
    expect(surveysReached.filter(file => file.startsWith('features/surveys/components/detail/'))).toEqual([]);
    expect(surveysReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(surveys.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...surveys.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(surveysReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...surveys.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Survey builder entry graph (ADR-0071)', () => {
  const builder = walk([join(FRONTEND_SRC, 'operator-screens/survey-builder/index.ts')]);
  const builderReached = [...builder.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the builder and the host seam, and not the Survey detail tree or anything under routes/', () => {
    expect(builderReached).toEqual(expect.arrayContaining(['features/surveys/routes/SurveyBuilderScreen.tsx', 'features/surveys/components/builder/SurveyBuilder.tsx', 'lib/host/host-seam.tsx']));
    expect(builderReached.filter(file => file.startsWith('features/surveys/components/detail/'))).toEqual([]);
    expect(builderReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(builder.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...builder.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(builderReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...builder.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Survey detail entry graph (ADR-0071)', () => {
  const detail = walk([join(FRONTEND_SRC, 'operator-screens/survey-detail/index.ts')]);
  const detailReached = [...detail.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the detail parts hook and the host seam, not the standalone aside or the routes', () => {
    expect(detailReached).toEqual(expect.arrayContaining(['features/surveys/components/detail/SurveyDetailParts.tsx', 'lib/host/host-seam.tsx']));
    expect(detailReached).not.toContain('features/surveys/components/detail/SurveyDetail.tsx');
    expect(detailReached.filter(file => /^(?:features\/surveys\/)?routes\//.test(file) && file !== 'features/surveys/routes/SurveyPermissionGate.ts')).toEqual([]);
    expect(detail.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...detail.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api or the standalone permission check', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$/;
    expect(detailReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...detail.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Survey results entry graph (ADR-0071)', () => {
  const surveyResults = walk([join(FRONTEND_SRC, 'operator-screens/survey-results/index.ts')]);
  const surveyResultsReached = [...surveyResults.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen and the host seam, not the findings barrel, the standalone routes or anything under routes/', () => {
    expect(surveyResultsReached).toEqual(expect.arrayContaining(['features/surveys/routes/SurveyResultsScreen.tsx', 'features/surveys/components/results/SurveyResultsSummary.tsx', 'lib/host/host-seam.tsx']));
    expect(surveyResultsReached).not.toContain('features/findings/public.ts');
    expect(surveyResultsReached.filter(file => /^(?:features\/surveys\/)?routes\//.test(file) && file !== 'features/surveys/routes/SurveyPermissionGate.ts' && file !== 'features/surveys/routes/SurveyResultsScreen.tsx')).toEqual([]);
    expect(surveyResults.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...surveyResults.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings barrel', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(surveyResultsReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...surveyResults.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator Survey follow-up entry graph (ADR-0071)', () => {
  const surveyFollowUp = walk([join(FRONTEND_SRC, 'operator-screens/survey-follow-up/index.ts')]);
  const surveyFollowUpReached = [...surveyFollowUp.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen and the host seam, not the findings barrel, the standalone routes or anything under routes/', () => {
    expect(surveyFollowUpReached).toEqual(expect.arrayContaining(['features/surveys/routes/SurveyFollowUpScreen.tsx', 'features/surveys/components/results/OutcomeFollowUpReview.tsx', 'lib/host/host-seam.tsx']));
    expect(surveyFollowUpReached).not.toContain('features/findings/public.ts');
    expect(surveyFollowUpReached.filter(file => /^(?:features\/surveys\/)?routes\//.test(file) && file !== 'features/surveys/routes/SurveyPermissionGate.ts' && file !== 'features/surveys/routes/SurveyFollowUpScreen.tsx')).toEqual([]);
    expect(surveyFollowUp.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...surveyFollowUp.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings barrel', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(surveyFollowUpReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...surveyFollowUp.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});

describe('FeedbackOps operator integration dashboard entry graph (ADR-0071)', () => {
  const integrationDashboard = walk([join(FRONTEND_SRC, 'operator-screens/integration-dashboard/index.ts')]);
  const integrationDashboardReached = [...integrationDashboard.files.keys()].map(file => relative(FRONTEND_SRC, file));

  it('reaches the screen, the router-free queue core, the recovery panel parts and the me read, and not the router-bound queue, the standalone route or anything under routes/', () => {
    expect(integrationDashboardReached).toEqual(
      expect.arrayContaining([
        'features/integration/routes/IntegrationDashboardScreen.tsx',
        'features/integration/recovery/useRecoveryQueueCore.tsx',
        'features/integration/recovery/RecoveryPanel.tsx',
        'lib/api/me.ts',
      ]),
    );
    expect(integrationDashboardReached).not.toContain('features/integration/recovery/useRecoveryQueue.tsx');
    expect(integrationDashboardReached).not.toContain('features/integration/routes/IntegrationDashboardRoute.tsx');
    expect(integrationDashboardReached.filter(file => /^routes\//.test(file))).toEqual([]);
    expect(integrationDashboard.unresolved).toEqual([]);
  });

  it('imports no router and no toast library', () => {
    expect([...integrationDashboard.specifiers].filter(specifier => /^@tanstack\/(react-)?router|^sonner$/.test(specifier))).toEqual([]);
  });

  it('reaches no route, router, layout or auth source, the auth module, the api barrel, the permissions or managed-systems api, the standalone permission check or the findings public surface', () => {
    const banned = /^(?:routes|lib\/router|lib\/layout|lib\/auth)\/|^lib\/api\/(?:auth|index|permissions|managed-systems)\.ts$|^lib\/cross-system\/usePermissionCheck\.ts$|^features\/findings\/public\.ts$/;
    expect(integrationDashboardReached.filter(file => banned.test(file))).toEqual([]);
  });

  it('calls fetch only in lib/api/client.ts', () => {
    const callers = [...integrationDashboard.files].filter(([, text]) => /(?<![\w.])fetch\(/.test(text)).map(([file]) => relative(FRONTEND_SRC, file));
    expect(callers).toEqual(['lib/api/client.ts']);
  });
});
