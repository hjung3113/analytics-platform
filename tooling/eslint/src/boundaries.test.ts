import { ESLint } from 'eslint';
import type { Linter, Rule } from 'eslint';
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
  serverConformance,
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
  'packages/server-conformance': serverConformance,
  'menus/home': menu,
  'menus/analytics': menu,
  'menus/metrics': menu,
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
  // #132 removed the src/api.ts migration carve-out: mock-server is legal only under src/mock/**.
  { file: 'menus/home/src/api.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/components';`, rule: '' },
  { file: MENU, code: `import '@ap/ui/styles.css';`, rule: 'no-restricted-imports' },

  // --- #160: the table engine is components-internal; menus ban it statically and dynamically ---
  { file: MENU, code: `import type { ColumnDef } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import { x } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import '@tanstack/react-virtual';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import type { ColumnDef } from '@tanstack/table-core';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import '@tanstack/virtual-core';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `const m = await import('@tanstack/table-core');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `import { x } from '@tanstack/react-table/dist/cjs';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `const m = await import('@tanstack/react-table');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },
  { file: 'packages/components/src/x.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },
  { file: 'packages/shell/src/x.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },

  // --- app mock-server carve-out / D2 (29-36) ---
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/url-contract.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/return-to.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  // #153: the composition root carries no mock — mock-server, menu /mock and ./dev live in src/dev/** only.
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-equipment/mock');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { DevTools } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/main.tsx', code: `import './dev';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('./dev/mock-assembly');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { createAssembly } from '#platform-assembly';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from './devices';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { DevTools } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { x } from './dev/mock-assembly';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: '' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `import { DevTools } from './DevTools';`, rule: '' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/src/index';`, rule: 'no-restricted-imports' },

  // --- composition-root menu subpath allowance (issue #60): main.tsx ONLY ---
  { file: 'apps/platform-web/src/main.tsx', code: `import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `import('@ap/menu-notice-voc/feedbackops-origin');`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-notice-voc/feedbackops-origin';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-notice-voc/styles.css';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-notice-voc/src/feedbackops-origin';`, rule: 'no-restricted-imports' },
  // #145/#153: the server conformance test registers the same menu mocks as the mock assembly (src/dev/**);
  // every other app test still cannot reach a menu `/mock` subpath.
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: '' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { createMockAdapter } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/url-contract.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  // #146 review: the conformance test gets the mock subpaths only — the FeedbackOps origin slot stays main.tsx-only.
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `await import('@ap/menu-notice-voc/feedbackops-origin');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `await import('@ap/menu-equipment/mock');`, rule: '' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  // #145: the conformance kit is adapter-agnostic — contracts only, never the mock it judges, never React.
  { file: 'packages/server-conformance/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },
  { file: 'packages/server-conformance/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/server-conformance/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/server-conformance/src/x.ts', code: `import React from 'react';`, rule: 'no-restricted-imports' },
  // The origin subpath allowance is scoped to src/main.tsx: the other carve-out files keep the
  // deep-subpath ban, static and dynamic.
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `await import('@ap/menu-notice-voc/feedbackops-origin');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import('@ap/menu-notice-voc/feedbackops-origin');`, rule: 'ap/restricted-import-source' },

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
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/home/src/api.ts', code: `import('@ap/mock-server/src/server');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/home/src/api.ts', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
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

  // --- menu mock handlers and composition-root registration (#113) ---
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'menus/home/src/mock/handlers.ts', code: `await import('@ap/mock-server');`, rule: '' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import type { X } from '@ap/contracts';`, rule: '' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from '../endpoints';`, rule: '' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from './sibling';`, rule: '' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'menus/home/src/mock/handlers.ts', code: `import { x } from '@ap/mock-server/src/x';`, rule: 'no-restricted-imports' },
  { file: 'menus/home/src/mock/handlers.ts', code: `await import('@ap/mock-server/src/x');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports', token: 'src/mock/**' },
  { file: MENU, code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source', token: 'src/mock/**' },

  { file: MENU, code: `import { x } from '../mock/handlers';`, rule: 'ap/no-menu-mock-import', token: '@ap/menu-home/mock' },
  { file: MENU, code: `import { x } from '../mock';`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `await import('../mock/handlers');`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/index.ts', code: `export { x } from './mock';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/pages/deep/New.tsx', code: `import { x } from '../../mock/y';`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `require('../mock/x');`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `type X = typeof import('../mock/x');`, rule: 'ap/no-menu-mock-import' },
  // src/mock/** cannot import react (denyReact), and relative imports there are
  // allowlisted (fix round 2): `../api` is rejected wholesale.
  { file: 'menus/home/src/mock/a.ts', code: `import React from 'react';`, rule: 'no-restricted-imports', token: 'react' },

  { file: 'apps/platform-web/src/main.tsx', code: `import { mock } from '@ap/menu-home/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-home/mock');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { mock } from '@ap/menu-home/mock';`, rule: '' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `await import('@ap/menu-home/mock');`, rule: '' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { mock } from '@ap/menu-home/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `await import('@ap/menu-home/mock');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { mock } from '@ap/menu-home/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { mock } from '@ap/menu-home/mock/deep';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-home/mock/deep');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { mock } from '@ap/menu-home/src/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-home/src/mock');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-home/mocks';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { mock } from '@ap/menu-analytics/mock';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `await import('@ap/menu-analytics/mock');`, rule: 'ap/restricted-import-source' },

  // --- fix round 2 / P2: mock handler relative-import allowlist ---
  // A file under src/mock/** may relatively import only src/mock/** and this menu's src/endpoints.
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../api';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../index';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `export { x } from '../api';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `export * from '../index';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `await import('../index');`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `require('../index');`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `type X = typeof import('../api');`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `import x = require('../api');`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../../package.json';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../styles.css';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from './b';`, rule: '' },
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../endpoints';`, rule: '' },
  // #127 closed the temporary step-5 allowance: mock handlers no longer reach into pages.
  { file: 'menus/home/src/mock/a.ts', code: `import { x } from '../pages/x';`, rule: 'ap/no-menu-mock-import' },
  { file: 'menus/home/src/mock/deep/b.ts', code: `import { x } from '../../endpoints';`, rule: '' },

  // --- generated menu-query scaffold is lint-clean as generated (#126) ---
  // The exact import surface gen-menu emits: endpoints.ts → contracts only;
  // src/mock/index.ts → mock-server + own ../endpoints; page → kernel/components + own
  // ../endpoints (never mock). The generator test pins the same set textually.
  { file: 'menus/home/src/endpoints.ts', code: `import { defineEndpoint } from '@ap/contracts';`, rule: '' },
  { file: 'menus/home/src/endpoints.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  {
    file: 'menus/home/src/mock/index.ts',
    code: [
      `import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';`,
      `import { sampleEndpoint } from '../endpoints';`,
      `export const homeMock: readonly AnyMockEndpoint[] = [defineMockEndpoint(sampleEndpoint, { handle: () => ({ ready: true }) })];`,
    ].join('\n'),
    rule: '',
  },
  {
    file: 'menus/home/src/pages/Sample.tsx',
    code: [
      `import { useI18n, useMenuQuery } from '@ap/kernel';`,
      `import { PlatformPage, QueryView } from '@ap/components';`,
      `import { sampleEndpoint } from '../endpoints';`,
      `export default function SampleScreen() { return <PlatformPage />; }`,
    ].join('\n'),
    rule: '',
  },
  { file: 'menus/home/src/pages/Sample.tsx', code: `import { sampleMock } from '../mock';`, rule: 'ap/no-menu-mock-import' },
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

// #160 review P3-4: the dynamic-import rule takes the table-engine list from its options (built from
// index.js), not from a second constant, so static and dynamic decisions cannot drift.
describe('restricted-import-source table-engine list comes from options', () => {
  it('bans exactly the packages passed as tableEnginePackages', async () => {
    const { Linter: LinterClass } = await import('eslint');
    const { default: rule } = await import('./import-source.js');
    const linter = new LinterClass({ configType: 'flat' });
    const run = (code: string) =>
      linter.verify(code, [{
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        plugins: { ap: { rules: { 'restricted-import-source': rule as unknown as Rule.RuleModule } } },
        rules: { 'ap/restricted-import-source': ['error', { denyTableEngine: true, tableEngineMessage: 'engine', tableEnginePackages: ['only-engine'] }] },
      }]);
    expect(run(`import('only-engine/x');`).map((m) => m.message)).toEqual(['engine']);
    expect(run(`import('@tanstack/react-table');`)).toEqual([]);
  });
});
