import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  app,
  components,
  contracts,
  kernel,
  menu,
  mockServer,
  shell,
  ui,
} from './index.js';
import { PACKAGE_PREFIX } from './prefix.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const PRESETS: Record<string, Linter.Config[]> = {
  'packages/contracts': contracts,
  'packages/ui': ui,
  'packages/kernel': kernel,
  'packages/components': components,
  'packages/shell': shell,
  'packages/mock-server': mockServer,
  'menus/home': menu,
  'apps/platform-web': app,
};

async function lint(relFile: string, code: string): Promise<Linter.LintMessage[]> {
  const pkgDir = relFile.split('/').slice(0, 2).join('/');
  const preset = PRESETS[pkgDir];
  if (!preset) throw new Error(`no preset mapped for ${pkgDir}`);
  const eslint = new ESLint({
    cwd: path.join(REPO_ROOT, pkgDir),
    overrideConfigFile: true,
    overrideConfig: preset,
  });
  const results = await eslint.lintText(code, { filePath: path.join(REPO_ROOT, relFile) });
  return results[0]?.messages ?? [];
}

interface Row {
  /** Repo-relative file path; first two segments pick the package under lint. */
  file: string;
  code: string;
  /** Expected rule id; '' means the code must lint clean. */
  rule: string;
  /** Distinct substring of the expected message, to pin which selector fired. */
  token?: string;
}

const MENU = 'menus/home/src/pages/x.tsx';

const rows: Row[] = [
  // --- layer allowlists (1-19) ---
  { file: 'packages/contracts/src/x.ts', code: `import type { X } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/contracts/src/x.ts', code: `import type { ReactNode } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/contracts/src/x.ts', code: `export const n = 1;`, rule: '' },
  { file: 'packages/ui/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: 'no-restricted-imports' },
  { file: 'packages/ui/src/x.ts', code: `import * as React from 'react';`, rule: '' },
  { file: 'packages/ui/src/x.ts', code: `import { cn } from './utils/cn';`, rule: '' },
  { file: 'packages/kernel/src/x.ts', code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: 'packages/kernel/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/kernel/src/x.ts', code: `import { x } from '@ap/menu-home';`, rule: 'no-restricted-imports' },
  { file: 'packages/kernel/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },
  { file: 'packages/kernel/src/x.ts', code: `import { x } from '@ap/contracts/src/url';`, rule: 'no-restricted-imports' },
  { file: 'packages/components/src/x.ts', code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: 'packages/components/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: '' },
  { file: 'packages/components/src/x.ts', code: `import { cn } from '@ap/ui';`, rule: '' },
  { file: 'packages/shell/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/shell/src/x.ts', code: `import { x } from '@ap/components';`, rule: '' },
  { file: 'packages/mock-server/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/mock-server/src/x.ts', code: `import type { X } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/mock-server/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },

  // --- menu mock-server carve-out (20-28) ---
  { file: MENU, code: `import { x } from '@ap/menu-equipment';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'menus/home/src/api.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'menus/home/src/api.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'menus/home/src/api.ts', code: `export { serve } from '@ap/mock-server';`, rule: '' },
  { file: MENU, code: `import { x } from '@ap/components';`, rule: '' },
  { file: MENU, code: `import { serve } from '../api';`, rule: '' },
  { file: MENU, code: `import '@ap/ui/styles.css';`, rule: 'no-restricted-imports' },

  // --- app mock-server carve-out / D2 (29-36) ---
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/url-contract.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/return-to.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/src/index';`, rule: 'no-restricted-imports' },

  // --- relative package escape (37-41) ---
  { file: MENU, code: `import { x } from '../../../../packages/contracts/src/url';`, rule: 'ap/no-relative-package-escape' },
  { file: 'menus/home/src/index.ts', code: `import { x } from '../../equipment/src/index';`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `import { x } from '../api';`, rule: '' },
  { file: 'packages/kernel/src/platform.tsx', code: `import { x } from './registry';`, rule: '' },
  { file: 'packages/kernel/src/platform.tsx', code: `import('../../menus/home/src/index');`, rule: 'ap/no-relative-package-escape' },

  // --- hand-built query strings in menus (42-55) ---
  { file: MENU, code: `<a href="/equipment?v=1" />`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `<a href={'/equipment?v=1&scopeId=ICH'} />`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: '<a href={`/equipment?v=${id}`} />', rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `<a href={'/equipment' + '?' + 'v=1'} />`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `navigate('/equipment?v=1');`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: 'navigate(`/equipment?v=${id}`);', rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `<a href={linkTo('home')} />`, rule: '' },
  { file: MENU, code: `<a href={r.url} />`, rule: '' },
  { file: MENU, code: `<a href="/equipment" />`, rule: '' },
  { file: MENU, code: `const label = 'Roles & access';`, rule: '' },
  { file: MENU, code: `navigate(linkTo('home'));`, rule: '' },
  { file: MENU, code: `const u = '/equipment?v=1'; <a href={u} />`, rule: '' },
  { file: 'packages/contracts/src/x.ts', code: `export const q = '?' + params.toString();`, rule: '' },
  { file: 'packages/kernel/src/x.ts', code: `navigate(pathname + buildQuery(global));`, rule: '' },

  // --- web storage in menus (56-63) ---
  { file: MENU, code: `sessionStorage.getItem('k');`, rule: 'no-restricted-globals' },
  { file: MENU, code: `localStorage.setItem('k', 'v');`, rule: 'no-restricted-globals' },
  { file: MENU, code: `window.sessionStorage.getItem('k');`, rule: 'no-restricted-syntax', token: 'web storage' },
  { file: MENU, code: `globalThis.localStorage.setItem('k', 'v');`, rule: 'no-restricted-syntax', token: 'web storage' },
  { file: 'packages/kernel/src/x.ts', code: `localStorage.setItem('k', 'v');`, rule: '' },
  { file: 'packages/shell/src/x.ts', code: `localStorage.getItem('k');`, rule: '' },
  { file: 'packages/components/src/x.ts', code: `localStorage.setItem('k', 'v');`, rule: '' },
  { file: 'packages/mock-server/src/x.ts', code: `localStorage.getItem('k');`, rule: '' },

  // --- location writes and reads (64-73) ---
  { file: MENU, code: `window.location.href = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location.assign('/x');`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location.replace('/x');`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `location.href = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `void window.location.origin;`, rule: '' },
  { file: MENU, code: `anchor.replace('T', ' ');`, rule: '' },
  { file: MENU, code: `a.href = URL.createObjectURL(blob);`, rule: '' },
  { file: 'packages/kernel/src/x.ts', code: `window.history.replaceState(null, '', next);`, rule: '' },
  { file: MENU, code: `window?.location?.assign('/x');`, rule: '' },

  // --- F1: dynamic import / import() type / require must obey boundaries ---
  { file: 'menus/home/src/api.test.ts', code: `const m = await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/kernel/src/x.ts', code: `await import('@ap/shell');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/contracts/src/x.ts', code: `type X = import('react').ReactNode;`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `require('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `require('../../../../packages/contracts/src/url');`, rule: 'ap/no-relative-package-escape' },
  { file: 'apps/platform-web/src/main.tsx', code: `import('@ap/mock-server/src/server');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/home/src/api.ts', code: `import('@ap/mock-server/src/server');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/home/src/api.ts', code: `await import('@ap/mock-server');`, rule: '' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `await import('@ap/mock-server');`, rule: '' },
  { file: MENU, code: `lazy(() => import('./pages/X'));`, rule: '' },
  { file: 'packages/kernel/src/x.ts', code: `await import('@ap/contracts');`, rule: '' },
  { file: MENU, code: `lazy(() => import('@ap/menu-equipment'));`, rule: 'ap/restricted-import-source' },
  { file: 'packages/kernel/src/x.ts', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },

  // --- F1: globalThis.location writes ---
  { file: MENU, code: `globalThis.location.href = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `globalThis.location.assign('/x');`, rule: 'no-restricted-syntax', token: 'window.location' },

  // --- F2: builder input and non-URL text inside href/navigate stay legal ---
  { file: MENU, code: `navigate(ok ? '/a?x=1' : linkTo('home'));`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `navigate(linkTo('home', { page: { q: '왜?' } }));`, rule: '' },
  { file: MENU, code: `<a href={linkTo('home', { page: { q: 'R&D' } })} />`, rule: '' },
  { file: MENU, code: `navigate(confirm('이동할까요?') ? linkTo('home') : linkTo('equipment'));`, rule: '' },

  // --- N1: URL values hidden in ??/||, template substitutions, satisfies ---
  { file: MENU, code: `navigate((preferred ? '/equipment?x=1' : null) ?? linkTo('home'));`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: 'navigate(`/equipment${ok ? \'?x=1\' : \'\'}`);', rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `navigate('/equipment?x=1' satisfies string);`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: 'navigate(`${linkTo(\'home\')}`);', rule: '' },
  { file: MENU, code: `navigate(ok && linkTo('home'));`, rule: '' },
  { file: MENU, code: `navigate(linkTo('home') ?? linkTo('equipment'));`, rule: '' },

  // --- N2: relative sources in TS import type / import-equals escape ---
  { file: MENU, code: `type X = typeof import('../../../../packages/mock-server/src/index');`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `import x = require('../../../../packages/mock-server/src/index');`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `type X = typeof import('../api');`, rule: '' },
];

describe('boundary + contract fixtures', () => {
  it.each(rows)('$# $file $code', async ({ file, code, rule, token }) => {
    const messages = await lint(file, code);
    const dump = JSON.stringify(messages, null, 2);
    if (rule === '') {
      expect(messages, dump).toEqual([]);
      return;
    }
    const hit = messages.filter(
      (m) => m.ruleId === rule && (token === undefined || m.message.includes(token)),
    );
    expect(hit.length, dump).toBeGreaterThan(0);
    expect(
      messages.every((m) => m.ruleId === rule),
      dump,
    ).toBe(true);
  });

  it('keeps the @ap/ prefix literal in src js to prefix.js only', async () => {
    const jsFiles = await listJsFiles(HERE);
    expect(jsFiles.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of jsFiles) {
      if (path.basename(file) === 'prefix.js') continue;
      const text = await readFile(file, 'utf8');
      if (text.includes(PACKAGE_PREFIX)) offenders.push(path.relative(HERE, file));
    }
    expect(offenders).toEqual([]);
  });
});

async function listJsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listJsFiles(full);
      return entry.isFile() && entry.name.endsWith('.js') ? Promise.resolve([full]) : Promise.resolve([]);
    }),
  );
  return nested.flat();
}
