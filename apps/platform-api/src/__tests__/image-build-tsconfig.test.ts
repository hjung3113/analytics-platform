/**
 * The image build (`Dockerfile`) installs some workspace packages from their manifest only, without sources, and its
 * `tsc -p tsconfig.json` compiles every file under `src`. A file that imports one of those packages breaks the image
 * with TS2307, and the image builds only on main push and manual runs, never on a PR (#3007, #3014). Such a file must be
 * in `tsconfig.json` `exclude` and in `tsconfig.platform-tests.json` `include`, so `typecheck` still covers it (#3015).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP, '../..');
const BUILD = 'apps/platform-api/tsconfig.json exclude';
const TESTS = 'apps/platform-api/tsconfig.platform-tests.json include';

type Sources = { buildExclude: readonly string[]; testsInclude: readonly string[]; files: ReadonlyMap<string, string> };

/**
 * The context sources the image's API compile sees: every `COPY`/`ADD` in the stage that runs `@ap/platform-api run build`
 * and in the stages it is built `FROM`. Instructions are case-insensitive and may be indented or continued with `\`;
 * options come before the operands in any order, and a copy `--from` another stage or image is not from the context.
 * A copy this cannot read throws instead of being skipped.
 */
function copySources(dockerfile: string): string[] {
  const lines = dockerfile.replace(/\\\r?\n/g, ' ').split(/\r?\n/).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('#'));
  const stages: { name: string | null; base: string; lines: string[] }[] = [];
  for (const line of lines) {
    const from = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(line);
    if (from) stages.push({ base: from[1] ?? '', name: from[2]?.toLowerCase() ?? null, lines: [] });
    else stages.at(-1)?.lines.push(line);
  }
  const target = stages.find(stage => stage.lines.some(line => /^RUN\s/i.test(line) && line.includes('@ap/platform-api run build')));
  if (!target) throw new Error('Dockerfile: no stage runs `pnpm --filter @ap/platform-api run build`');
  const chain: typeof stages = [];
  for (let stage: (typeof stages)[number] | undefined = target; stage && !chain.includes(stage); stage = stages.find(other => other.name === stage?.base.toLowerCase())) chain.push(stage);
  return chain.flatMap(stage => stage.lines).flatMap(line => {
    const copy = /^(?:COPY|ADD)\s+(.*)$/i.exec(line);
    if (!copy) return [];
    let rest = copy[1] ?? '';
    const options: string[] = [];
    for (let option = /^(--\S+)\s+/.exec(rest); option; option = /^(--\S+)\s+/.exec(rest)) { options.push(option[1] ?? ''); rest = rest.slice(option[0].length); }
    if (options.some(option => /^--from(=|$)/.test(option))) return [];
    let parts: unknown;
    try { parts = rest.startsWith('[') ? JSON.parse(rest) : rest.split(/\s+/); } catch { parts = null; }
    if (!Array.isArray(parts) || parts.length < 2 || !parts.every(part => typeof part === 'string' && part !== '')) throw new Error(`Dockerfile: cannot read «${line}»`);
    return (parts as string[]).slice(0, -1).map(source => source.replace(/^\.\//, '').replace(/\/$/, ''));
  });
}

/**
 * The API's workspace dependencies the image copies as `package.json` only. Every workspace dependency must be copied
 * one way or the other: one the Dockerfile does not mention fails here rather than leaving the check silently narrower.
 */
function manifestOnlyPackages(dockerfile: string, dependencies: ReadonlyMap<string, string>): string[] {
  const sources = new Set(copySources(dockerfile));
  return [...dependencies].flatMap(([name, dir]) => {
    if (sources.has(dir)) return [];
    if (sources.has(`${dir}/package.json`)) return [name];
    throw new Error(`Dockerfile copies neither ${dir} nor ${dir}/package.json for the API dependency ${name}`);
  });
}

/** Module specifiers the compiler resolves: imports, re-exports, `import()` and `import type`, without comments. */
function moduleSpecifiers(file: string, text: string): string[] {
  const found: string[] = [];
  const literal = (node: ts.Node | undefined) => { if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) found.push(node.text); };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) literal(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) literal(node.arguments[0]);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal(node.argument.literal);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  return found;
}

/** Every file the image build compiles that imports a manifest-only package, naming both tsconfig lists and the missing ones. */
function imageBuildLeaks(input: Sources, packages: readonly string[]): string[] {
  const reads = (specifier: string) => packages.some(name => specifier === name || specifier.startsWith(`${name}/`));
  const problems: string[] = [];
  for (const [file, text] of input.files) {
    const used = [...new Set(moduleSpecifiers(file, text).filter(reads))];
    if (used.length === 0) continue;
    const missing = [...(input.buildExclude.includes(file) ? [] : [BUILD]), ...(input.testsInclude.includes(file) ? [] : [TESTS])];
    if (missing.length > 0) problems.push(`${file} imports ${used.join(', ')}: list it in ${BUILD} and ${TESTS} (missing: ${missing.join('; ')})`);
  }
  return problems;
}

function readSources(): Sources {
  const json = (name: string) => JSON.parse(fs.readFileSync(path.join(APP, name), 'utf8')) as { exclude?: string[]; include?: string[] };
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.set(path.relative(APP, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(APP, 'src'));
  return { buildExclude: json('tsconfig.json').exclude ?? [], testsInclude: json('tsconfig.platform-tests.json').include ?? [], files };
}

/** The API's workspace dependencies, each with its directory relative to the repository root (the Dockerfile's build context). */
function workspaceDependencies(): Map<string, string> {
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')) as Partial<Record<'dependencies' | 'devDependencies', Record<string, string>>>;
  const names = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).filter(([, range]) => range.startsWith('workspace:')).map(([name]) => name);
  return new Map(names.map(name => [name, path.relative(REPO_ROOT, fs.realpathSync(path.join(APP, 'node_modules', name))).split(path.sep).join('/')]));
}

describe('image build tsconfig (#3015)', () => {
  const sources = readSources();
  const dockerfile = fs.readFileSync(path.join(APP, 'Dockerfile'), 'utf8');
  const dependencies = workspaceDependencies();
  const packages = manifestOnlyPackages(dockerfile, dependencies);

  it('reads the manifest-only packages from the Dockerfile', () => {
    expect(packages).toContain('@ap/contracts');
    expect(packages).not.toContain('@ap/contract-schemas');
  });

  it('reads a JSON-form COPY and fails on a dependency the Dockerfile does not copy', () => {
    const http = dependencies.get('@ap/http-adapter');
    const line = `COPY ${http}/package.json ./${http}/package.json`;
    expect(dockerfile).toContain(line);
    expect(manifestOnlyPackages(dockerfile.replace(line, `COPY ["${http}/package.json", "./${http}/package.json"]`), dependencies)).toEqual(packages);
    expect(() => manifestOnlyPackages(dockerfile.replace(line, ''), dependencies)).toThrow(/@ap\/http-adapter/);
  });

  it('counts only context copies of the stage that compiles the API, whatever the option order', () => {
    const http = dependencies.get('@ap/http-adapter');
    const line = `COPY ${http}/package.json ./${http}/package.json`;
    const withOptions = `  copy --chown=0:0 --link ["${http}/package.json", "./${http}/package.json"]`;
    expect(manifestOnlyPackages(dockerfile.replace(line, withOptions), dependencies)).toEqual(packages);
    const fromStage = `${line}\nCOPY --chown=0:0 --from=seed ${http} /probe/`;
    expect(manifestOnlyPackages(dockerfile.replace(line, fromStage), dependencies)).toContain('@ap/http-adapter');
    const otherStage = `${dockerfile}\nFROM scratch AS inventory\nCOPY ${http} /inventory/http-adapter/\n`;
    expect(manifestOnlyPackages(otherStage, dependencies)).toContain('@ap/http-adapter');
    for (const unreadable of ['COPY ["only-one"]', '  copy ["only-one"]', 'COPY --chown=0:0 ["only-one"]', 'COPY [not json']) {
      expect(() => manifestOnlyPackages(dockerfile.replace(line, unreadable), dependencies)).toThrow(/cannot read/);
    }
  });

  it('reads the specifiers the compiler resolves and ignores comments', () => {
    const text = [
      "// import '@ap/contracts'",
      "import type { A } from /* note */ '@ap/contracts';",
      "export { B } from '@ap/http-adapter/x';",
      'const c = await import(`@ap/server-conformance`);',
      "type D = import('@ap/contracts/testing/y').D;",
      "import '../testing/local.js';",
    ].join('\n');
    expect(moduleSpecifiers('x.ts', text)).toEqual(['@ap/contracts', '@ap/http-adapter/x', '@ap/server-conformance', '@ap/contracts/testing/y', '../testing/local.js']);
  });

  it('keeps every file importing a manifest-only package out of the image build and in the platform-tests typecheck', () => {
    expect(imageBuildLeaks(sources, packages)).toEqual([]);
  });

  it('names the file and both tsconfig lists when a test leaves one of them', () => {
    const file = 'src/modules/platform-saved-views/__tests__/panels.test.ts';
    expect(sources.files.has(file)).toBe(true);
    const leaks = imageBuildLeaks({ ...sources, buildExclude: sources.buildExclude.filter(entry => entry !== file) }, packages);
    expect(leaks).toEqual([`${file} imports @ap/contracts/testing/saved-view-panels: list it in ${BUILD} and ${TESTS} (missing: ${BUILD})`]);
  });
});
