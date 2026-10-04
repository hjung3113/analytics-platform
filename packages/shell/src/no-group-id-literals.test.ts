import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// #201: the shell never special-cases a Registry group by id — display rules come from GroupDef declarations
// (packages/shell/AGENTS.md "특정 메뉴 id를 코드에 쓰지 않는다"). This scans every non-test shell source file for a
// string or template literal equal to a GroupId member, whatever the syntax (===, switch, includes, filter callbacks).
// vitest (package script and turbo) runs from the package root; import.meta.url is not a file path under jsdom.
const here = join(process.cwd(), 'src');
const contracts = readFileSync(join(process.cwd(), '../contracts/src/menu.ts'), 'utf8');

function groupIds(source: string): string[] {
  const line = source.split('\n').find(l => l.startsWith('export type GroupId ='));
  if (line === undefined) throw new Error('GroupId union not found in @ap/contracts menu.ts');
  return [...line.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function shellSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shellSources(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && entry.name !== 'test-setup.ts' ? [path] : [];
  });
}

export function groupIdLiterals(code: string, ids: readonly string[]): string[] {
  const file = ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ids.includes(node.text)) found.push(node.text);
    if (ts.isTemplateExpression(node)) [node.head, ...node.templateSpans.map(s => s.literal)].forEach(part => { if (ids.includes(part.text)) found.push(part.text); });
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('shell source has no Registry group id literals (#201)', () => {
  const ids = groupIds(contracts);

  it('reads the GroupId union', () => {
    expect(ids).toContain('overview');
    expect(ids.length).toBeGreaterThanOrEqual(7);
  });

  it('catches the forms a narrow lint rule would miss', () => {
    for (const code of [
      "registry.groups.filter(g => g.id === 'overview')",
      "visibleMenus.filter(m => m.group === 'overview')",
      "group?.id === 'overview'",
      "switch (group.id) { case 'overview': break; }",
      "['overview'].includes(group.id)",
      'group.id === `overview`',
      "registry.groupById('overview')",
    ]) expect(groupIdLiterals(code, ids), code).toEqual(['overview']);
    expect(groupIdLiterals('const label = `${group.id}`;', ids)).toEqual([]);
  });

  it('finds none in any non-test shell file', () => {
    const offenders = shellSources(here).flatMap(path => groupIdLiterals(readFileSync(path, 'utf8'), ids).map(id => `${path.slice(here.length + 1)}: '${id}'`));
    expect(offenders).toEqual([]);
  });
});
