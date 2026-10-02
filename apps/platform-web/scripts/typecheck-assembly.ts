/**
 * Production-assembly type check (#153, ADR-0009), run by `build:prod` before `vite build`:
 *   AP_PLATFORM_ASSEMBLY=<path> node scripts/typecheck-assembly.ts → OK, or exit 1 with tsc's errors
 * The injected module is outside the app's tsconfig, so `tsc --noEmit` never sees it. This writes a throwaway project
 * (os.tmpdir(), removed afterwards) whose `check.ts` assigns the module's `createAssembly` to `CreateAssembly` from
 * `src/platform-assembly.d.ts`, and runs the workspace `tsc` on it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MISSING_ASSEMBLY_MESSAGE =
  '운영 빌드에는 실어댑터 조립 모듈이 필요하다 — AP_PLATFORM_ASSEMBLY에 경로를 준다(#154). mock 빌드는 --mode mock\n'
  + 'A production build needs the real adapter assembly module — set AP_PLATFORM_ASSEMBLY to its path (#154). For a mock build use --mode mock.';

/** Same resolution as the Vite alias: a relative path is taken from the app directory (Vite's root). */
export const resolveAssemblyPath = (value: string, appRoot = APP_ROOT): string =>
  isAbsolute(value) ? value : resolve(appRoot, value);

export function checkSource(assemblyPath: string): string {
  return [
    `import { createAssembly } from ${JSON.stringify(assemblyPath)};`,
    `import type { CreateAssembly } from '#platform-assembly';`,
    'const check: CreateAssembly = createAssembly;',
    'void check;',
    '',
  ].join('\n');
}

export function checkTsconfig(appRoot = APP_ROOT): string {
  return `${JSON.stringify({
    extends: join(appRoot, 'tsconfig.json'),
    include: [],
    files: ['check.ts', join(appRoot, 'src/platform-assembly.d.ts')],
    compilerOptions: { noEmit: true, types: [] },
  }, null, 2)}\n`;
}

/** Runs the check; returns tsc's output on failure, `null` on success. */
export function typecheckAssembly(assemblyPath: string, appRoot = APP_ROOT): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'ap-assembly-check-'));
  try {
    writeFileSync(join(dir, 'check.ts'), checkSource(assemblyPath));
    writeFileSync(join(dir, 'tsconfig.json'), checkTsconfig(appRoot));
    const tsc = createRequire(join(appRoot, 'package.json')).resolve('typescript/bin/tsc');
    try {
      execFileSync(process.execPath, [tsc, '-p', dir], { cwd: appRoot, encoding: 'utf8', stdio: 'pipe' });
      return null;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() || e.message;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = process.env.AP_PLATFORM_ASSEMBLY;
  if (!value) {
    console.error(MISSING_ASSEMBLY_MESSAGE);
    process.exit(1);
  }
  const assemblyPath = resolveAssemblyPath(value);
  const errors = typecheckAssembly(assemblyPath);
  if (errors !== null) {
    console.error(`typecheck-assembly FAILED — ${assemblyPath} does not export a createAssembly that satisfies CreateAssembly:\n${errors}`);
    process.exit(1);
  }
  console.log(`typecheck-assembly: ${assemblyPath} satisfies CreateAssembly`);
}
