import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { renderFiles, type MenuInputs } from './templates.ts';
import { repoRoot } from './fixture.ts';

/**
 * #548: the generated package must typecheck against the real kernel and contracts sources,
 * and its manifest test must build the Registry with the group's real space (not a fixed 'analytics').
 * The files are served virtually from inside apps/platform-web/src so module resolution finds the
 * app's workspace links and React/Vitest types; nothing is written to the repo.
 */
const ROOT = repoRoot();
const VIRTUAL_DIR = join(ROOT, 'apps/platform-web/src/__gen-menu-typecheck__');

/** One real platform group per space case, so no GroupId edit is needed. */
const CASES: { space: string | null; group: string }[] = [
  { space: 'analytics', group: 'analytics' },
  { space: 'metrics', group: 'metrics' },
  { space: 'operations', group: 'admin' },
  { space: null, group: 'noticeVoc' },
];

const inputsFor = ({ space, group }: { space: string | null; group: string }): MenuInputs => ({
  group, folder: 'gen-probe', space, menuId: 'gen-probe', page: 'GenProbe', path: '/gen-probe',
  pageType: 'overview', labelKo: '생성 확인', labelEn: 'Gen probe', binding: group,
});

function diagnosticsFor(inputs: MenuInputs): string[] {
  const virtual = new Map(
    renderFiles(inputs).filter(f => f.relPath.startsWith('src/')).map(f => [join(VIRTUAL_DIR, f.relPath.slice('src/'.length)), f.content]),
  );
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX,
    strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, types: [],
  };
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile, getSourceFile, directoryExists } = host;
  host.fileExists = f => virtual.has(f) || fileExists.call(host, f);
  host.directoryExists = d => [...virtual.keys()].some(f => f.startsWith(`${d}/`)) || (directoryExists?.call(host, d) ?? false);
  host.readFile = f => virtual.get(f) ?? readFile.call(host, f);
  host.getSourceFile = (f, lang, onError, create) => {
    const text = virtual.get(f);
    return text === undefined ? getSourceFile.call(host, f, lang, onError, create) : ts.createSourceFile(f, text, lang);
  };
  const program = ts.createProgram([...virtual.keys()], options, host);
  return ts.getPreEmitDiagnostics(program)
    .filter(d => d.file !== undefined && virtual.has(d.file.fileName))
    .map(d => `${d.file!.fileName.slice(VIRTUAL_DIR.length + 1)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}

describe('generated package typechecks against the real kernel (#548)', () => {
  it.each(CASES)('space $space, group $group', c => {
    expect(diagnosticsFor(inputsFor(c))).toEqual([]);
  }, 120_000);
});

describe('generated manifest test uses the real space (#548)', () => {
  it.each(CASES)('space $space', c => {
    const test = renderFiles(inputsFor(c)).find(f => f.relPath === 'src/manifest.test.ts')!.content;
    if (c.space === null) {
      expect(test).toContain('const spaces: SpaceDef[] = [];');
      expect(test).toContain('space: null }');
      expect(test).toContain('expect(registry.spaceOf(menu)).toBeNull();');
    } else {
      expect(test).toContain(`id: '${c.space}'`);
      expect(test).toContain(`space: '${c.space}' }`);
      expect(test).toContain(`expect(registry.spaceOf(menu)?.id).toBe('${c.space}');`);
    }
    if (c.space !== 'analytics') expect(test).not.toContain("'analytics'");
  });
});
