/**
 * The image build (`Dockerfile`) installs some workspace packages from their manifest only, without sources, and its
 * `tsc -p tsconfig.json` compiles every file under `src`. A file that imports one of those packages breaks the image
 * with TS2307, which only main push builds (#3007, #3014). Such a file must be in `tsconfig.json` `exclude` and in
 * `tsconfig.platform-tests.json` `include`, so `typecheck` still covers it (#3015).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP, '../..');

type Sources = { dockerfile: string; buildExclude: readonly string[]; testsInclude: readonly string[]; files: ReadonlyMap<string, string> };

/** Packages the image copies as `package.json` only: their imports cannot resolve in the image's `tsc`. */
function manifestOnlyPackages(dockerfile: string, nameOf: (dir: string) => string): string[] {
  const copies = [...dockerfile.matchAll(/^COPY\s+(\S+)\s+\S+$/gm)].flatMap(match => (match[1] ? [match[1]] : []));
  const manifests = copies.filter(source => source.endsWith('/package.json')).map(source => path.posix.dirname(source));
  const sources = new Set(copies.filter(source => !source.includes('.')));
  return manifests.filter(dir => dir !== '.' && !sources.has(dir) && !dir.startsWith('ops/') && dir !== 'apps/platform-api').map(nameOf);
}

/** Every file the image build compiles that imports a manifest-only package, with what is missing from the two tsconfigs. */
function imageBuildLeaks(input: Sources, packages: readonly string[]): string[] {
  const imports = (text: string) => [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].flatMap(match => (match[1] ? [match[1]] : []));
  const reads = (specifier: string) => packages.some(name => specifier === name || specifier.startsWith(`${name}/`));
  const problems: string[] = [];
  for (const [file, text] of input.files) {
    const used = imports(text).filter(reads);
    if (used.length === 0) continue;
    const missing = [
      ...(input.buildExclude.includes(file) ? [] : ['apps/platform-api/tsconfig.json exclude']),
      ...(input.testsInclude.includes(file) ? [] : ['apps/platform-api/tsconfig.platform-tests.json include']),
    ];
    if (missing.length > 0) problems.push(`${file} imports ${[...new Set(used)].join(', ')} — add it to ${missing.join(' and ')}`);
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
  return {
    dockerfile: fs.readFileSync(path.join(APP, 'Dockerfile'), 'utf8'),
    buildExclude: json('tsconfig.json').exclude ?? [],
    testsInclude: json('tsconfig.platform-tests.json').include ?? [],
    files,
  };
}

const packageName = (dir: string) => (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, dir, 'package.json'), 'utf8')) as { name: string }).name;

describe('image build tsconfig (#3015)', () => {
  const sources = readSources();
  const packages = manifestOnlyPackages(sources.dockerfile, packageName);

  it('reads the manifest-only packages from the Dockerfile', () => {
    expect(packages).toContain('@ap/contracts');
    expect(packages).not.toContain('@ap/contract-schemas');
  });

  it('keeps every file importing a manifest-only package out of the image build and in the platform-tests typecheck', () => {
    expect(imageBuildLeaks(sources, packages)).toEqual([]);
  });

  it('names the file and the tsconfig when a test leaves the exclude list', () => {
    const file = 'src/modules/platform-saved-views/__tests__/panels.test.ts';
    expect(sources.files.has(file)).toBe(true);
    const leaks = imageBuildLeaks({ ...sources, buildExclude: sources.buildExclude.filter(entry => entry !== file) }, packages);
    expect(leaks).toEqual([`${file} imports @ap/contracts/testing/saved-view-panels — add it to apps/platform-api/tsconfig.json exclude`]);
  });
});
