import { ESLint } from 'eslint';
import type { Linter, Rule } from 'eslint';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  app,
  components,
  contractSchemas,
  contracts,
  eqvCore,
  eqvHost,
  eqvUi,
  featureBridgePreset,
  featureBridgeMenuPreset,
  featureScreensPreset,
  featureServerPreset,
  featureSharedPreset,
  featureUiPreset,
  hostModule,
  hostModuleDir,
  httpAdapter,
  kernel,
  menu,
  mockServer,
  serverConformance,
  shell,
  ui,
} from './index.js';
import { PACKAGE_PREFIX } from './prefix.js';
import { featureBridgeEntrySources, featureBridgeEntrySubpaths } from './feature-bridge-entries.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

const PRESETS: Record<string, Linter.Config[]> = {
  'packages/sdk/contracts': contracts,
  'packages/sdk/contract-schemas': contractSchemas,
  'packages/sdk/ui': ui,
  'packages/sdk/kernel': kernel,
  'packages/sdk/components': components,
  'packages/sdk/shell': shell,
  'packages/adapters/mock-server': mockServer,
  'packages/adapters/http-adapter': httpAdapter,
  'modules/fixture': hostModule,
  'packages/adapters/server-conformance': serverConformance,
  'platform/home': menu,
  'menus/mars/analytics': menu,
  'menus/bravo/metrics': menu,
  'packages/adapters/feature-bridge': featureBridgePreset,
  'platform/my-activity': featureBridgeMenuPreset,
  'platform/voc': featureBridgeMenuPreset,
  'menus/log-dev/log-models': featureBridgeMenuPreset,
  'menus/log-dev/log-analysis': menu,
  'apps/platform-web': app,
};

async function lint(relFile: string, code: string): Promise<Linter.LintMessage[]> {
  const pkgDir = relFile.split('/').slice(0, relFile.startsWith('menus/') || /^packages\/(sdk|adapters)\//.test(relFile) ? 3 : 2).join('/');
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

const EQV = path.join(HERE, 'fixtures', 'eqv-module');

/** The shell package with its fixture module directory under hostModuleDir, as packages/sdk/shell/eslint.config.js composes it. */
const SHELL_FIXTURE_DIR = 'src/__fixtures__/module-fixture';
async function lintShellFixture(relFile: string, code: string): Promise<Linter.LintMessage[]> {
  const cwd = path.join(REPO_ROOT, 'packages/sdk/shell');
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [...shell, ...hostModuleDir(SHELL_FIXTURE_DIR)] });
  const results = await eslint.lintText(code, { filePath: path.join(cwd, relFile) });
  return results[0]?.messages ?? [];
}

/** hostModule on an external package whose name is not in the platform scope (fixtures/eqv-module). */
async function lintExternal(relFile: string, code: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({ cwd: EQV, overrideConfigFile: true, overrideConfig: hostModule });
  const results = await eslint.lintText(code, { filePath: path.join(EQV, relFile) });
  return results[0]?.messages ?? [];
}

interface Row {
  /** Repo-relative file path; space and group segments pick menu packages; packages/sdk and packages/adapters packages use three, other packages two. */
  file: string;
  code: string;
  /** Expected rule id; '' means the code must lint clean; null is a linter report with no rule (an unused disable directive). */
  rule: string | null;
  /** Distinct substring of the expected message, to pin which selector fired. */
  token?: string;
}

const MENU = 'platform/home/src/pages/x.tsx';

const rows: Row[] = [
  // --- layer allowlists (1-19) ---
  { file: 'packages/sdk/contracts/src/x.ts', code: `import type { X } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contracts/src/x.ts', code: `import type { ReactNode } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contracts/src/x.ts', code: `export const n = 1;`, rule: '' },
  // --- contractSchemas (ADR-0096): zod only in src; tests may read @ap/contracts and its vocab.json ---
  { file: 'packages/sdk/contract-schemas/src/x.ts', code: `import { z } from 'zod/v4';`, rule: '' },
  { file: 'packages/sdk/contract-schemas/src/x.ts', code: `import type { X } from '@ap/contracts';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contract-schemas/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contract-schemas/src/x.ts', code: `import type { ReactNode } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contract-schemas/src/x.test.ts', code: `import type { Trust } from '@ap/contracts';`, rule: '' },
  { file: 'packages/sdk/contract-schemas/src/x.test.ts', code: `import vocab from '@ap/contracts/vocab.json';`, rule: '' },
  { file: 'packages/sdk/contract-schemas/src/x.test.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contract-schemas/src/x.test.ts', code: `import { x } from '@ap/contracts/src/url';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/ui/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/ui/src/x.ts', code: `import * as React from 'react';`, rule: '' },
  { file: 'packages/sdk/ui/src/x.ts', code: `import { cn } from './utils/cn';`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/menu-home';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/contracts/src/url';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { cn } from '@ap/ui';`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { readColorToken } from '@ap/ui/theme';`, rule: '' },
  { file: MENU, code: `import tokens from '@ap/ui/theme-tokens.json';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { readColorToken } from '@ap/ui/theme';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import tokens from '@ap/ui/theme-tokens.json';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import tokens from '@ap/ui/src/styles/tokens.css';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { readColorToken } from '@ap/ui/theme';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import tokens from '@ap/ui/theme-tokens.json';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import tokens from '@ap/ui/src/styles/tokens.css';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from '@ap/components';`, rule: '' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (group.id === 'overview') render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if ('home' === menu.id) render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (group.id === selectedGroupId) render();`, rule: '' },
  // Registry ids are rejected whatever the local name or syntax (Codex review on #206, Opus P2-1).
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (item.id === 'home') render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `const a = registry.groups.filter(g => g.id === 'overview');`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `const a = menus.filter(m => m.group === 'overview');`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (group?.id === 'overview') render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (route.menu.id === 'home') render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: 'if (group.id === `overview`) render();', rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `switch (group.id) { case 'overview': break; }`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (['overview'].includes(group.id)) render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `const g = registry.groupById('overview');`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (r.menuId === 'home') render();`, rule: 'ap/no-shell-id-literal-comparison', token: 'Registry' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `const g = registry.groupById(route.menu.group);`, rule: '' },
  { file: 'packages/sdk/shell/src/frame/AppSidebar.tsx', code: `if (tst.tone === 'danger') render();`, rule: '' },
  { file: 'packages/adapters/mock-server/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/mock-server/src/x.ts', code: `import type { X } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/mock-server/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },

  // --- hostModule (ADR-0053): contracts and ui (with CSS subpaths) only ---
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/components';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/menu-home';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'modules/fixture/src/x.ts', code: `import type { ModuleHost } from '@ap/contracts';`, rule: '' },
  { file: 'modules/fixture/src/x.ts', code: `import { cn } from '@ap/ui';`, rule: '' },
  { file: 'modules/fixture/src/x.ts', code: `import '@ap/ui/styles.css';`, rule: '' },
  { file: 'modules/fixture/src/x.ts', code: `import '@ap/ui/styles/tokens.css';`, rule: '' },
  { file: 'modules/fixture/src/x.ts', code: `import { x } from '@ap/ui/src/index';`, rule: 'no-restricted-imports' },

  // --- menu mock-server carve-out (20-28) ---
  { file: MENU, code: `import { x } from '@ap/menu-equipment';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/api.test.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  // #132 removed the src/api.ts migration carve-out: mock-server is legal only under src/mock/**.
  { file: 'platform/home/src/api.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/components';`, rule: '' },
  { file: MENU, code: `import '@ap/ui/styles.css';`, rule: 'no-restricted-imports' },

  // --- ADR-0040 (#381): `@ap/kernel/testing` is test-only; production files and other deep subpaths stay banned ---
  { file: MENU, code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `const m = await import('@ap/kernel/testing');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `const m = await import('@ap/kernel/testing');`, rule: '' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { x } from '@ap/kernel/src/platform';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/test-support.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'packages/sdk/components/src/archetypes/PlatformPage.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/archetypes/__tests__/PlatformPage.test.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'packages/sdk/shell/src/frame/AppShell.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/shell/src/frame/__tests__/AppShell.test.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'packages/sdk/shell/src/test-setup.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.test.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.test.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/server-conformance/src/x.test.ts', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },

  // --- #413 (ADR-0040 extension): `@ap/components/testing` is test-only, for the layers above components ---
  { file: MENU, code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `const m = await import('@ap/components/testing');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: '' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `const m = await import('@ap/components/testing');`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.test.ts', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: '' },
  { file: 'packages/sdk/shell/src/frame/__tests__/AppShell.test.tsx', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.test.tsx', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.test.tsx', code: `import { stubCompactTableGeometry } from './testing';`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.test.ts', code: `import { stubCompactTableGeometry } from '@ap/components/testing';`, rule: 'no-restricted-imports' },

  // --- #160: the table engine is components-internal; menus ban it statically and dynamically ---
  { file: MENU, code: `import type { ColumnDef } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import { x } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import '@tanstack/react-virtual';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import type { ColumnDef } from '@tanstack/table-core';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `import '@tanstack/virtual-core';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `const m = await import('@tanstack/table-core');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `import { x } from '@tanstack/react-table/dist/cjs';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: MENU, code: `const m = await import('@tanstack/react-table');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '@tanstack/react-table';`, rule: 'no-restricted-imports', token: 'table engine' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from '@tanstack/react-table';`, rule: '' },

  // --- ADR-0086: the Kernel's query engine is kernel-internal; menus, components, shell and the app ban it statically and dynamically, kernel and the feature-bridge package pass ---
  { file: MENU, code: `import { useQuery } from '@tanstack/react-query';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: MENU, code: `import { useQuery } from '@tanstack/react-query/build/modern';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: MENU, code: `const m = await import('@tanstack/react-query');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { useQuery } from '@tanstack/react-query';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { useQuery } from '@tanstack/react-query';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: 'packages/sdk/components/src/x.ts', code: `const m = await import('@tanstack/react-query');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { useQuery } from '@tanstack/react-query';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: 'packages/sdk/shell/src/x.ts', code: `const m = await import('@tanstack/react-query');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { useQuery } from '@tanstack/react-query';`, rule: 'no-restricted-imports', token: 'query engine' },
  { file: 'apps/platform-web/src/menus.ts', code: `const m = await import('@tanstack/react-query');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { useQuery } from '@tanstack/react-query';`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `const m = await import('@tanstack/react-query');`, rule: '' },
  { file: 'packages/adapters/feature-bridge/src/nav-counts.tsx', code: `import { useQuery } from '@tanstack/react-query';`, rule: '' },
  { file: 'packages/adapters/feature-bridge/src/pages/SavedViews.tsx', code: `import { useQuery } from '@tanstack/react-query';`, rule: '' },

  // --- ADR-0067 (#575): `@ap/components/dock` is a host-only entry (shell, app); the dock engine is components-internal ---
  { file: 'packages/sdk/shell/src/x.ts', code: `import { DockLayout } from '@ap/components/dock';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `const m = await import('@ap/components/dock');`, rule: '' },
  { file: 'packages/sdk/shell/src/x.test.tsx', code: `import { DockLayout } from '@ap/components/dock';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { DockLayout } from '@ap/components/dock';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `const m = await import('@ap/components/dock');`, rule: '' },
  { file: MENU, code: `import { DockLayout } from '@ap/components/dock';`, rule: 'no-restricted-imports', token: 'host-only' },
  { file: MENU, code: `const m = await import('@ap/components/dock');`, rule: 'ap/restricted-import-source', },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { DockLayout } from '@ap/components/dock';`, rule: 'no-restricted-imports', token: 'host-only' },
  { file: 'modules/fixture/src/x.ts', code: `import { DockLayout } from '@ap/components/dock';`, rule: 'no-restricted-imports', token: 'host-only' },
  { file: 'modules/fixture/src/x.ts', code: `const m = await import('@ap/components/dock');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from '@ap/components/dock/src/DockEngine';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/components/dock/src/DockEngine';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import 'dockview-react/dist/styles/dockview.css';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from 'dockview';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from 'dockview-core';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/shell/src/x.ts', code: `const m = await import('dockview-react');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/shell/src/x.test.tsx', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: MENU, code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: MENU, code: `const m = await import('dockview-react');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'apps/platform-web/src/menus.ts', code: `const m = await import('dockview-react');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/ui/src/x.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'modules/fixture/src/x.ts', code: `import { DockviewReact } from 'dockview-react';`, rule: 'no-restricted-imports', token: 'ADR-0067' },
  { file: 'packages/sdk/components/src/dock/DockEngine.tsx', code: `import { DockviewReact } from 'dockview-react';`, rule: '' },
  { file: 'packages/sdk/components/src/dock/DockEngine.tsx', code: `import 'dockview-react/dist/styles/dockview.css';`, rule: '' },
  { file: 'packages/sdk/components/src/dock/DockEngine.tsx', code: `const m = await import('dockview-react');`, rule: '' },
  { file: 'packages/sdk/components/src/dock/DockLayout.test.tsx', code: `import { x } from 'dockview-core';`, rule: '' },
  // --- ADR-0076: `@ap/kernel/host` is the shell, components and app surface; menus use usePlatform() from `@ap/kernel` ---
  { file: 'packages/sdk/shell/src/x.ts', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `const m = await import('@ap/kernel/host');`, rule: '' },
  { file: 'packages/sdk/shell/src/x.test.tsx', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: 'packages/sdk/components/src/x.test.tsx', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: '' },
  { file: MENU, code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: 'no-restricted-imports', token: 'ADR-0076' },
  { file: MENU, code: `const m = await import('@ap/kernel/host');`, rule: 'ap/restricted-import-source', token: 'ADR-0076' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: 'no-restricted-imports', token: 'ADR-0076' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: 'no-restricted-imports', token: 'ADR-0076' },
  { file: 'modules/fixture/src/x.ts', code: `import { useHostPlatform } from '@ap/kernel/host';`, rule: 'no-restricted-imports', token: 'ADR-0076' },
  { file: 'modules/fixture/src/x.ts', code: `const m = await import('@ap/kernel/host');`, rule: 'ap/restricted-import-source', token: 'ADR-0076' },

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
  // #153 review P3-2: Vite root-absolute /src/dev and case variants are banned too, static and dynamic.
  { file: 'apps/platform-web/src/main.tsx', code: `import '/src/dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('/src/dev/mock-assembly');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from './DEV/x';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('./DEV/x');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '/src/devices';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { DevTools } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  // #153 follow-up: the conformance test reads MOCK_ENDPOINTS from the mock assembly — that exact module only.
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { MOCK_ENDPOINTS } from './dev/mock-assembly';`, rule: '' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { DevTools } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { x } from './dev/mock-assembly.tsx';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `await import('./dev/DevTools');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/url-contract.test.ts', code: `import { MOCK_ENDPOINTS } from './dev/mock-assembly';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from './dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: '' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `import { DevTools } from './DevTools';`, rule: '' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  // #801: EV's synthetic endpoint data is a dev-assembly and conformance-test import only.
  { file: 'apps/platform-web/src/dev/eqv-mock.ts', code: `import { eqvMockContext } from '@eqv/platform-adapter/mock-data';`, rule: '' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { EQV_MOCK_WINDOW } from '@eqv/platform-adapter/mock-data';`, rule: '' },
  { file: 'apps/platform-web/src/modules.ts', code: `import { eqvMockContext } from '@eqv/platform-adapter/mock-data';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@eqv/platform-adapter/mock-data');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/modules.ts', code: `import { eqvManifest } from '@eqv/platform-adapter';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/src/index';`, rule: 'no-restricted-imports' },

  // --- composition-root menu subpath allowance (issue #60): main.tsx ONLY ---
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-notice-voc/styles.css';`, rule: 'no-restricted-imports' },
  // #145/#153: the server conformance test takes its endpoints from the mock assembly's MOCK_ENDPOINTS, so it no
  // longer reaches a menu `/mock` subpath itself; only src/dev/** does.
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { createMockAdapter } from '@ap/mock-server';`, rule: '' },
  { file: 'apps/platform-web/src/url-contract.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `await import('@ap/menu-equipment/mock');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { equipmentMock } from '@ap/menu-equipment/mock';`, rule: 'no-restricted-imports' },
  // #145: the conformance kit is adapter-agnostic — contracts only, never the mock it judges, never React.
  { file: 'packages/adapters/server-conformance/src/x.ts', code: `import { x } from '@ap/contracts';`, rule: '' },
  { file: 'packages/adapters/server-conformance/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/server-conformance/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/server-conformance/src/x.ts', code: `import React from 'react';`, rule: 'no-restricted-imports' },

  // --- relative package escape (37-41) ---
  { file: MENU, code: `import { x } from '../../../../packages/sdk/contracts/src/url';`, rule: 'ap/no-relative-package-escape' },
  { file: 'platform/home/src/index.ts', code: `import { x } from '../../../analytics/equipment/src/index';`, rule: 'ap/no-relative-package-escape' },
  { file: 'platform/home/src/index.ts', code: `import { x } from '../../dashboard/src/index';`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `import { x } from '../api';`, rule: '' },
  { file: 'packages/sdk/kernel/src/platform.tsx', code: `import { x } from './registry';`, rule: '' },
  { file: 'packages/sdk/kernel/src/platform.tsx', code: `import('../../platform/home/src/index');`, rule: 'ap/no-relative-package-escape' },

  // --- hand-built query strings in menus (42-55) ---
  { file: MENU, code: `<a href="/equipment?v=1" />`, rule: 'ap/no-hand-built-url', token: 'query string' },
  { file: MENU, code: `<a href={'/equipment?v=1&scopeId=MEM'} />`, rule: 'ap/no-hand-built-url', token: 'query string' },
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
  { file: 'packages/sdk/contracts/src/x.ts', code: `export const q = '?' + params.toString();`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `navigate(pathname + buildQuery(global));`, rule: '' },

  // --- web storage in menus (56-63) ---
  { file: MENU, code: `sessionStorage.getItem('k');`, rule: 'no-restricted-globals' },
  { file: MENU, code: `localStorage.setItem('k', 'v');`, rule: 'no-restricted-globals' },
  { file: MENU, code: `window.sessionStorage.getItem('k');`, rule: 'no-restricted-syntax', token: 'web storage' },
  { file: MENU, code: `globalThis.localStorage.setItem('k', 'v');`, rule: 'no-restricted-syntax', token: 'web storage' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `localStorage.setItem('k', 'v');`, rule: '' },
  { file: 'packages/sdk/shell/src/x.ts', code: `localStorage.getItem('k');`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `localStorage.setItem('k', 'v');`, rule: '' },
  { file: 'packages/adapters/mock-server/src/x.ts', code: `localStorage.getItem('k');`, rule: '' },

  // --- location writes and reads (64-73) ---
  { file: MENU, code: `window.location.href = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location.assign('/x');`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location.replace('/x');`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `location.href = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `window.location = '/x';`, rule: 'no-restricted-syntax', token: 'window.location' },
  { file: MENU, code: `void window.location.origin;`, rule: '' },
  { file: MENU, code: `anchor.replace('T', ' ');`, rule: '' },
  { file: MENU, code: `a.href = URL.createObjectURL(blob);`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `window.history.replaceState(null, '', next);`, rule: '' },
  { file: MENU, code: `window?.location?.assign('/x');`, rule: '' },

  // --- F1: dynamic import / import() type / require must obey boundaries ---
  { file: 'platform/home/src/api.test.ts', code: `const m = await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `await import('@ap/shell');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/contracts/src/x.ts', code: `type X = import('react').ReactNode;`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `require('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `require('../../../../packages/sdk/contracts/src/url');`, rule: 'ap/no-relative-package-escape' },
  { file: 'apps/platform-web/src/main.tsx', code: `import('@ap/mock-server/src/server');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/api.ts', code: `import('@ap/mock-server/src/server');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/api.ts', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `await import('@ap/mock-server');`, rule: '' },
  { file: MENU, code: `lazy(() => import('./pages/X'));`, rule: '' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `await import('@ap/contracts');`, rule: '' },
  { file: MENU, code: `lazy(() => import('@ap/menu-equipment'));`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source' },

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
  { file: MENU, code: `type X = typeof import('../../../../../packages/adapters/mock-server/src/index');`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `import x = require('../../../../../packages/adapters/mock-server/src/index');`, rule: 'ap/no-relative-package-escape' },
  { file: MENU, code: `type X = typeof import('../api');`, rule: '' },

  // --- menu mock handlers and composition-root registration (#113) ---
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: 'platform/home/src/mock/handlers.ts', code: `await import('@ap/mock-server');`, rule: '' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import type { X } from '@ap/contracts';`, rule: '' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '../endpoints';`, rule: '' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from './sibling';`, rule: '' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '@ap/mock-server/src/x';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/mock/handlers.ts', code: `await import('@ap/mock-server/src/x');`, rule: 'ap/restricted-import-source' },
  { file: MENU, code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports', token: 'src/mock/**' },
  { file: MENU, code: `await import('@ap/mock-server');`, rule: 'ap/restricted-import-source', token: 'src/mock/**' },

  { file: MENU, code: `import { x } from '../mock/handlers';`, rule: 'ap/no-menu-mock-import', token: '@ap/menu-home/mock' },
  { file: MENU, code: `import { x } from '../mock';`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `await import('../mock/handlers');`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/index.ts', code: `export { x } from './mock';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/pages/deep/New.tsx', code: `import { x } from '../../mock/y';`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `require('../mock/x');`, rule: 'ap/no-menu-mock-import' },
  { file: MENU, code: `type X = typeof import('../mock/x');`, rule: 'ap/no-menu-mock-import' },
  // src/mock/** cannot import react (denyReact), and relative imports there are
  // allowlisted (fix round 2): `../api` is rejected wholesale.
  { file: 'platform/home/src/mock/a.ts', code: `import React from 'react';`, rule: 'no-restricted-imports', token: 'react' },

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

  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/launcher';`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `await import('@ap/menu-home/launcher');`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/launcher/x';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `await import('@ap/menu-home/launcher/x');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-home/src/launcher';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `await import('@ap/menu-home/src/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/menu-analytics/launcher';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `await import('@ap/menu-analytics/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-home/launcher';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-home/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `import { x } from '@ap/menu-home/launcher';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/dev/DevTools.tsx', code: `await import('@ap/menu-home/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/menus.test.ts', code: `import { x } from '@ap/menu-home/launcher';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.test.ts', code: `await import('@ap/menu-home/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/pages/Other.tsx', code: `import { x } from '@ap/menu-home/launcher';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/pages/Other.tsx', code: `await import('@ap/menu-home/launcher');`, rule: 'ap/restricted-import-source' },
  { file: 'menus/mars/analytics/src/pages/Other.tsx', code: `import { x } from '@ap/menu-home/launcher';`, rule: 'no-restricted-imports' },
  { file: 'menus/mars/analytics/src/pages/Other.tsx', code: `await import('@ap/menu-home/launcher');`, rule: 'ap/restricted-import-source' },

  // --- fix round 2 / P2: mock handler relative-import allowlist ---
  // A file under src/mock/** may relatively import only src/mock/** and this menu's src/endpoints.
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../api';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../index';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `export { x } from '../api';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `export * from '../index';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `await import('../index');`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `require('../index');`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `type X = typeof import('../api');`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `import x = require('../api');`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../../package.json';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../styles.css';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from './b';`, rule: '' },
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../endpoints';`, rule: '' },
  // #127 closed the temporary step-5 allowance: mock handlers no longer reach into pages.
  { file: 'platform/home/src/mock/a.ts', code: `import { x } from '../pages/x';`, rule: 'ap/no-menu-mock-import' },
  { file: 'platform/home/src/mock/deep/b.ts', code: `import { x } from '../../endpoints';`, rule: '' },

  // --- generated menu-query scaffold is lint-clean as generated (#126) ---
  // The exact import surface gen-menu emits: endpoints.ts → contracts only;
  // src/mock/index.ts → mock-server + own ../endpoints; page → kernel/components + own
  // ../endpoints (never mock). The generator test pins the same set textually.
  { file: 'platform/home/src/endpoints.ts', code: `import { defineEndpoint } from '@ap/contracts';`, rule: '' },
  { file: 'platform/home/src/endpoints.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  {
    file: 'platform/home/src/mock/index.ts',
    code: [
      `import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';`,
      `import { sampleEndpoint } from '../endpoints';`,
      `export const homeMock: readonly AnyMockEndpoint[] = [defineMockEndpoint(sampleEndpoint, { handle: () => ({ ready: true }) })];`,
    ].join('\n'),
    rule: '',
  },
  {
    file: 'platform/home/src/pages/Sample.tsx',
    code: [
      `import { useI18n, useMenuQuery } from '@ap/kernel';`,
      `import { PlatformPage, QueryView } from '@ap/components';`,
      `import { sampleEndpoint } from '../endpoints';`,
      `export default function SampleScreen() { return <PlatformPage />; }`,
    ].join('\n'),
    rule: '',
  },
  { file: 'platform/home/src/pages/Sample.tsx', code: `import { sampleMock } from '../mock';`, rule: 'ap/no-menu-mock-import' },
  // --- #154: the real-server adapter is contracts-only and reaches the app through src/real/** only ---
  { file: 'packages/adapters/http-adapter/src/x.ts', code: `import { PortError } from '@ap/contracts';`, rule: '' },
  { file: 'packages/adapters/http-adapter/src/x.ts', code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/http-adapter/src/x.ts', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/http-adapter/src/x.ts', code: `import type { ReactNode } from 'react';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/mock-server/src/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'packages/adapters/server-conformance/src/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/mock/handlers.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports', token: 'src/real' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports', token: 'src/real' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/http-adapter');`, rule: 'ap/restricted-import-source', token: 'src/real' },
  { file: 'apps/platform-web/src/menus.test.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/dev/mock-assembly.tsx', code: `await import('@ap/http-adapter');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/server-conformance.test.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/published-metrics.test.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `import { bootstrapHttpAdapter } from '@ap/http-adapter';`, rule: '' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `const m = await import('@ap/http-adapter');`, rule: '' },
  { file: 'apps/platform-web/src/real/deep/x.ts', code: `import { bootstrapHttpAdapter } from '@ap/http-adapter';`, rule: '' },
  { file: 'apps/platform-web/src/real/http-assembly.test.tsx', code: `import { bootstrapHttpAdapter } from '@ap/http-adapter';`, rule: '' },
  { file: 'apps/platform-web/src/real/http-assembly.test.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `import { x } from '@ap/http-adapter/src/index';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `await import('@ap/http-adapter/src/index');`, rule: 'ap/restricted-import-source' },
  // The production assembly stays free of mock and dev code (ADR-0009).
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `import { DevTools } from '../dev/DevTools';`, rule: 'no-restricted-imports', token: 'ADR-0009' },
  { file: 'apps/platform-web/src/real/http-assembly.tsx', code: `await import('../dev/mock-assembly');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/realm/x.ts', code: `import { x } from '@ap/http-adapter';`, rule: 'no-restricted-imports' },
];

// No platform package imports feature packages any more: the design system moved into @ap/ui (ADR-0046, #441), @ap/ui included.
// Exercise the root entry and deep imports through both static and dynamic syntax in each platform layer.
const FEATURE_BOUNDARY_FILES = [
  'packages/sdk/ui/src/x.ts',
  'packages/sdk/kernel/src/x.ts',
  'packages/sdk/components/src/x.ts',
  'packages/sdk/shell/src/x.ts',
  MENU,
  'apps/platform-web/src/menus.ts',
  'apps/platform-web/src/main.tsx',
];

for (const file of FEATURE_BOUNDARY_FILES) {
  rows.push(
    { file, code: `import { Button } from '@ap/feature-ui';`, rule: 'no-restricted-imports', token: '@ap/ui' },
    { file, code: `import { Button } from '@ap/feature-ui/src/button';`, rule: 'no-restricted-imports', token: '@ap/ui' },
    { file, code: `void import('@ap/feature-ui');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
    { file, code: `void import('@ap/feature-ui/src/button');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  );
}

// Rule 8 exception (ADR-0071): the bridge menu imports exactly @ap/feature-screens/global-screens and its /core subpath; every other menu still cannot.
const BRIDGE = 'platform/my-activity/src/pages/x.tsx';
const GLOBAL_SCREENS = '@ap/feature-screens/global-screens';
const GLOBAL_SCREENS_CORE = '@ap/feature-screens/global-screens/core';
const SCOPE_PICKER = '@ap/feature-screens/operator-screens/scope-picker';
const OPERATOR_DASHBOARD = '@ap/feature-screens/operator-screens/dashboard';
rows.push(
  { file: BRIDGE, code: `import { InboxPanel } from '${GLOBAL_SCREENS}';`, rule: '' },
  { file: BRIDGE, code: `void import('${GLOBAL_SCREENS}');`, rule: '' },
  { file: BRIDGE, code: `import { InboxPanel } from '${GLOBAL_SCREENS_CORE}';`, rule: '' },
  { file: BRIDGE, code: `void import('${GLOBAL_SCREENS_CORE}');`, rule: '' },
  { file: BRIDGE, code: `import { ManagedSystemScopeControl } from '${SCOPE_PICKER}';`, rule: '' },
  { file: BRIDGE, code: `void import('${SCOPE_PICKER}');`, rule: '' },
  { file: MENU, code: `import { ManagedSystemScopeControl } from '${SCOPE_PICKER}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: MENU, code: `void import('${SCOPE_PICKER}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  { file: MENU, code: `import { InboxPanel } from '${GLOBAL_SCREENS_CORE}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: MENU, code: `import { InboxPanel } from '${GLOBAL_SCREENS}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: MENU, code: `void import('${GLOBAL_SCREENS}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  // The operator dashboard entry (#759): a bridge menu may import it, a non-bridge menu and the feature-bridge runtime's eager code may not.
  { file: BRIDGE, code: `import { DashboardScreen } from '${OPERATOR_DASHBOARD}';`, rule: '' },
  { file: BRIDGE, code: `void import('${OPERATOR_DASHBOARD}');`, rule: '' },
  { file: MENU, code: `import { DashboardScreen } from '${OPERATOR_DASHBOARD}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: MENU, code: `void import('${OPERATOR_DASHBOARD}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  { file: `${'packages/adapters/feature-bridge/src'}/feature/session.ts`, code: `import { x } from '${OPERATOR_DASHBOARD}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
);
// The operator VOC entries (#761): the feature VOC bridge menu may import them (static and dynamic); a non-bridge menu and the feature-bridge runtime's eager code may not.
const FEATURE_VOC = 'platform/voc/src/pages/x.tsx';
// The entry list is `apps/feature-screens/package.json` `exports` (one list, #1640): adding an entry there adds its rows here.
for (const source of featureBridgeEntrySources().filter((entry) => entry.startsWith('@ap/feature-screens/operator-screens/'))) {
  rows.push(
    { file: FEATURE_VOC, code: `import { x } from '${source}';`, rule: '' },
    { file: FEATURE_VOC, code: `void import('${source}');`, rule: '' },
    { file: MENU, code: `import { x } from '${source}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
    { file: MENU, code: `void import('${source}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
    { file: `${'packages/adapters/feature-bridge/src'}/feature/session.ts`, code: `import { x } from '${source}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  );
}
for (const source of ['@ap/feature-screens', '@ap/feature-screens/src/main', '@ap/feature-screens/global-screens/FeatureScreenRoot', '@ap/feature-ui', '@ap/feature-shared']) {
  rows.push(
    { file: BRIDGE, code: `import { x } from '${source}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
    { file: BRIDGE, code: `void import('${source}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  );
}

// `@ap/feature-bridge` (ADR-0071, ADR-0081): bridge runtime, importable by bridge menus (root) and the app; `/core` only, lazy pages may see the screen barrel.
const FEATURE_PKG = 'packages/adapters/feature-bridge/src';
for (const source of ['@ap/kernel', '@ap/components', '@ap/ui', '@ap/contracts']) {
  rows.push({ file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '${source}';`, rule: '' });
}
rows.push(
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '${GLOBAL_SCREENS_CORE}';`, rule: '' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `void import('${GLOBAL_SCREENS_CORE}');`, rule: '' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '${GLOBAL_SCREENS}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/home-todo-slot.tsx`, code: `import { x } from '${GLOBAL_SCREENS}';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/home-todo-slot.tsx`, code: `void import('${GLOBAL_SCREENS}');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/pages/HomeTodo.tsx`, code: `import { HomeTodoPanel } from '${GLOBAL_SCREENS}';`, rule: '' },
  // The notifications panel entry: only a lazy page (and a bridge menu) may import it, never the eagerly loaded slot.
  { file: `${FEATURE_PKG}/pages/RecentInbox.tsx`, code: `import { InboxPanel } from '@ap/feature-screens/global-screens/inbox-panel';`, rule: '' },
  { file: `${FEATURE_PKG}/notifications-slot.tsx`, code: `import { InboxPanel } from '@ap/feature-screens/global-screens/inbox-panel';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/notifications-slot.tsx`, code: `void import('@ap/feature-screens/global-screens/inbox-panel');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
  { file: MENU, code: `import { InboxPanel } from '@ap/feature-screens/global-screens/inbox-panel';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/pages/HomeTodo.tsx`, code: `import { x } from '@ap/feature-ui';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '@ap/feature-screens/global-screens/FeatureScreenRoot';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '@ap/shell';`, rule: 'no-restricted-imports' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '@ap/menu-home';`, rule: 'no-restricted-imports' },
  { file: `${FEATURE_PKG}/feature/session.ts`, code: `import { x } from '@ap/mock-server';`, rule: 'no-restricted-imports' },
  // A bridge menu imports the bridge root; a non-bridge menu, and every layer below the menus, may not.
  { file: BRIDGE, code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: '' },
  { file: MENU, code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: MENU, code: `void import('@ap/feature-bridge');`, rule: 'ap/restricted-import-source' },
  { file: 'packages/sdk/shell/src/x.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/components/src/x.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/ui/src/x.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: 'packages/sdk/contracts/src/x.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  // Bridge subpaths: only the app's main.tsx (slots), and bridge-menu tests (slots and lazy pages); production menu files see the root only.
  { file: BRIDGE, code: `import { setFeatureApi } from '@ap/feature-bridge/feature-api';`, rule: 'no-restricted-imports' },
  { file: 'platform/my-activity/src/pages/x.test.tsx', code: `import { setFeatureApi } from '@ap/feature-bridge/feature-api';`, rule: '' },
  { file: 'platform/my-activity/src/pages/x.test.tsx', code: `import HomeTodo from '@ap/feature-bridge/home-todo-page';`, rule: '' },
  { file: 'platform/my-activity/src/pages/x.test.tsx', code: `import { x } from '@ap/feature-bridge/src/feature-api';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { featureQueryClient } from '@ap/feature-bridge';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/home-todo-page';`, rule: 'no-restricted-imports' },
);

// A bridge menu's src/mock/** tests keep the mock policy (contracts + mock-server only): the bridge test-entry override must not replace it.
const BRIDGE_MOCK_TEST = 'platform/my-activity/src/mock/x.test.ts';
rows.push(
  { file: BRIDGE_MOCK_TEST, code: `import { x } from '@ap/mock-server';`, rule: '' },
  { file: BRIDGE_MOCK_TEST, code: `await import('@ap/mock-server');`, rule: '' },
  { file: BRIDGE_MOCK_TEST, code: `import type { X } from '@ap/contracts';`, rule: '' },
  { file: BRIDGE_MOCK_TEST, code: `import React from 'react';`, rule: 'no-restricted-imports' },
  { file: BRIDGE_MOCK_TEST, code: `void import('react');`, rule: 'ap/restricted-import-source' },
  { file: BRIDGE_MOCK_TEST, code: `import { x } from '@ap/kernel';`, rule: 'no-restricted-imports' },
  { file: BRIDGE_MOCK_TEST, code: `void import('@ap/kernel');`, rule: 'ap/restricted-import-source' },
  { file: BRIDGE_MOCK_TEST, code: `import { x } from '@ap/feature-bridge';`, rule: 'no-restricted-imports' },
  { file: BRIDGE_MOCK_TEST, code: `void import('@ap/feature-bridge');`, rule: 'ap/restricted-import-source' },
  { file: BRIDGE_MOCK_TEST, code: `import { x } from '@ap/feature-screens/global-screens';`, rule: 'no-restricted-imports' },
  { file: BRIDGE_MOCK_TEST, code: `void import('@ap/feature-screens/global-screens');`, rule: 'ap/restricted-import-source' },
);

// The screen API slot (feature-api) is main.tsx-only.
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { setFeatureApi } from '@ap/feature-bridge/feature-api';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `void import('@ap/feature-bridge/feature-api');`, rule: '' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { setFeatureApi } from '@ap/feature-bridge/feature-api';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/feature-api';`, rule: 'no-restricted-imports' },
);

// The notifications slot is main.tsx-only as well (#652); `src/slots.ts` receives the value as a parameter.
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `void import('@ap/feature-bridge/notifications-slot');`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/notifications-slot';`, rule: 'no-restricted-imports' },
  { file: 'platform/my-activity/src/feature/test-support.tsx', code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
);

// The VOC compose slot is main.tsx-only too (#656); `src/slots.ts` receives the value as a parameter.
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { vocComposeSlot } from '@ap/feature-bridge/voc-compose-slot';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { vocComposeSlot } from '@ap/feature-bridge/voc-compose-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/voc-compose-slot';`, rule: 'no-restricted-imports' },
);

// Improvement assignments enter home only through the app composition root (#1328 e2).
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-improvement-items/home-todo-slot';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-improvement-items/home-todo-slot');`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { x } from '@ap/menu-improvement-items/home-todo-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/slots.ts', code: `await import('@ap/menu-improvement-items/home-todo-slot');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/pages/Home.tsx', code: `import { x } from '@ap/menu-improvement-items/home-todo-slot';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/pages/Home.tsx', code: `await import('@ap/menu-improvement-items/home-todo-slot');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-improvement-items/home-todo-slot/x';`, rule: 'no-restricted-imports' },
);

// Analysis actions are injected only by the app composition root (#1408).
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-improvement-items/analysis-actions';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `await import('@ap/menu-improvement-items/analysis-actions');`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { x } from '@ap/menu-improvement-items/analysis-actions';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/slots.ts', code: `await import('@ap/menu-improvement-items/analysis-actions');`, rule: 'ap/restricted-import-source' },
  { file: 'platform/home/src/pages/Home.tsx', code: `import { x } from '@ap/menu-improvement-items/analysis-actions';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/pages/Home.tsx', code: `await import('@ap/menu-improvement-items/analysis-actions');`, rule: 'ap/restricted-import-source' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-improvement-items/analysis-actions/x';`, rule: 'no-restricted-imports' },
);

// The Round tab (#1475): the app joins menu-log-analysis's body to menu-log-models's slot in main.tsx only; the menus never import each other, and no other app file or subpath is open.
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { RoundSourceView } from '@ap/menu-log-analysis/view';`, rule: '' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { setRoundSourceView } from '@ap/menu-log-models/round-source-slot';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { RoundSourceView } from '@ap/menu-log-analysis/view';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { setRoundSourceView } from '@ap/menu-log-models/round-source-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/menu-log-analysis/src/view';`, rule: 'no-restricted-imports' },
  { file: 'menus/log-dev/log-models/src/pages/LifecyclePage.tsx', code: `import { RoundSourceView } from '@ap/menu-log-analysis/view';`, rule: 'no-restricted-imports' },
  { file: 'menus/log-dev/log-analysis/src/view.tsx', code: `import { setRoundSourceView } from '@ap/menu-log-models/round-source-slot';`, rule: 'no-restricted-imports' },
);
// The home 내 할 일 slot is main.tsx-only too (#657); `src/slots.ts` receives the value as a parameter.
rows.push(
  { file: 'apps/platform-web/src/main.tsx', code: `import { homeTodoSlot } from '@ap/feature-bridge/home-todo-slot';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { homeTodoSlot } from '@ap/feature-bridge/home-todo-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/home-todo-slot';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { scopeControlSlot } from '@ap/feature-bridge/scope-control';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { scopeControlSlot } from '@ap/feature-bridge/scope-control';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/scope-control';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { navCountsSlot } from '@ap/feature-bridge/nav-counts';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { navCountsSlot } from '@ap/feature-bridge/nav-counts';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/nav-counts';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { savedViewsSlot } from '@ap/feature-bridge/saved-views';`, rule: '' },
  { file: 'apps/platform-web/src/slots.ts', code: `import { savedViewsSlot } from '@ap/feature-bridge/saved-views';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { x } from '@ap/feature-bridge/src/saved-views';`, rule: 'no-restricted-imports' },
);

// The feature-bridge menu test harness (#951): `kernel/testing` for exactly `packages/adapters/feature-bridge/src/testing.tsx`; `@ap/feature-bridge/testing` for bridge-menu test and test-support files only.
rows.push(
  { file: `${FEATURE_PKG}/testing.tsx`, code: `import { testAdapter } from '@ap/kernel/testing';`, rule: '' },
  { file: `${FEATURE_PKG}/testing.tsx`, code: `const m = await import('@ap/kernel/testing');`, rule: '' },
  { file: `${FEATURE_PKG}/feature/FeatureScreenPage.tsx`, code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: `${FEATURE_PKG}/feature/FeatureScreenPage.tsx`, code: `const m = await import('@ap/kernel/testing');`, rule: 'ap/restricted-import-source' },
  { file: `${FEATURE_PKG}/index.ts`, code: `import { testAdapter } from '@ap/kernel/testing';`, rule: 'no-restricted-imports' },
  { file: 'platform/voc/src/test-support.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: '' },
  { file: 'platform/voc/src/pages/x.test.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: '' },
  { file: 'platform/voc/src/pages/x.test.tsx', code: `const m = await import('@ap/feature-bridge/testing');`, rule: '' },
  { file: 'platform/voc/src/pages/FeatureInbox.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
  { file: 'platform/voc/src/pages/FeatureInbox.tsx', code: `const m = await import('@ap/feature-bridge/testing');`, rule: 'ap/restricted-import-source' },
  { file: BRIDGE, code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/pages/x.test.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
  { file: 'platform/home/src/test-support.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/menus.ts', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
  { file: 'apps/platform-web/src/main.tsx', code: `import { createFeatureMenuHarness } from '@ap/feature-bridge/testing';`, rule: 'no-restricted-imports' },
);

rows.push(
  { file: 'packages/sdk/ui/src/x.ts', code: `import { x } from '@ap/feature-shared';`, rule: 'no-restricted-imports', token: '@ap/ui' },
  { file: 'packages/sdk/ui/src/x.ts', code: `void import('@ap/feature-shared');`, rule: 'ap/restricted-import-source', token: '@ap/ui' },
);

// #228 design-system rules (options mirror feature .oxlintrc.json). Shared components may style their own markup
// but not restyle a primitive they import (#236 review).
const COMPONENT_FILE = 'packages/sdk/components/src/X.tsx';
rows.push(
  { file: COMPONENT_FILE, code: `import { Input } from '@ap/ui';\nexport const X = () => <Input className="rounded-pill bg-accent-primary" />;`, rule: 'shadcn/no-restyle' },
  { file: COMPONENT_FILE, code: `export const X = () => <section className="rounded-md bg-surface-card p-3 text-xs" />;`, rule: '' },
  { file: COMPONENT_FILE, code: `import { DialogHeader } from '@ap/ui';\nexport const X = () => <DialogHeader className="px-4" />;`, rule: '' },
  { file: COMPONENT_FILE, code: `import { TabsList } from '@ap/ui';\nexport const X = () => <TabsList className="px-4" />;`, rule: 'shadcn/no-restyle' },
  // ADR-0023 accessibility floor: the control boundary and the aria-disabled look are the only non-layout classes kept.
  { file: COMPONENT_FILE, code: `import { Checkbox } from '@ap/ui';\nexport const X = () => <Checkbox className="border-border-control" />;`, rule: '' },
  { file: COMPONENT_FILE, code: `import { Checkbox } from '@ap/ui';\nexport const X = () => <Checkbox className="border-border-strong" />;`, rule: 'shadcn/no-restyle' },
  { file: COMPONENT_FILE, code: `import { Button } from '@ap/ui';\nexport const X = () => <Button className="aria-disabled:opacity-50 aria-disabled:pointer-events-none" />;`, rule: '' },
  { file: COMPONENT_FILE, code: `import { Button } from '@ap/ui';\nexport const X = () => <Button className="text-xs" />;`, rule: 'shadcn/no-restyle' },
  { file: COMPONENT_FILE, code: `import { DropdownMenuItem } from '@ap/ui';\nexport const X = () => <DropdownMenuItem className="focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring" />;`, rule: '' },
  { file: COMPONENT_FILE, code: `import { DropdownMenuRadioItem } from '@ap/ui';\nexport const X = () => <DropdownMenuRadioItem value="a" className="focus:bg-accent-primary-soft" />;`, rule: 'shadcn/no-restyle' },
  { file: MENU.replace('x.tsx', 'X.tsx'), code: `export const X = () => <div className="w-[320px]" />;`, rule: '' },
  { file: MENU.replace('x.tsx', 'X.tsx'), code: `export const X = () => <div className="text-[12px]" />;`, rule: 'shadcn/no-arbitrary-values' },
  { file: MENU.replace('x.tsx', 'X.tsx'), code: `const TONE = 'text-red-500';\nexport const X = () => <div className={TONE} />;`, rule: 'shadcn/no-raw-colors' },
  // Review follow-up (2026-10-22): class constants in .ts files are checked too (not only .tsx), every UI preset.
  { file: 'platform/home/src/tone.ts', code: `export const TONE = 'text-red-500';`, rule: 'shadcn/no-raw-colors' },
  { file: 'packages/sdk/shell/src/chip.ts', code: `export const CHIP = 'text-[12px]';`, rule: 'shadcn/no-arbitrary-values' },
  { file: 'packages/sdk/components/src/tone.ts', code: `export const TONE = 'bg-red-500';`, rule: 'shadcn/no-raw-colors' },
  { file: 'apps/platform-web/src/tone.ts', code: `export const TONE = 'bg-surface-card text-xs';`, rule: '' },
  { file: 'packages/sdk/shell/src/chip.test.ts', code: `export const CHIP = 'text-[12px]';`, rule: '' },
  { file: 'packages/sdk/ui/src/theme/tokens.generated.ts', code: `export const T = ['text-primary'];`, rule: '' },
  // The --color-* variable shorthand bypasses both color rules; local layout variables stay allowed.
  { file: MENU.replace('x.tsx', 'X.tsx'), code: `export const X = () => <div className="bg-(--color-red-500)" />;`, rule: 'ap/no-color-var-shorthand' },
  { file: 'packages/sdk/shell/src/chip.ts', code: 'export const C = `hover:text-(--color-accent-primary)`;', rule: 'ap/no-color-var-shorthand' },
  { file: 'packages/sdk/shell/src/rail.ts', code: `export const W = 'w-(--rail-width)';`, rule: '' },
  // Radix primitives are wrapped once in @ap/ui (ADR-0046).
  { file: 'packages/sdk/ui/src/x.ts', code: `import * as Dialog from '@radix-ui/react-dialog';\nexport { Dialog };`, rule: '' },
  { file: 'packages/sdk/components/src/x.ts', code: `import * as Dialog from '@radix-ui/react-dialog';\nexport { Dialog };`, rule: 'no-restricted-imports', token: '@radix-ui' },
  { file: 'platform/home/src/x.ts', code: `import { Slot } from '@radix-ui/react-slot';\nexport { Slot };`, rule: 'no-restricted-imports', token: '@radix-ui' },
  // React layers: Rules of Hooks (error) and effect dependencies (error); non-React layers do not load the plugin.
  { file: 'packages/sdk/kernel/src/x.ts', code: `import { useState } from 'react';\nexport function f(on: boolean) { if (on) useState(0); }`, rule: 'react-hooks/rules-of-hooks' },
  { file: MENU.replace('x.tsx', 'X.tsx'), code: `import { useEffect } from 'react';\nexport function X({ n }: { n: number }) { useEffect(() => { void n; }, []); return null; }`, rule: 'react-hooks/exhaustive-deps' },
  { file: 'packages/sdk/contracts/src/x.ts', code: `export function f(on: boolean) { return on; }`, rule: '' },
  // A disable comment that suppresses nothing fails.
  { file: 'packages/sdk/kernel/src/x.ts', code: `// eslint-disable-next-line no-console\nexport const n = 1;`, rule: null, token: 'Unused eslint-disable' },
);

// #1640: vi.mock-style calls name a module path like an import, so the boundary rules apply to their first string argument.
const MENU_TEST = 'platform/home/src/pages/x.test.tsx';
const VITEST_CALLEES = ['mock', 'doMock', 'unmock', 'doUnmock', 'importActual', 'importMock'];
for (const callee of VITEST_CALLEES) {
  rows.push(
    // a deep SDK-private path (the import rule's deep-subpath ban)
    { file: MENU_TEST, code: `vi.${callee}('@ap/components/src/chart/AnalysisChartFrame');`, rule: 'ap/restricted-import-source' },
    // a node_modules path, bare and relative
    { file: MENU_TEST, code: `vi.${callee}('node_modules/echarts/core.js');`, rule: 'ap/restricted-import-source' },
    { file: MENU_TEST, code: `vi.${callee}('./node_modules/echarts/core.js');`, rule: 'ap/restricted-import-source' },
    // a relative path that leaves the package
    { file: MENU_TEST, code: `vi.${callee}('../../../../packages/sdk/contracts/src/url');`, rule: 'ap/no-relative-package-escape' },
    // legal: a public entry, a package outside the layer ban, a same-package relative path
    { file: MENU_TEST, code: `vi.${callee}('@ap/components');`, rule: '' },
    { file: MENU_TEST, code: `vi.${callee}('./Local');`, rule: '' },
    { file: MENU_TEST, code: `vi.${callee}('../x');`, rule: '' },
    // static computed members are the same call
    { file: MENU_TEST, code: `vi['${callee}']('@ap/components/src/chart/AnalysisChartFrame');`, rule: 'ap/restricted-import-source' },
    { file: MENU_TEST, code: `vi['${callee}']('./node_modules/echarts/core.js');`, rule: 'ap/restricted-import-source' },
    { file: MENU_TEST, code: `vi['${callee}']('../../../../packages/sdk/contracts/src/url');`, rule: 'ap/no-relative-package-escape' },
    { file: MENU_TEST, code: 'vi[`${callee}`](\'../../../../packages/sdk/contracts/src/url\');'.replace('${callee}', callee), rule: 'ap/no-relative-package-escape' },
    { file: MENU_TEST, code: `vi['${callee}']('@ap/components');`, rule: '' },
    { file: MENU_TEST, code: `vi['${callee}']('./Local');`, rule: '' },
  );
}
// Not a vitest module call: another object, a member chosen at run time, and a non-string argument are left alone.
rows.push(
  { file: MENU_TEST, code: `vi[name]('@ap/components/src/chart/AnalysisChartFrame');`, rule: '' },
  { file: MENU_TEST, code: `other.mock('@ap/components/src/chart/AnalysisChartFrame');`, rule: '' },
  { file: MENU_TEST, code: `vi.mock(path);`, rule: '' },
);

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

  it.each([
    ['src/x.ts', `import { Screen } from './Screen';`, ''],
    ['src/deep/x.ts', `import { Screen } from '../Screen';`, ''],
    ['src/x.ts', `import { x } from '../../escape';`, 'ap/no-relative-package-escape'],
    ['src/x.ts', `export * from '../../../../packages/sdk/contracts/src/url';`, 'ap/no-relative-package-escape'],
    ['src/x.ts', `import { x } from '@ap/kernel';`, 'no-restricted-imports'],
    ['src/x.ts', `import { readColorToken } from '@ap/ui/theme';`, ''],
    ['src/x.ts', `import tokens from '@ap/ui/theme-tokens.json';`, ''],
    ['src/x.ts', `import tokens from '@ap/ui/src/styles/tokens.css';`, 'no-restricted-imports'],
  ])('hostModule in a non-platform-scope package: %s %s', async (file, code, rule) => {
    const messages = await lintExternal(file, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual(rule === '' ? [] : [rule]);
  });

  it.each([
    [`${SHELL_FIXTURE_DIR}/x.ts`, `import { usePlatform } from '@ap/kernel';`, 'no-restricted-imports'],
    [`${SHELL_FIXTURE_DIR}/x.ts`, `import { StateMessage } from '@ap/components';`, 'no-restricted-imports'],
    [`${SHELL_FIXTURE_DIR}/x.ts`, `import { RouteOutlet } from '../../RouteOutlet';`, 'ap/no-relative-package-escape'],
    [`${SHELL_FIXTURE_DIR}/deep/x.ts`, `export * from '../../../ModuleScreen';`, 'ap/no-relative-package-escape'],
    [`${SHELL_FIXTURE_DIR}/x.ts`, 'void import(`@ap/kernel`);', 'ap/restricted-import-source'],
    [`${SHELL_FIXTURE_DIR}/x.ts`, 'void import(`../../RouteOutlet`);', 'ap/no-relative-package-escape'],
    [`${SHELL_FIXTURE_DIR}/x.ts`, 'void import(`./manifest`);', ''],
    [`${SHELL_FIXTURE_DIR}/x.ts`, `import type { ModuleHost } from '@ap/contracts';`, ''],
    [`${SHELL_FIXTURE_DIR}/x.ts`, `import { manifest } from './manifest';`, ''],
    [`${SHELL_FIXTURE_DIR}/deep/x.ts`, `import { manifest } from '../manifest';`, ''],
    ['src/x.ts', `import { usePlatform } from '@ap/kernel';`, ''],
    ['src/x.ts', `import { ListScreen } from './__fixtures__/module-fixture';`, ''],
  ])('hostModuleDir on the shell fixture module: %s %s', async (file, code, rule) => {
    const messages = await lintShellFixture(file, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual(rule === '' ? [] : [rule]);
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

// ADR-0086 decision 13: the Kernel's query engine and the feature bridge's client share one lockfile entry; bump both together.
describe('query engine version lock', () => {
  it('pins the same exact @tanstack/react-query in kernel and feature-bridge', async () => {
    const version = async (pkg: string) => {
      const manifest = JSON.parse(await readFile(path.join(REPO_ROOT, 'packages', pkg, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
      return manifest.dependencies?.['@tanstack/react-query'];
    };
    const kernelVersion = await version('sdk/kernel');
    expect(kernelVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(await version('adapters/feature-bridge')).toBe(kernelVersion);
  });
});

// Identity boundaries survive the move into the unrestricted app namespace.
describe('feature identities', () => {
  it.each(['@ap/platform-api', '@ap/feature-screens', '@ap/feature-shared', '@ap/feature-ui', '@ap/platform-api-ops'])('rejects %s roots and subpaths in every import form', async (source) => {
    for (const entry of [source, `${source}/public`]) {
      for (const code of [`import { x } from '${entry}';`, `void import('${entry}');`, `type X = import('${entry}').X;`, `const x = require('${entry}');`]) {
        expect((await lint('apps/platform-web/src/menus.ts', code)).length).toBeGreaterThan(0);
      }
    }
  });
  it.each(['@ap/platform-api-extra', '@ap/feature-screens-extra', '@ap/feature-shared-extra', '@ap/feature-ui-extra', '@ap/platform-api-ops-extra'])('allows near neighbor %s in app', async (source) => {
    expect(await lint('apps/platform-web/src/menus.ts', `import { x } from '${source}'; void import('${source}');`)).toEqual([]);
  });
});

// --- EV (packages/eqv/<name>, @eqv/*): the ban outside the host slot and the three EV presets (#1612, ADR-0132, ADR-0128) ---
const importForms = (source: string) => [
  { form: 'static', code: `import { x } from '${source}';`, rule: 'no-restricted-imports' },
  { form: 'export-from', code: `export { x } from '${source}';`, rule: 'no-restricted-imports' },
  { form: 'export-star', code: `export * from '${source}';`, rule: 'no-restricted-imports' },
  { form: 'type', code: `import type { X } from '${source}';`, rule: 'no-restricted-imports' },
  { form: 'dynamic', code: `export const dep = await import('${source}');`, rule: 'ap/restricted-import-source' },
  { form: 'import-type', code: `export type Dep = import('${source}').Dep;`, rule: 'ap/restricted-import-source' },
  { form: 'require', code: `const x = require('${source}');`, rule: 'ap/restricted-import-source' },
];

describe('EV ban outside the host slot', () => {
  const BANNED_FILES = [
    'packages/sdk/contracts/src/x.ts', 'packages/sdk/contract-schemas/src/x.ts', 'packages/sdk/ui/src/x.ts', 'packages/sdk/kernel/src/x.ts',
    'packages/sdk/components/src/x.ts', 'packages/sdk/shell/src/x.ts', 'packages/adapters/mock-server/src/x.ts', 'packages/adapters/http-adapter/src/x.ts',
    'packages/adapters/server-conformance/src/x.ts', 'packages/adapters/feature-bridge/src/x.ts', 'modules/fixture/src/x.ts',
    MENU, 'menus/mars/analytics/src/x.ts', 'platform/my-activity/src/pages/x.tsx', 'platform/my-activity/src/mock/x.ts',
  ];
  it.each(BANNED_FILES.flatMap((file) => importForms('@eqv/core').map((f) => ({ file, ...f }))))('$file rejects @eqv/core ($form)', async ({ file, code, rule }) => {
    const messages = await lint(file, code);
    const dump = JSON.stringify(messages, null, 2);
    expect(messages.filter((m) => m.ruleId === rule && m.message.includes('ADR-0132')).length, dump).toBeGreaterThan(0);
  });

  const FEATURE: [string, Linter.Config[]][] = [
    ['apps/platform-api', featureServerPreset], ['packages/feature-shared', featureSharedPreset],
    ['packages/feature-ui', featureUiPreset], ['apps/feature-screens', featureScreensPreset],
  ];
  it.each(FEATURE.flatMap(([dir, preset]) => importForms('@eqv/ui/sub').map((f) => ({ dir, preset, ...f }))))('$dir rejects @eqv/ui/sub ($form)', async ({ dir, preset, code, rule }) => {
    const cwd = path.join(REPO_ROOT, dir);
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: preset });
    const [result] = await eslint.lintText(code, { filePath: path.join(cwd, 'src/x.ts') });
    const messages = result?.messages ?? [];
    expect(messages.filter((m) => m.ruleId === rule && m.message.includes('ADR-0132')).length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  });

  // The server alone may use @eqv/core (ADR-0135): the other three feature packages still reject it.
  it.each(FEATURE.filter(([dir]) => dir !== 'apps/platform-api').flatMap(([dir, preset]) => ['js', 'mjs'].map((ext) => ({ dir, preset, ext }))))('$dir rejects @eqv/core in a .$ext file (static, dynamic)', async ({ dir, preset, ext }) => {
    const cwd = path.join(REPO_ROOT, dir);
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: preset });
    for (const [code, rule] of [[`import '@eqv/core';`, 'no-restricted-imports'], [`void import('@eqv/core');`, 'ap/restricted-import-source']] as const) {
      const [result] = await eslint.lintText(code, { filePath: path.join(cwd, `scripts/x.${ext}`) });
      const messages = result?.messages ?? [];
      expect(messages.some((m) => m.ruleId === rule && m.message.includes('ADR-0132')), JSON.stringify(messages, null, 2)).toBe(true);
    }
  });

  it.each(importForms('@eqv/core'))('apps/platform-api allows @eqv/core ($form) and nothing else of EV', async ({ code }) => {
    const cwd = path.join(REPO_ROOT, 'apps/platform-api');
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: featureServerPreset });
    const [result] = await eslint.lintText(code, { filePath: path.join(cwd, 'src/x.ts') });
    expect((result?.messages ?? []).filter((m) => m.message.includes('ADR-0132')), code).toEqual([]);
  });
  it.each(['@eqv/renderer', '@eqv/platform-adapter', '@eqv/ui'].flatMap((source) => importForms(source)))('apps/platform-api rejects other EV packages ($form)', async ({ code, rule }) => {
    const cwd = path.join(REPO_ROOT, 'apps/platform-api');
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: featureServerPreset });
    const [result] = await eslint.lintText(code, { filePath: path.join(cwd, 'src/x.ts') });
    expect((result?.messages ?? []).some((m) => m.ruleId === rule && m.message.includes('ADR-0132'))).toBe(true);
  });

  it.each(['@eqv/platform-adapter', '@eqv/platform-adapter/manifest'])('apps/platform-web modules.ts keeps %s (static, dynamic, type)', async (source) => {
    for (const code of [`import { x } from '${source}';`, `void import('${source}');`, `type X = import('${source}').X;`]) {
      expect(await lint('apps/platform-web/src/modules.ts', code), code).toEqual([]);
    }
  });
  it.each(['@eqv/core', '@eqv/ui', '@eqv/platform-adapter/other'].flatMap((source) => importForms(source)))('apps/platform-web rejects what it does not use today ($form)', async ({ code, rule }) => {
    const messages = await lint('apps/platform-web/src/modules.ts', code);
    expect(messages.some((m) => m.ruleId === rule && m.message.includes('ADR-0132')), JSON.stringify(messages, null, 2)).toBe(true);
  });
  it.each(['@eqv-extra/x', '@eqv/uix', '@eqv/platform-adapter-extra', '@eqvx/core', '@eqv/unknown'])('near neighbour %s is not an EV identity', async (source) => {
    for (const file of ['packages/sdk/kernel/src/x.ts', 'apps/platform-web/src/modules.ts', 'platform/my-activity/src/pages/x.tsx']) {
      const messages = await lint(file, `import { x } from '${source}'; void import('${source}');`);
      expect(messages.filter((m) => m.message.includes('ADR-0132')), file).toEqual([]);
    }
  });
});

const EQV_FIXTURE = path.join(HERE, 'fixtures', 'eqv-depth');
/** An EV preset on a real manifest tree: packages/eqv/<name> sits one level deeper than packages/<name>. */
async function lintEqv(preset: Linter.Config[], relFile: string, code: string, cwd = EQV_FIXTURE): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: preset });
  const [result] = await eslint.lintText(code, { filePath: path.join(cwd, relFile) });
  return result?.messages ?? [];
}
const CORE = 'packages/eqv/core/src/x.ts';
const RENDERER = 'packages/eqv/renderer/src/x.ts';

describe('eqvCore (core, renderer)', () => {
  it.each(['@ap/ui', '@ap/kernel', '@ap/contracts', '@ap/ui/theme'].flatMap((source) => [CORE, RENDERER].flatMap((file) => importForms(source).map((f) => ({ file, source, ...f })))))('$file rejects $source ($form)', async ({ file, code, rule }) => {
    const messages = await lintEqv(eqvCore, file, code);
    expect(messages.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
    expect(messages.every((m) => m.ruleId === rule), JSON.stringify(messages, null, 2)).toBe(true);
  });
  it.each(importForms('@eqv/ui'))('renderer rejects @eqv/ui ($form)', async ({ code, rule }) => {
    const messages = await lintEqv(eqvCore, RENDERER, code);
    expect(messages.map((m) => m.ruleId)).toEqual([rule]);
    expect(messages[0]?.message).toContain('@eqv/core');
  });
  it.each(['@eqv/replay', '@eqv/views', '@eqv/platform-adapter', '@eqv/ui/sub'])('core and renderer reject sibling %s', async (source) => {
    for (const file of [CORE, RENDERER]) expect((await lintEqv(eqvCore, file, `import { x } from '${source}';`)).map((m) => m.ruleId)).toEqual(['no-restricted-imports']);
  });
  it.each([
    [RENDERER, `import { x } from '@eqv/core';`],
    [RENDERER, `void import('@eqv/core'); type X = import('@eqv/core').X;`],
    [RENDERER, `import x from 'apple'; import('@apx/kernel');`],
    [CORE, `import { y } from './y'; export * from '../src/z';`],
    [CORE, `import { x } from 'react';`],
  ])('allows %s: %s', async (file, code) => {
    const messages = await lintEqv(eqvCore, file, code);
    expect(messages, JSON.stringify(messages, null, 2)).toEqual([]);
  });
  it('stays design-system-free', async () => {
    const messages = await lintEqv(eqvCore, 'packages/eqv/renderer/src/x.tsx', 'export const X = () => <div style={{ color: "red" }} />;');
    expect(messages).toEqual([]);
  });
});

describe('eqvUi (ui, replay, views, editor)', () => {
  const UI_FILES = ['ui', 'replay', 'views', 'editor'].map((n) => `packages/eqv/${n}/src/x.ts`);
  it.each(UI_FILES.flatMap((file) => ['@ap/kernel', '@ap/contracts', '@ap/components', '@ap/shell', '@ap/ui/src/index'].flatMap((source) => importForms(source).map((f) => ({ file, source, ...f })))))('$file rejects $source ($form)', async ({ file, code, rule }) => {
    const messages = await lintEqv(eqvUi, file, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual([rule]);
  });
  it.each(UI_FILES.flatMap((file) => ['@ap/ui', '@ap/ui/theme', '@ap/ui/styles.css', '@eqv/core', '@eqv/ui'].map((source) => ({ file, source }))))('$file allows $source', async ({ file, source }) => {
    const messages = await lintEqv(eqvUi, file, `import { x } from '${source}'; void import('${source}'); type X = import('${source}').X;`);
    expect(messages, JSON.stringify(messages, null, 2)).toEqual([]);
  });
  it.each(UI_FILES.flatMap((file) => ['@eqv/platform-adapter', '@eqv/platform-adapter/manifest', '@eqv/platform-adapter/mock-data'].map((source) => ({ file, source }))))('rejects $source from $file: only the adapter reads the host port', async ({ file, source }) => {
    const messages = await lintEqv(eqvUi, file, `import { x } from '${source}';`);
    expect(messages.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  });
  it.each(['@eqv-extra/x', '@eqv/uix'])('near neighbour %s is not an EV identity', async (source) => {
    expect(await lintEqv(eqvUi, 'packages/eqv/ui/src/x.ts', `import { x } from '${source}';`)).toEqual([]);
  });
});

describe('eqvHost (platform-adapter)', () => {
  const ADAPTER = 'packages/eqv/platform-adapter/src/x.ts';
  it.each(['@ap/kernel', '@ap/components', '@ap/shell', '@ap/menu-home'].flatMap((source) => importForms(source).map((f) => ({ source, ...f }))))('rejects $source ($form)', async ({ code, rule }) => {
    const messages = await lintEqv(eqvHost, ADAPTER, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual([rule]);
  });
  it.each(['@ap/contracts', '@ap/ui', '@ap/ui/styles.css', '@eqv/core', '@eqv/views', '@eqv/replay'])('allows %s', async (source) => {
    const messages = await lintEqv(eqvHost, ADAPTER, `import { x } from '${source}'; void import('${source}'); type X = import('${source}').X;`);
    expect(messages, JSON.stringify(messages, null, 2)).toEqual([]);
  });
});

// ap/no-relative-package-escape at the packages/eqv/<name> depth: the manifest at that depth owns the file.
describe('relative escape at packages/eqv/<name>', () => {
  it.each([
    ['core', eqvCore, `import { y } from './y';`, []],
    ['core', eqvCore, `import { y } from '../../core/src/y';`, []],
    ['core', eqvCore, `import { y } from '../../renderer/src/y';`, ['ap/no-relative-package-escape']],
    ['core', eqvCore, `export * from '../../../ui/src/y';`, ['ap/no-relative-package-escape']],
    ['core', eqvCore, `import { y } from '../../../../../escape';`, ['ap/no-relative-package-escape']],
    ['core', eqvCore, 'void import(`../../../ui/src/y`);', ['ap/no-relative-package-escape']],
    ['core', eqvCore, `type X = import('../../../ui/src/y').X;`, ['ap/no-relative-package-escape']],
    ['ui', eqvUi, `import { y } from '../../replay/src/y';`, ['ap/no-relative-package-escape']],
    ['platform-adapter', eqvHost, `import { y } from '../../core/src/y';`, ['ap/no-relative-package-escape']],
    ['platform-adapter', eqvHost, `import { y } from './y';`, []],
  ] as const)('%s: %s', async (name, preset, code, expected) => {
    const messages = await lintEqv(preset as Linter.Config[], `packages/eqv/${name}/src/x.ts`, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual(expected);
  });
  it('names the owning package, so the extra depth resolves to @eqv/core', async () => {
    const messages = await lintEqv(eqvCore, CORE, `import { y } from '../../renderer/src/y';`);
    expect(messages[0]?.message).toContain("escapes package '@eqv/core'");
  });
  it('findOwningPackage walks up to the packages/eqv/<name> manifest', async () => {
    const { findOwningPackage } = await import('./relative-escape.js');
    expect(findOwningPackage(path.join(EQV_FIXTURE, 'packages/eqv/core/src/deep'))).toEqual({ root: path.join(EQV_FIXTURE, 'packages/eqv/core'), name: '@eqv/core' });
  });
});

// Ported from EV's eslint-boundary.test.ts (verbatim cases, EV paths mapped: packages/core -> eqvCore, packages/platform-adapter -> eqvHost,
// packages/ui|replay|editor|views -> eqvUi). Retired: the six 'analytics-platform/menus' cases and the 'apple'/'@apx' guard is kept.
describe('ported from EV eslint-boundary', () => {
  const run = (preset: Linter.Config[], name: string, code: string) => lintEqv(preset, `packages/eqv/${name}/src/x.tsx`, code);
  it.each([
    [eqvCore, 'core', `import x from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvCore, 'core', `export { x } from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvCore, 'core', `export * from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvCore, 'core', `export const dep = await import('@ap/kernel');`, 'ap/restricted-import-source'],
    [eqvCore, 'core', `export type Dep = import('@ap/kernel').Dep;`, 'ap/restricted-import-source'],
    [eqvCore, 'core', `const x = require('@ap/kernel');`, 'ap/restricted-import-source'],
    [eqvHost, 'platform-adapter', `import x from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvHost, 'platform-adapter', `import x from '@ap/components';`, 'no-restricted-imports'],
    [eqvHost, 'platform-adapter', `export const dep = await import('@ap/kernel');`, 'ap/restricted-import-source'],
    [eqvHost, 'platform-adapter', `export type Dep = import('@ap/components').Dep;`, 'ap/restricted-import-source'],
    [eqvHost, 'platform-adapter', `import { defineEndpoint } from '@ap/contracts';`, ''],
    [eqvHost, 'platform-adapter', `import type { Text } from '@ap/contracts/i18n';`, 'no-restricted-imports'],
    [eqvHost, 'platform-adapter', `import { Button } from '@ap/ui';`, ''],
    [eqvHost, 'platform-adapter', `export const dep = await import('@ap/contracts');`, ''],
    [eqvHost, 'platform-adapter', `export type Dep = import('@ap/ui').ButtonProps;`, ''],
    [eqvUi, 'ui', `import { defineEndpoint } from '@ap/contracts';`, 'no-restricted-imports'],
    [eqvCore, 'core', `import { Button } from '@ap/ui';`, 'no-restricted-imports'],
    [eqvCore, 'renderer', `export const dep = await import('@ap/ui');`, 'ap/restricted-import-source'],
    [eqvCore, 'renderer', `export type T = import('@ap/ui').ButtonProps;`, 'ap/restricted-import-source'],
    [eqvCore, 'renderer', `import x from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvUi, 'replay', `import { Button } from '@ap/ui';`, ''],
    [eqvCore, 'core', `import { DataTable } from '@eqv/ui';`, 'no-restricted-imports'],
    [eqvCore, 'renderer', `export const dep = await import('@eqv/ui');`, 'ap/restricted-import-source'],
    [eqvUi, 'replay', `import { DataTable } from '@eqv/ui';`, ''],
    [eqvUi, 'replay', `import x from '@ap/kernel';`, 'no-restricted-imports'],
    [eqvUi, 'editor', `export type Dep = import('@ap/contracts').Dep;`, 'ap/restricted-import-source'],
    [eqvUi, 'views', `import { defineEndpoint } from '@ap/contracts';`, 'no-restricted-imports'],
    [eqvUi, 'ui', `export const dep = await import('@ap/ui');`, ''],
    [eqvCore, 'core', `import x from 'apple'; import('@apx/kernel');`, ''],
  ] as const)('%#: %s %s', async (preset, name, code, rule) => {
    const messages = await run(preset as Linter.Config[], name, code);
    expect(messages.map((m) => m.ruleId), JSON.stringify(messages, null, 2)).toEqual(rule === '' ? [] : [rule]);
  });
});

// Ported from EV's design-lint.test.ts: @ap/ui's designSystem preset covers every case; they run on a virtual path under the repo root (theme from the root components.json).
describe('ported from EV design-lint', () => {
  const shadcnRules = async (preset: Linter.Config[], file: string, code: string) =>
    (await lintEqv(preset, file, code, REPO_ROOT)).flatMap((m) => (m.ruleId?.startsWith('shadcn/') ? [m.ruleId] : []));
  it.each([
    ['packages/eqv/replay/src/x.tsx', 'export const X = () => <div style={{ color: "red" }} />;', ['shadcn/no-inline-styles']],
    ['packages/eqv/editor/src/x.tsx', 'export const X = () => <div className="bg-red-500" />;', ['shadcn/no-raw-colors']],
    ['packages/eqv/views/src/x.tsx', 'export const X = () => <div className="eqv-made-up" />;', ['shadcn/no-unknown-classes']],
    ['packages/eqv/views/src/x.tsx', 'export const X = () => <div className="flex gap-2 text-text-secondary" />;', []],
    ['packages/eqv/replay/src/x.tsx', 'import { Button } from "@ap/ui"; export const X = () => <Button className="bg-surface-card">x</Button>;', ['shadcn/no-restyle']],
    ['packages/eqv/views/src/x.tsx', 'import { DataTable } from "@eqv/ui"; export const X = () => <DataTable className="bg-surface-card" label="x" columns={[]}>{null}</DataTable>;', ['shadcn/no-restyle']],
    ['packages/eqv/editor/src/x.tsx', 'export const X = () => <div className="p-[13px]" />;', ['shadcn/no-arbitrary-values']],
    ['packages/eqv/views/src/x.tsx', 'import { Button } from "@ap/ui"; export const X = ({ c }: { c: string }) => <Button className={`mt-${c}`}>x</Button>;', ['shadcn/require-static-classes']],
  ])('eqvUi %s: %s', async (file, code, expected) => {
    expect(await shadcnRules(eqvUi, file, code)).toEqual(expected);
  });
  it('eqvHost applies the design-system rules to platform-adapter', async () => {
    expect(await shadcnRules(eqvHost, 'packages/eqv/platform-adapter/src/x.tsx', 'export const X = () => <div className="bg-red-500" />;')).toEqual(['shadcn/no-raw-colors']);
  });
  it('eqvCore stays design-system-free', async () => {
    expect(await shadcnRules(eqvCore, 'packages/eqv/renderer/src/x.tsx', 'export const X = () => <div style={{ color: "red" }} />;')).toEqual([]);
  });
});

describe('bridge entry list (#1640)', () => {
  it('reads the entries from feature-screens exports, without the style entry', () => {
    const subpaths = featureBridgeEntrySubpaths();
    expect(subpaths.length).toBeGreaterThan(0);
    expect(subpaths.filter((sub) => sub.endsWith('.css'))).toEqual([]);
    expect(subpaths).toContain('global-screens/core');
    expect(subpaths).toContain('operator-screens/log-datasets');
  });
});
