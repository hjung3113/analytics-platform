import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_PREFIX } from './prefix.ts';

export const CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');

/** Walk up from this package for the real workspace root (committed locks run against the real repo). */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
}

export type CliResult = { status: number; stdout: string; stderr: string };

export function runCli(args: string[], root: string): CliResult {
  const res = spawnSync(process.execPath, [CLI_PATH, '--root', root, ...args], { encoding: 'utf8' });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** The three files the generator edits, as a path → bytes snapshot. */
export function appSnapshot(root: string): Record<string, string> {
  const paths = ['apps/platform-web/src/menus.ts', 'apps/platform-web/src/style.css', 'apps/platform-web/package.json'];
  return Object.fromEntries(paths.map(p => [p, readFileSync(join(root, p), 'utf8')]));
}

/** Files under menus/, relative to the workspace root, sorted. */
export function menusTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, base: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = base === '' ? e.name : `${base}/${e.name}`;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else out.push(`menus/${rel}`);
    }
  };
  const menusDir = join(root, 'menus');
  for (const e of readdirSync(menusDir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(menusDir, e.name), e.name);
    else out.push(`menus/${e.name}`);
  }
  return out.sort();
}

export const FIXTURE_GROUP = 'genProbe';
export const FIXTURE_FOLDER = 'gen-probe';

const SEVEN_GROUPS = ['overview', 'equipment', 'masterData', 'analytics', 'metrics', 'noticeVoc', 'admin'];

function fixtureGroupIdLine(extra: string[]): string {
  const members = [...SEVEN_GROUPS, FIXTURE_GROUP, ...extra];
  return `export type GroupId = ${members.map(g => `'${g}'`).join(' | ')};`;
}

function fixtureMenusTsText(extra: string[]): string {
  const extraRows = extra.map(g => `  { id: '${g}', label: { ko: 'g', en: 'g' }, icon: I },`).join('\n');
  return `import { Gauge, LayoutDashboard } from 'lucide-react';
import { createRegistry, type GroupDef, type MenuEntry } from '${PACKAGE_PREFIX}kernel';
// <gen:menu-imports>
import { manifests as home } from '${PACKAGE_PREFIX}menu-home';
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge },
  { id: '${FIXTURE_GROUP}', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },
${extraRows}
  // </gen:menu-groups>
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  // </gen:menu-spreads>
];

export const registry = createRegistry({ groups: GROUPS, menus: MENUS });
`;
}

/** The fixture menus.ts text, for marker-mutation variants. */
export const fixtureMenusTs = (): string => fixtureMenusTsText([]);

const styleCss = `@import "tailwindcss";
/* <gen:menu-styles> */
@import "${PACKAGE_PREFIX}menu-home/styles.css";
/* </gen:menu-styles> */
`;

const appPkg = `{
  "name": "fixture-app",
  "private": true,
  "dependencies": {
    "${PACKAGE_PREFIX}menu-home": "workspace:*",
    "${PACKAGE_PREFIX}mock-server": "workspace:*"
  }
}
`;

const existingMenuIndex = `export const manifests = [
  { id: 'metric-catalog', group: 'metrics', path: '/metrics/:metricId' },
];
`;

/** Temp workspace with genProbe already in GroupId and GROUPS, markers, and one existing menu. */
export function makeFixture(variants: { menusTs?: string; appPkg?: string; extraGroups?: string[]; existingMenuIndex?: string } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-menu-test-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - menus/*\n  - tooling/*\n');
  mkdirSync(join(root, 'packages/contracts/src'), { recursive: true });
  writeFileSync(join(root, 'packages/contracts/src/menu.ts'), `${fixtureGroupIdLine(variants.extraGroups ?? [])}\n`);
  mkdirSync(join(root, 'apps/platform-web/src'), { recursive: true });
  writeFileSync(join(root, 'apps/platform-web/src/menus.ts'), variants.menusTs ?? fixtureMenusTsText(variants.extraGroups ?? []));
  writeFileSync(join(root, 'apps/platform-web/src/style.css'), styleCss);
  writeFileSync(join(root, 'apps/platform-web/package.json'), variants.appPkg ?? appPkg);
  mkdirSync(join(root, 'menus/metric-catalog/src'), { recursive: true });
  writeFileSync(join(root, 'menus/metric-catalog/src/index.ts'), variants.existingMenuIndex ?? existingMenuIndex);
  return root;
}

export const removeFixture = (root: string): void => rmSync(root, { recursive: true, force: true });

export const GEN_ARGS = ['--label-ko', '생성 확인', '--label-en', 'Gen probe'];

/** The real apps/platform-web/package.json shape: preceding lines, full dependency block, followers. */
export const REAL_SHAPE_APP_PKG = `{
  "name": "${PACKAGE_PREFIX}platform-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "lint": "eslint .",
    "dev": "vite --host 127.0.0.1",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "${PACKAGE_PREFIX}components": "workspace:*",
    "${PACKAGE_PREFIX}contracts": "workspace:*",
    "${PACKAGE_PREFIX}kernel": "workspace:*",
    "${PACKAGE_PREFIX}menu-admin": "workspace:*",
    "${PACKAGE_PREFIX}menu-analytics": "workspace:*",
    "${PACKAGE_PREFIX}menu-equipment": "workspace:*",
    "${PACKAGE_PREFIX}menu-home": "workspace:*",
    "${PACKAGE_PREFIX}menu-master-data": "workspace:*",
    "${PACKAGE_PREFIX}menu-metrics": "workspace:*",
    "${PACKAGE_PREFIX}menu-notice-voc": "workspace:*",
    "${PACKAGE_PREFIX}mock-server": "workspace:*",
    "${PACKAGE_PREFIX}shell": "workspace:*",
    "${PACKAGE_PREFIX}ui": "workspace:*",
    "@fontsource-variable/inter": "^5.3.0",
    "@fontsource/noto-sans-kr": "^5.3.0",
    "lucide-react": "^1.48.0",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  }
}
`;
