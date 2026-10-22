// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * What the bridge may reach inside FeedbackOps (platform ADR-0071): the entry's whole import graph (static, type,
 * re-export and dynamic specifiers) has no router, no login/session shell, no second network path. Source scan, no bundler.
 */
const FO = fileURLToPath(new URL('../../../../products/feedbackops', import.meta.url));
const FRONTEND_SRC = join(FO, 'apps/frontend/src');
const ENTRY = join(FRONTEND_SRC, 'global-screens/index.ts');
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
  const queue = [ENTRY];
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

describe('FeedbackOps bridge entry graph (ADR-0071)', () => {
  it('reaches the InboxPanel', () => {
    expect(reached).toContain('features/home/InboxPanel.tsx');
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
