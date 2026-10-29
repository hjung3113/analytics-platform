import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contracts, foScreens, foServer, foShared, foUi } from './index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const PACKAGES = {
  'apps/platform-api': { name: '@ap/platform-api', preset: foServer },
  'packages/feature-shared': { name: '@ap/feature-shared', preset: foShared },
  'packages/feature-ui': { name: '@ap/feature-ui', preset: foUi },
  'apps/feature-screens': { name: '@ap/feature-screens', preset: foScreens },
} as const;
type PackageDir = keyof typeof PACKAGES;

async function lint(dir: PackageDir, relFile: string, code: string, preset?: Linter.Config[]) {
  const cwd = path.join(REPO_ROOT, dir);
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: preset ?? PACKAGES[dir].preset });
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, relFile) });
  return (result?.messages ?? []).map((message) => `${message.ruleId ?? 'parse'}`);
}

const SERVER = 'apps/platform-api' as const;
const SHARED = 'packages/feature-shared' as const;
const UI = 'packages/feature-ui' as const;
const SCREENS = 'apps/feature-screens' as const;

describe('feature full-source presets: correctness policy carried over from the Biome lint', () => {
  it.each([
    ['non-null assertion', 'export const f = (a?: string) => a!;\n', '@typescript-eslint/no-non-null-assertion'],
    ['unused import', "import { x } from './x';\nexport const y = 1;\n", '@typescript-eslint/no-unused-vars'],
    ['unused variable', 'export function f() {\n  const w = 1;\n  return 2;\n}\n', '@typescript-eslint/no-unused-vars'],
    ['unused parameter before a used one', 'export const f = (a: number, b: number) => b;\n', '@typescript-eslint/no-unused-vars'],
    ['unused caught error', 'export function f() {\n  try {\n    return 1;\n  } catch (e) {\n    return 2;\n  }\n}\n', '@typescript-eslint/no-unused-vars'],
    ['unused destructured array element', 'export const f = ([r, s]: number[]) => s;\n', '@typescript-eslint/no-unused-vars'],
    ['value import used only as a type', "import { Foo } from './foo';\nexport type T = Foo;\n", '@typescript-eslint/consistent-type-imports'],
    ['loose equality with a value', 'export const f = (a: number) => a == 1;\n', 'eqeqeq'],
    ['explicit any', 'export const f = (a: any) => a;\n', '@typescript-eslint/no-explicit-any'],
    ['var', 'export function f() {\n  var a = 1;\n  return a;\n}\n', 'no-var'],
    ['let never reassigned', 'export function f() {\n  let a = 1;\n  return a;\n}\n', 'prefer-const'],
    ['control character in a regex', 'export const r = /[\\x00-\\x1f]/;\n', 'no-control-regex'],
    ['delete of a named property', 'export function f(o: { a?: number }) {\n  delete o.a;\n}\n', 'no-restricted-syntax'],
    ['forEach with an inline callback', 'export const f = (a: number[]) => a.forEach((x) => x);\n', 'no-restricted-syntax'],
    ['map().flat()', 'export const f = (a: number[][]) => a.map((x) => x).flat();\n', 'no-restricted-syntax'],
    ['then property', 'export const f = { then: () => 1 };\n', 'unicorn/no-thenable'],
    ['focused describe', "declare const describe: any;\ndescribe.only('x', () => undefined);\n", 'no-restricted-syntax'],
    ['focused it', "declare const it: (n: string, f: () => void) => void & { only: unknown };\nit.only('x', () => undefined);\n", 'no-restricted-syntax'],
    ['focused test', "declare const test: { only: (n: string, f: () => void) => void };\ntest.only('x', () => undefined);\n", 'no-restricted-syntax'],
    ['focused table-driven it.only.each', "declare const it: any;\nit.only.each([1, 2])('x %i', () => undefined);\n", 'no-restricted-syntax'],
    ['focused describe.only.each', "declare const describe: any;\ndescribe.only.each([[1]])('x %i', () => undefined);\n", 'no-restricted-syntax'],
    ['focused concurrent variant', "declare const test: any;\ntest.concurrent.only('x', () => undefined);\n", 'no-restricted-syntax'],
    ['focused computed spelling', "declare const it: any;\nit['only']('x', () => undefined);\n", 'no-restricted-syntax'],
    ['object spread in a reduce callback', 'export const f = (a: string[]) => a.reduce((acc, k) => ({ ...acc, [k]: 1 }), {} as Record<string, number>);\n', 'no-restricted-syntax'],
    ['array spread returned from a reduce callback', 'export const f = (a: number[]) => a.reduce((acc: number[], n) => {\n  return [...acc, n];\n}, []);\n', 'no-restricted-syntax'],
    ['void outside a return type or generic argument', 'export const f = (a: void) => a;\n', '@typescript-eslint/no-invalid-void-type'],
    ['unreachable code', 'export function f() {\n  return 1;\n  const x = 2;\n  return x;\n}\n', 'no-unreachable'],
    ['const enum', 'export const enum E {\n  A,\n}\n', 'no-restricted-syntax'],
    ['instanceof Array', 'export const f = (a: unknown) => a instanceof Array;\n', 'no-restricted-syntax'],
    ['stale disable directive', '// eslint-disable-next-line no-var\nexport const a = 1;\n', 'parse'],
  ])('%s fails', async (_label, code, rule) => {
    for (const dir of [SERVER, SHARED, UI]) {
      const rules = await lint(dir, 'src/probe.ts', code);
      // Unused-directive reports carry no rule id; every other case names its rule.
      expect(rules.length, `${dir}: ${rules.join(',')}`).toBeGreaterThan(0);
      if (rule !== 'parse') expect(rules).toContain(rule);
    }
  });

  it.each([
    ['underscore-prefixed unused binding, parameter and caught error', 'export const f = (_a: number, b: number) => {\n  const _u = 1;\n  try {\n    return b;\n  } catch (_e) {\n    return 0;\n  }\n};\n'],
    ['null equality', 'export const f = (a?: number | null) => a == null;\n'],
    ['inline import() type annotation', "export const f = (a: import('./y').Z) => a;\n"],
    ['type import', "import type { Foo } from './foo';\nexport type T = Foo;\n"],
    ['rest sibling', 'export const f = ({ a, ...rest }: { a: number; b: number }) => rest;\n'],
    ['delete with a computed key', 'export function f(o: Record<string, number>, k: string) {\n  delete o[k];\n}\n'],
    ['delete of an environment variable', 'export function f() {\n  delete process.env.X;\n}\n'],
    ['forEach with a function reference or an index callback', 'declare const g: (x: number) => void;\nexport const f = (a: number[]) => {\n  a.forEach(g);\n  a.forEach((x, i) => g(x + i));\n};\n'],
    ['reasoned control-character exception', '// eslint-disable-next-line no-control-regex -- guard rejects control characters on purpose\nexport const r = /[\\x00-\\x1f]/;\n'],
    ['unfocused test calls', "declare const describe: { skip: (n: string, f: () => void) => void };\ndeclare const it: ((n: string, f: () => void) => void) & { each: (c: number[]) => (n: string, f: () => void) => void };\ndescribe.skip('x', () => undefined);\nit.each([1])('x %i', () => undefined);\nit('only', () => undefined);\n"],
    ['a property named only on something that is not a test runner', 'export const f = (o: { only: number }) => o.only;\n'],
    ['reduce that mutates a local accumulator', 'export const f = (a: string[]) => a.reduce((acc, k) => {\n  acc[k] = 1;\n  return acc;\n}, {} as Record<string, number>);\n'],
    ['spread outside a reduce callback', 'export const f = (a: number[], b: number[]) => [...a, ...b];\n'],
    ['void as a return type and as a generic argument', 'export const f = (): Promise<void> => Promise.resolve();\nexport const g = (): void => undefined;\n'],
    ['server code with no SDK/browser allowlist applied', "import { createServer } from 'node:http';\nexport const s = createServer;\n"],
  ])('%s passes', async (_label, code) => {
    for (const dir of [SERVER, SHARED, UI]) {
      expect(await lint(dir, 'src/probe.ts', code), dir).toEqual([]);
    }
  });

  it('does not apply the SDK allowlists: platform-api may import react, the contracts layer preset would not', async () => {
    const code = "import { useState } from 'react';\nexport const s = useState;\n";
    expect(await lint(SERVER, 'src/probe.ts', code)).toEqual([]);
    expect(await lint('packages/feature-shared', 'src/probe.ts', code, contracts)).not.toEqual([]);
  });
});

describe('feature full-source presets: checks the compiler no longer reports for files outside every tsc program', () => {
  // Paths no package `include` reaches: a package-level __tests__ folder, *.config.ts, vitest.setup.ts and plain JS.
  const OUTSIDE_TSC = [
    ['__tests__/probe.test.ts', UI],
    ['vitest.setup.ts', UI],
    ['vitest.config.ts', SERVER],
    ['drizzle.config.ts', SERVER],
  ] as const;

  it.each([
    ['duplicate object keys', 'export const o = { a: 1, a: 2 };\n', 'no-dupe-keys'],
    ['reassigned function', 'function g() {\n  return 1;\n}\ng = () => 2;\nexport { g };\n', 'no-func-assign'],
    ['reassigned class', 'class K {}\nK = class {};\nexport { K };\n', 'no-class-assign'],
    ['reassigned const', 'const c = 1;\nc = 2;\nexport { c };\n', 'no-const-assign'],
    ['negated left side of in', "export const f = (k: string, o: object) => !k in o;\n", 'no-unsafe-negation'],
    ['duplicate parameter', 'export function f(a: number, a: number) {\n  return a;\n}\n', 'no-dupe-args'],
    ['duplicate class member', 'export class K {\n  m() {\n    return 1;\n  }\n  m() {\n    return 2;\n  }\n}\n', '@typescript-eslint/no-dupe-class-members'],
    ['redeclared variable', 'var v = 1;\nvar v = 2;\nexport { v };\n', '@typescript-eslint/no-redeclare'],
    ['calling a global namespace', 'export const m = Math();\n', 'no-obj-calls'],
  ])('%s fails outside every tsc program', async (_label, code, rule) => {
    for (const [file, dir] of OUTSIDE_TSC) {
      expect(await lint(dir, file, code), `${dir}/${file}`).toContain(rule);
    }
  });

  it('keeps checking src files too, where the compiler reports the same mistake', async () => {
    for (const dir of [SERVER, SHARED, UI]) {
      expect(await lint(dir, 'src/probe.ts', 'export const o = { a: 1, a: 2 };\n')).toContain('no-dupe-keys');
    }
  });

  it('passes typed code the compatibility override exists for: overloads, declaration merging, type-only names', async () => {
    const code = [
      'export function f(a: string): string;',
      'export function f(a: number): number;',
      'export function f(a: string | number) {',
      '  return a;',
      '}',
      'export interface Shape {',
      '  w: number;',
      '}',
      'export namespace Shape {',
      '  export const unit: Shape = { w: 1 };',
      '}',
      'export class C {',
      '  m(a: string): string;',
      '  m(a: number): number;',
      '  m(a: string | number) {',
      '    return a;',
      '  }',
      '}',
      'export type Keys = keyof typeof Shape.unit | NodeJS.Timeout;',
      'export abstract class A {',
      '  abstract get x(): number;',
      '}',
      '',
    ].join('\n');
    for (const [file, dir] of OUTSIDE_TSC) {
      const rules = (await lint(dir, file, code)).filter((rule) => rule !== '@typescript-eslint/no-namespace');
      expect(rules, `${dir}/${file}`).toEqual([]);
    }
  });

  it('passes an ordinary tooling config file', async () => {
    const code = "import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { include: ['**/*.test.ts'] } });\n";
    for (const [file, dir] of OUTSIDE_TSC) expect(await lint(dir, file, code), `${dir}/${file}`).toEqual([]);
  });

  it.each([
    ['an undeclared name', 'export default { name: missingBinding };\n', ['no-undef']],
    ['an undeclared name in a script', "process.stdout.write(typoBinding);\n", ['no-undef']],
  ])('plain JS: %s fails', async (_label, code, rules) => {
    for (const dir of [SERVER, SHARED, UI]) expect(await lint(dir, 'eslint.config.js', code), dir).toEqual(rules);
  });

  it('plain JS: Node globals and an ordinary config are accepted, TypeScript keeps no-undef off', async () => {
    const script = "import { readFileSync } from 'node:fs';\n\nconst home = process.env.HOME ?? '';\nprocess.stdout.write(`${Buffer.from(home)}${new URL('file:///x')}${String(readFileSync)}`);\nsetTimeout(() => undefined, 0);\n";
    for (const dir of [SERVER, SHARED, UI]) {
      expect(await lint(dir, 'scripts/probe.mjs', script), dir).toEqual([]);
      expect(await lint(dir, 'src/probe.ts', 'export type T = NodeJS.Timeout;\nexport const f = (x: JSX.Element | undefined) => x;\n'), dir).toEqual([]);
    }
  });
});

describe('feature full-source presets: misrefactored compound assignment (old Biome noMisrefactoredShorthandAssign)', () => {
  it.each([
    ['additive', 'export function f(count: number) {\n  count += count + 1;\n  return count;\n}\n'],
    ['multiplicative', 'export function f(n: number) {\n  n *= n * 2;\n  return n;\n}\n'],
  ])('%s duplicate of the target fails', async (_label, code) => {
    for (const dir of [SERVER, SHARED, UI]) {
      expect(await lint(dir, 'src/probe.ts', code), dir).toContain('unicorn/no-misrefactored-assignment');
    }
  });

  it('accepts a compound assignment that does not repeat its target', async () => {
    const code = 'export function f(start: number, step: number) {\n  let count = start;\n  count += step + 1;\n  count *= 2;\n  return count;\n}\n';
    for (const dir of [SERVER, SHARED, UI]) expect(await lint(dir, 'src/probe.ts', code), dir).toEqual([]);
  });
});

describe('feature UI preset: React, accessibility and design-system rules under ESLint 10', () => {
  const tsx = (body: string) =>
    `import React from 'react';\nexport const C = (p: { items: string[] }) => (\n  <section data-count={p.items.length}>${body}</section>\n);\nvoid React;\n`;

  it.each([
    ['list without key', tsx('<ul>{p.items.map((i) => <li>{i}</li>)}</ul>'), 'react/jsx-key'],
    ['array index as key', tsx('<ul>{p.items.map((i, n) => <li key={n}>{i}</li>)}</ul>'), 'react/no-array-index-key'],
    ['dangerouslySetInnerHTML', tsx('<div dangerouslySetInnerHTML={{ __html: p.items[0] ?? "" }} />'), 'react/no-danger'],
    ['children prop', tsx('<div children="x" />'), 'react/no-children-prop'],
    ['button without type', tsx('<button>x</button>'), 'react/button-has-type'],
    ['target blank without rel', tsx('<a href="https://x.test" target="_blank">x</a>'), 'react/jsx-no-target-blank'],
    ['image without alt', tsx('<img src="a.png" />'), 'jsx-a11y/alt-text'],
    ['autofocus', tsx('<input aria-label="x" autoFocus />'), 'jsx-a11y/no-autofocus'],
    ['click handler on a non-interactive element', tsx('<div onClick={() => undefined}>x</div>'), 'jsx-a11y/click-events-have-key-events'],
    ['positive tabindex', tsx('<div tabIndex={2}>x</div>'), 'jsx-a11y/tabindex-no-positive'],
  ])('%s fails', async (_label, code, rule) => {
    expect(await lint(UI, 'src/probe.tsx', code)).toContain(rule);
  });

  it.each([
    ['aria-hidden on a focusable element', tsx('<button type="button" aria-hidden="true">x</button>'), 'jsx-a11y/no-aria-hidden-on-focusable'],
    ['invalid lang value', tsx('<html lang="zz-invalid-xx" />'), 'jsx-a11y/lang'],
  ])('%s fails', async (_label, code, rule) => {
    expect(await lint(UI, 'src/probe.tsx', code)).toContain(rule);
  });

  it('keeps the React import convention without type-import changes and passes valid markup', async () => {
    const code = tsx('<ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>');
    expect(await lint(UI, 'src/probe.tsx', code)).toEqual([]);
  });

  it('reports the Rules of Hooks and a raw color class', async () => {
    const hooks = "import { useState } from 'react';\nexport function useX(ok: boolean) {\n  if (ok) useState(0);\n}\n";
    expect(await lint(UI, 'src/probe.ts', hooks)).toContain('react-hooks/rules-of-hooks');
    const raw = tsx('<div className="bg-red-500">x</div>');
    expect(await lint(UI, 'src/probe.tsx', raw)).toContain('shadcn/no-raw-colors');
  });

  it('keeps `rich-editor` a known class, and does not check tests with the design rules', async () => {
    expect(await lint(UI, 'src/probe.tsx', tsx('<div className="rich-editor">x</div>'))).toEqual([]);
    expect(await lint(UI, 'src/__tests__/probe.test.tsx', tsx('<div className="bg-red-500">x</div>'))).toEqual([]);
  });

  it('keeps React and accessibility rules out of the server and shared presets', async () => {
    const code = tsx('<img src="a.png" />');
    expect(await lint(SERVER, 'src/probe.tsx', code)).not.toContain('jsx-a11y/alt-text');
    expect(await lint(SHARED, 'src/probe.tsx', code)).not.toContain('jsx-a11y/alt-text');
  });
});

describe('feature screens preset: the UI rules plus the restyled-component checks of the former Oxlint pass', () => {
  const button = (props: string) =>
    `import { Button } from '@ap/ui';\nexport const C = () => <Button ${props}>x</Button>;\n`;

  it('shares the correctness, React, accessibility and Hooks policy with the UI preset', async () => {
    const hooks = "import { useState } from 'react';\nexport function useX(ok: boolean) {\n  if (ok) useState(0);\n}\n";
    expect(await lint(SCREENS, 'src/probe.ts', hooks)).toContain('react-hooks/rules-of-hooks');
    expect(await lint(SCREENS, 'src/probe.ts', 'export const f = (a?: string) => a!;\n')).toContain('@typescript-eslint/no-non-null-assertion');
    expect(await lint(SCREENS, 'src/probe.tsx', '<img src="a.png" />;\n')).toContain('jsx-a11y/alt-text');
    expect(await lint(SCREENS, 'src/probe.tsx', '<div className="bg-red-500">x</div>;\n')).toContain('shadcn/no-raw-colors');
  });

  it('checks restyled components: screens add layout only, unlike the preset of the package that defines them', async () => {
    const restyled = button('className="text-xs"');
    expect(await lint(SCREENS, 'src/probe.tsx', restyled)).toContain('shadcn/no-restyle');
    expect(await lint(SCREENS, 'src/probe.tsx', button('className="mt-2"'))).toEqual([]);
    expect(await lint(UI, 'src/probe.tsx', restyled, foUi)).not.toContain('shadcn/no-restyle');
  });

  it('checks components imported from @ap/feature-ui as well', async () => {
    const code = "import { SeverityBadge } from '@ap/feature-ui';\nexport const C = () => <SeverityBadge className=\"text-xs\" />;\n";
    expect(await lint(SCREENS, 'src/probe.tsx', code)).toContain('shadcn/no-restyle');
  });

  it('does not check tests with the design rules, and keeps a reasoned exception working', async () => {
    expect(await lint(SCREENS, 'src/__tests__/probe.test.tsx', button('className="text-xs"'))).toEqual([]);
    const excepted = "import { Button } from '@ap/ui';\nexport const C = () => (\n  // eslint-disable-next-line shadcn/no-restyle -- probe\n  <Button className=\"text-xs\">x</Button>\n);\n";
    expect(await lint(SCREENS, 'src/probe.tsx', excepted)).toEqual([]);
  });
});

describe('package lint dispatch', () => {
  // Real `pnpm lint` of each package with a new, untracked invalid source file; the file is removed afterwards.
  it.each(Object.entries(PACKAGES))('%s lint fails on a new invalid source file and names it', (dir, { name }) => {
    const probe = path.join(REPO_ROOT, dir, 'src', 'zz-lint-dispatch-probe.ts');
    expect(existsSync(probe)).toBe(false);
    try {
      writeFileSync(probe, 'export const f = (a?: string) => a!;\nexport const g = (a: number) => a == 1;\n');
      const run = spawnSync('pnpm', ['--config.verify-deps-before-run=false', '--filter', name, 'run', 'lint'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '' },
      });
      const output = `${run.stdout}${run.stderr}`;
      expect(run.status, output).not.toBe(0);
      expect(output).toContain('zz-lint-dispatch-probe.ts');
      expect(output).toContain('no-non-null-assertion');
    } finally {
      if (existsSync(probe)) unlinkSync(probe);
    }
  }, 180_000);
});
