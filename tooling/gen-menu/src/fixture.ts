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

const groupIdLine = `export type GroupId = 'overview' | 'equipment' | 'masterData' | 'analytics' | 'metrics' | 'noticeVoc' | 'admin' | '${FIXTURE_GROUP}';`;

const menusTs = `import { Gauge, LayoutDashboard } from 'lucide-react';
// <gen:menu-imports>
import { manifests as home } from '${PACKAGE_PREFIX}menu-home';
// </gen:menu-imports>

export const GROUPS: GroupDef[] = [
  { id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge },
  { id: '${FIXTURE_GROUP}', label: { ko: '생성 확인', en: 'Gen probe' }, icon: LayoutDashboard },
  // </gen:menu-groups>
];

export const MENUS: MenuEntry[] = [
  // <gen:menu-spreads>
  ...home,
  // </gen:menu-spreads>
];
`;

/** The fixture menus.ts text, for marker-mutation variants. */
export const fixtureMenusTs = (): string => menusTs;

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
export function makeFixture(variants: { menusTs?: string; appPkg?: string } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-menu-test-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n  - menus/*\n  - tooling/*\n');
  mkdirSync(join(root, 'packages/contracts/src'), { recursive: true });
  writeFileSync(join(root, 'packages/contracts/src/menu.ts'), `${groupIdLine}\n`);
  mkdirSync(join(root, 'apps/platform-web/src'), { recursive: true });
  writeFileSync(join(root, 'apps/platform-web/src/menus.ts'), variants.menusTs ?? menusTs);
  writeFileSync(join(root, 'apps/platform-web/src/style.css'), styleCss);
  writeFileSync(join(root, 'apps/platform-web/package.json'), variants.appPkg ?? appPkg);
  mkdirSync(join(root, 'menus/metric-catalog/src'), { recursive: true });
  writeFileSync(join(root, 'menus/metric-catalog/src/index.ts'), existingMenuIndex);
  return root;
}

export const removeFixture = (root: string): void => rmSync(root, { recursive: true, force: true });

export const GEN_ARGS = ['--label-ko', '생성 확인', '--label-en', 'Gen probe'];
