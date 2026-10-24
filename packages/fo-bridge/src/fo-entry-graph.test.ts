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

function walk() {
  const files = new Map<string, string>();
  const specifiers = new Set<string>();
  const unresolved: string[] = [];
  const queue = [...ENTRIES];
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

const { files, specifiers, unresolved } = walk();
const reached = [...files.keys()].map(file => relative(FRONTEND_SRC, file));

const EAGER_MODULES = ['notifications-slot.tsx', 'voc-compose-slot.tsx', 'home-todo-slot.tsx', 'fo/FoBridge.tsx', 'fo/session.ts'];
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
