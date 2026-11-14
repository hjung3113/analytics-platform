// turbo-cross-reads: names-only — menus/mars/analytics is only the ESLint `lintText` location (its package.json owns the
// generated files for the package-escape rule); none of its files are read or written.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { PAGE_TYPES, renderFiles, type MenuInputs, type PageType } from './templates.ts';
import { repoRoot } from './fixture.ts';

/**
 * #2261: a freshly generated menu must pass the `menu` preset as written, so `pnpm gen:menu` never hands out a package
 * that fails lint (the page once rendered its copy through `lang === 'ko' ? … : …`, which `ap/no-lang-copy-ternary` bans).
 * The files are linted in memory at an existing menu package's path, so path-scoped rules (tests, mocks, package
 * ownership) apply as they would on disk; nothing is written.
 */
const ROOT = repoRoot();
const PKG_DIR = join(ROOT, 'menus/mars/analytics');
// The shared lint config by its repo path: the tooling preset keeps workspace packages out of gen-menu's imports, and the
// package prefix stays in prefix.ts only.
const loadMenuPreset = async (): Promise<Linter.Config[]> =>
  ((await import(pathToFileURL(join(ROOT, 'tooling/eslint/src/index.js')).href)) as { menu: Linter.Config[] }).menu;

const inputsFor = (pageType: PageType): MenuInputs => ({
  group: 'analytics', folder: 'gen-lint-probe', space: 'mars', menuId: 'gen-lint-probe', page: 'GenLintProbe', path: '/gen-lint-probe',
  pageType, labelKo: '생성 확인', labelEn: 'Gen probe', binding: 'analytics',
});

async function lintGenerated(pageType: PageType): Promise<string[]> {
  const eslint = new ESLint({ cwd: PKG_DIR, overrideConfigFile: true, overrideConfig: await loadMenuPreset() });
  const found: string[] = [];
  for (const file of renderFiles(inputsFor(pageType)).filter(f => /\.tsx?$/.test(f.relPath))) {
    const [result] = await eslint.lintText(file.content, { filePath: join(PKG_DIR, file.relPath) });
    for (const m of result?.messages ?? []) found.push(`${file.relPath}:${m.line} ${m.ruleId ?? 'parse'}: ${m.message}`);
  }
  return found;
}

describe('generated menu passes the menu lint preset (#2261)', () => {
  it.each(PAGE_TYPES)('page type %s', async pageType => {
    expect(await lintGenerated(pageType)).toEqual([]);
  }, 120_000);
});
